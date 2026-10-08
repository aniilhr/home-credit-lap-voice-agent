#!/usr/bin/env node
/**
 * Renders prompts/system-prompt.md with values from a config file.
 *
 *   node scripts/render-prompt.js [--config config/agent.config.json] [--out build/system-prompt.txt]
 *                                 [--with-time] [--single-brace]
 *
 * Empty config values are left as {{placeholders}} so the voice platform can fill them.
 * --with-time fills current_date / current_day / current_time from the local clock (IST).
 * --single-brace converts remaining placeholders to {name} for platforms that use that syntax.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPrompt, runtimeDateValues, toSingleBraceSyntax } from '../src/prompt/render.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { config: null, out: null, withTime: false, singleBrace: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') args.config = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--with-time') args.withTime = true;
    else if (arg === '--single-brace') args.singleBrace = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function loadConfig(path) {
  const candidates = path ? [path] : ['config/agent.config.json', 'config/agent.config.example.json'];
  for (const candidate of candidates) {
    const full = resolve(root, candidate);
    if (existsSync(full)) return { path: candidate, values: JSON.parse(readFileSync(full, 'utf8')) };
  }
  throw new Error(`Config file not found: ${candidates.join(' or ')}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const { path, values } = loadConfig(args.config);
  const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === 'string' && v.trim() !== ''));
  if (args.withTime) Object.assign(filled, runtimeDateValues());

  const template = readFileSync(resolve(root, 'prompts/system-prompt.md'), 'utf8');
  const result = renderPrompt(template, filled);
  const text = args.singleBrace ? toSingleBraceSyntax(result.text) : result.text;

  if (result.unknown.length) console.error(`Warning: unknown variables in template: ${result.unknown.join(', ')}`);
  console.error(`Config: ${path}`);
  console.error(`Left for the platform to fill: ${result.unfilled.join(', ') || 'none'}`);

  if (args.out) {
    const outPath = resolve(root, args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text);
    console.error(`Wrote ${args.out}`);
  } else {
    process.stdout.write(text);
  }
} catch (error) {
  console.error(`render-prompt: ${error.message}`);
  process.exit(1);
}
