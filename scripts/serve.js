#!/usr/bin/env node
/**
 * Starts the qualification console and its live-agent API.
 *   npm start            → http://127.0.0.1:4173/web/
 * Reads .env from the project root (GEMINI_API_KEY enables live AI mode).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGeminiClient } from '../src/llm/gemini.js';
import { createRequestHandler } from '../src/server/app.js';
import { llmSettings, loadEnvFile } from '../src/server/env.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(resolve(root, '.env'));

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';
const settings = llmSettings();
const llm = createGeminiClient(settings);

// Read on every turn so prompt edits apply without restarting the server.
const loadTemplate = () => readFile(resolve(root, 'prompts/system-prompt.md'), 'utf8');

const server = createServer(createRequestHandler({ root, llm, loadTemplate, log: (msg) => console.error(msg) }));

server.listen(PORT, HOST, () => {
  console.log(`Qualification console: http://${HOST}:${PORT}/web/`);
  console.log(
    settings.configured
      ? `Live AI mode: Gemini (${settings.model})`
      : 'Live AI mode: off — add GEMINI_API_KEY to .env to enable it. Rules-engine mode works without a key.',
  );
});
