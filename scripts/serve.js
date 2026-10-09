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

const MAX_PORT_ATTEMPTS = 10;

// If the port is taken (often an earlier `npm start` still running), try the next few ports.
function listen(port, attempt = 1) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
      console.warn(`Port ${port} is already in use, trying ${port + 1}…`);
      listen(port + 1, attempt + 1);
      return;
    }
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Ports ${PORT}–${port} are all in use. Stop the other server (Ctrl+C in its terminal) or set PORT in .env to a free port.`,
      );
    } else if (error.code === 'EACCES') {
      console.error(`No permission to use port ${port}. Set PORT in .env to a port above 1024.`);
    } else {
      console.error(`Could not start the server: ${error.message}`);
    }
    process.exit(1);
  });

  server.listen(port, HOST, () => {
    console.log(`Qualification console: http://${HOST}:${port}/web/`);
    console.log(
      settings.configured
        ? `Live AI mode: Gemini (${settings.model})`
        : 'Live AI mode: off — add GEMINI_API_KEY to .env to enable it. Rules-engine mode works without a key.',
    );
  });
}

listen(PORT);
