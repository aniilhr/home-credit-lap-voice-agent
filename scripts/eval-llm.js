#!/usr/bin/env node
/**
 * Runs the scripted scenarios against the live Gemini agent (real API calls).
 *
 *   npm run eval:llm                    all scenarios
 *   npm run eval:llm -- --only S01,S10  selected scenarios
 *
 * Writes a JSON report with full transcripts to build/llm-eval-report.json.
 * Each scenario costs roughly (customer turns + 2) model calls.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runLiveScenario } from '../src/llm/eval.js';
import { createGeminiClient } from '../src/llm/gemini.js';
import { BASE_CONFIG, SCENARIOS } from '../src/scenarios/scenarios.js';
import { llmSettings, loadEnvFile } from '../src/server/env.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(resolve(root, '.env'));

const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? new Set((args[onlyIndex + 1] ?? '').split(',').map((s) => s.trim().toUpperCase())) : null;

const settings = llmSettings();
if (!settings.configured) {
  console.error('GEMINI_API_KEY is not set. Add it to .env first.');
  process.exit(1);
}

const llm = createGeminiClient(settings);
const template = readFileSync(resolve(root, 'prompts/system-prompt.md'), 'utf8');
const scenarios = SCENARIOS.filter((s) => !only || only.has(s.id));
if (!scenarios.length) {
  console.error('No scenarios matched --only.');
  process.exit(1);
}

console.log(`Live eval: ${scenarios.length} scenario(s) on ${settings.model}\n`);
const results = [];
for (const scenario of scenarios) {
  try {
    const result = await runLiveScenario({ llm, template, scenario, baseConfig: BASE_CONFIG });
    results.push(result);
    console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${scenario.id}  ${scenario.title}`);
    for (const failure of result.failures) console.log(`        ${failure}`);
  } catch (error) {
    results.push({ id: scenario.id, title: scenario.title, passed: false, failures: [error.message] });
    console.log(`ERROR ${scenario.id}  ${error.message}`);
    if (error.code === 'auth' || error.code === 'model_not_found') break;
  }
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed}/${results.length} passed`);

const out = resolve(root, 'build/llm-eval-report.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ model: settings.model, ranAt: new Date().toISOString(), results }, null, 2));
console.log(`Report: build/llm-eval-report.json`);
process.exitCode = passed === results.length ? 0 : 1;
