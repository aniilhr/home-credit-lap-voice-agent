/**
 * HTTP handler for the console: static files plus a small JSON API that runs
 * the live LLM agent. No framework; Node's http module only.
 */

import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

import { validateConfig } from '../engine/conversation.js';
import { auditTurn } from '../llm/audit.js';
import { buildAgentRequest, parseAgentResult } from '../llm/agent.js';
import { LlmError } from '../llm/gemini.js';
import { trackState } from '../llm/tracker.js';
import { createInitialState } from '../engine/state.js';

/** Directories the browser may read. Server-side code under src/ is not exposed. */
const PUBLIC_PREFIXES = ['web/', 'prompts/', 'src/engine/', 'src/prompt/', 'src/scenarios/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const MAX_BODY_BYTES = 64 * 1024;
const MAX_TURNS = 120;
const MAX_TURN_CHARS = 2000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

async function readJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
}

function validateTranscript(transcript) {
  if (!Array.isArray(transcript)) throw new HttpError(400, 'transcript must be an array');
  if (transcript.length > MAX_TURNS) throw new HttpError(400, `transcript is limited to ${MAX_TURNS} turns`);
  for (const [i, turn] of transcript.entries()) {
    if (!turn || !['agent', 'customer'].includes(turn.role)) throw new HttpError(400, `transcript[${i}].role must be "agent" or "customer"`);
    if (typeof turn.text !== 'string' || !turn.text.trim()) throw new HttpError(400, `transcript[${i}].text must be a non-empty string`);
    if (turn.text.length > MAX_TURN_CHARS) throw new HttpError(400, `transcript[${i}].text is longer than ${MAX_TURN_CHARS} characters`);
  }
  if (transcript.length && transcript.at(-1).role !== 'customer') {
    throw new HttpError(400, 'the last transcript turn must be the customer');
  }
  return transcript.map((t) => ({ role: t.role, text: t.text.trim() }));
}

const CONFIG_KEYS = ['company_name', 'customer_name', 'agent_name', 'agent_gender', 'language_to_speak', 'additional_context_from_rag'];

function validateCallConfig(config) {
  if (!config || typeof config !== 'object') throw new HttpError(400, 'config is required');
  const clean = Object.fromEntries(CONFIG_KEYS.map((k) => [k, typeof config[k] === 'string' ? config[k].trim() : '']));
  const errors = validateConfig(clean);
  if (errors.length) throw new HttpError(400, errors.join('; '));
  if (clean.additional_context_from_rag.length > 8000) throw new HttpError(400, 'additional_context_from_rag is limited to 8000 characters');
  return clean;
}

/**
 * Runs one live agent turn and, in parallel, the state tracker.
 * The tracker only needs the customer's words, so it does not wait for the reply.
 */
export async function runLiveTurn({ llm, template, config, transcript, now }) {
  const started = Date.now();
  const hasCustomerTurn = transcript.some((t) => t.role === 'customer');
  const [agentResult, tracked] = await Promise.all([
    llm.generate(buildAgentRequest({ template, config, transcript, now })),
    hasCustomerTurn ? trackState(llm, transcript).catch(() => null) : Promise.resolve(createInitialState()),
  ]);
  const { reply, endCall } = parseAgentResult(agentResult);
  const state = tracked ?? createInitialState();
  return {
    reply,
    endCall,
    state,
    stateAvailable: Boolean(tracked),
    audit: auditTurn({ state, reply, endCall, ragProvided: Boolean(config.additional_context_from_rag) }),
    latencyMs: Date.now() - started,
  };
}

function resolvePublicFile(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = normalize(decoded).replace(/^([/\\])+/, '').split(sep).join('/');
  if (relative.split('/').includes('..')) return null;
  if (!PUBLIC_PREFIXES.some((prefix) => relative === prefix.slice(0, -1) || relative.startsWith(prefix))) return null;
  return join(root, relative);
}

async function serveStatic(root, pathname, req, res) {
  let filePath = resolvePublicFile(root, pathname);
  if (!filePath) throw new HttpError(404, 'Not found');
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw new HttpError(404, 'Not found');
    throw error;
  }
}

/**
 * @param {{ root: string, llm: ReturnType<import('../llm/gemini.js').createGeminiClient>, loadTemplate: () => Promise<string>, log?: (msg: string) => void }} options
 */
export function createRequestHandler({ root, llm, loadTemplate, log = () => {} }) {
  return async function handle(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname === '/api/status' && req.method === 'GET') {
        sendJson(res, 200, { llm: llm.settings });
        return;
      }

      if (pathname === '/api/llm/models' && req.method === 'GET') {
        sendJson(res, 200, { models: await llm.listModels() });
        return;
      }

      if (pathname === '/api/llm/turn') {
        if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
        const body = await readJson(req);
        const config = validateCallConfig(body.config);
        const transcript = validateTranscript(body.transcript ?? []);
        const result = await runLiveTurn({ llm, template: await loadTemplate(), config, transcript });
        sendJson(res, 200, result);
        return;
      }

      if (pathname.startsWith('/api/')) throw new HttpError(404, 'Unknown API route');

      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      if (pathname === '/' || pathname === '/web') {
        res.writeHead(302, { Location: '/web/' }).end();
        return;
      }
      await serveStatic(root, pathname, req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        if (pathname.startsWith('/api/')) sendJson(res, error.status, { error: error.message });
        else res.writeHead(error.status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(error.message);
        return;
      }
      if (error instanceof LlmError) {
        log(`LLM error (${error.code}): ${error.message}`);
        sendJson(res, error.status, { error: error.message, code: error.code, retryable: error.retryable });
        return;
      }
      log(`Unexpected error: ${error.stack ?? error}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
    }
  };
}
