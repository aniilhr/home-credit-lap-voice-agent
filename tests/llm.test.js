import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LAKH, OUTCOMES, UNKNOWN } from '../src/engine/constants.js';
import { auditTurn } from '../src/llm/audit.js';
import { buildAgentRequest, CALL_CONNECTED, parseAgentResult } from '../src/llm/agent.js';
import { createGeminiClient, LlmError } from '../src/llm/gemini.js';
import { buildTrackerRequest, normalizeTrackedState, parseTrackerText } from '../src/llm/tracker.js';
import { llmSettings, loadEnvFile } from '../src/server/env.js';
import { BASE_CONFIG } from '../src/scenarios/scenarios.js';
import { createInitialState } from '../src/engine/state.js';

const template = readFileSync(new URL('../prompts/system-prompt.md', import.meta.url), 'utf8');
const settings = llmSettings({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'test-model' });

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const { status = 200, body } = await handler(url, init, calls.length);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  fn.calls = calls;
  return fn;
}

const textResponse = (text, extraParts = []) => ({
  body: { candidates: [{ content: { role: 'model', parts: [{ text }, ...extraParts] }, finishReason: 'STOP' }] },
});

test('llmSettings: key required, sensible defaults, bounded numbers', () => {
  const empty = llmSettings({});
  assert.equal(empty.configured, false);
  assert.equal(empty.model, 'gemini-flash-latest');
  const custom = llmSettings({ GEMINI_API_KEY: ' k ', GEMINI_TEMPERATURE: '9', GEMINI_TIMEOUT_MS: '5000' });
  assert.equal(custom.apiKey, 'k');
  assert.equal(custom.temperature, 0.4, 'out-of-range temperature falls back to the default');
  assert.equal(custom.timeoutMs, 5000);
});

test('loadEnvFile parses quotes and comments and never overrides real env vars', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lap-env-'));
  const path = join(dir, '.env');
  writeFileSync(path, '# comment\nGEMINI_API_KEY="abc 123"\nGEMINI_MODEL=model-x # trailing\nPORT=9999\n');
  const target = { PORT: '1234' };
  loadEnvFile(path, target);
  assert.equal(target.GEMINI_API_KEY, 'abc 123');
  assert.equal(target.GEMINI_MODEL, 'model-x');
  assert.equal(target.PORT, '1234');
  rmSync(dir, { recursive: true });
  assert.deepEqual(loadEnvFile(path, {}), {}, 'a missing file is not an error');
});

test('gemini client sends key in header, system instruction, tools and parses text + function calls', async () => {
  const fetchImpl = fakeFetch(() =>
    textResponse('Thank you. Have a good day.', [{ functionCall: { name: 'end_call', args: { outcome: 'not_interested' } } }]),
  );
  const client = createGeminiClient(settings, { fetchImpl });
  const result = await client.generate({ system: 'SYS', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], tools: [{ functionDeclarations: [] }] });

  const [call] = fetchImpl.calls;
  assert.match(call.url, /\/models\/test-model:generateContent$/);
  assert.equal(call.init.headers['x-goog-api-key'], 'test-key');
  assert.doesNotMatch(call.url, /test-key/, 'the key never goes in the URL');
  assert.equal(call.body.systemInstruction.parts[0].text, 'SYS');
  assert.equal(call.body.generationConfig.temperature, 0.4);
  assert.equal(result.text, 'Thank you. Have a good day.');
  assert.deepEqual(result.functionCalls, [{ name: 'end_call', args: { outcome: 'not_interested' } }]);
});

test('gemini client retries once on a rate limit, then succeeds', async () => {
  const fetchImpl = fakeFetch((url, init, n) => (n === 1 ? { status: 429, body: {} } : textResponse('Recovered.')));
  const result = await createGeminiClient(settings, { fetchImpl, retryDelayMs: 0 }).generate({ contents: [] });
  assert.equal(result.text, 'Recovered.');
  assert.equal(fetchImpl.calls.length, 2);
});

test('GEMINI_THINKING maps to a level or a budget', async () => {
  assert.deepEqual(llmSettings({ GEMINI_THINKING: 'low' }).thinking, { thinkingLevel: 'low' });
  assert.deepEqual(llmSettings({ GEMINI_THINKING: '0' }).thinking, { thinkingBudget: 0 });
  assert.equal(llmSettings({ GEMINI_THINKING: 'nonsense' }).thinking, null);
  const fetchImpl = fakeFetch(() => textResponse('ok'));
  await createGeminiClient({ ...settings, thinking: { thinkingLevel: 'low' } }, { fetchImpl }).generate({ contents: [] });
  assert.deepEqual(fetchImpl.calls[0].body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
});

test('gemini client ignores thought parts', async () => {
  const fetchImpl = fakeFetch(() => ({
    body: { candidates: [{ content: { parts: [{ text: 'internal', thought: true }, { text: 'Spoken reply.' }] } }] },
  }));
  const result = await createGeminiClient(settings, { fetchImpl }).generate({ contents: [] });
  assert.equal(result.text, 'Spoken reply.');
});

test('gemini client maps HTTP and safety failures to clear errors', async () => {
  const cases = [
    [{ status: 403, body: { error: { message: 'denied' } } }, 'auth', 401],
    [{ status: 404, body: { error: { message: 'no model' } } }, 'model_not_found', 400],
    [{ status: 429, body: {} }, 'rate_limited', 429],
    [{ status: 500, body: {} }, 'upstream', 502],
    [{ body: { promptFeedback: { blockReason: 'SAFETY' } } }, 'blocked', 422],
    [{ body: { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] } }, 'empty', 502],
  ];
  for (const [response, code, status] of cases) {
    const client = createGeminiClient(settings, { fetchImpl: fakeFetch(() => response), retryDelayMs: 0 });
    await assert.rejects(client.generate({ contents: [] }), (error) => error instanceof LlmError && error.code === code && error.status === status);
  }
});

test('gemini client refuses to call without a key and times out cleanly', async () => {
  const unconfigured = createGeminiClient(llmSettings({}), { fetchImpl: fakeFetch(() => textResponse('x')) });
  await assert.rejects(unconfigured.generate({ contents: [] }), { code: 'not_configured', status: 503 });

  const slow = createGeminiClient(
    { ...settings, timeoutMs: 20 },
    {
      fetchImpl: (url, init) =>
        new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    },
  );
  await assert.rejects(slow.generate({ contents: [] }), { code: 'timeout' });
});

test('agent request: fills every prompt variable and maps the transcript to alternating roles', () => {
  const transcript = [
    { role: 'agent', text: 'Hello, am I speaking with Rahul?' },
    { role: 'customer', text: 'Yes, speaking.' },
  ];
  const request = buildAgentRequest({ template, config: BASE_CONFIG, transcript, now: new Date('2026-10-09T05:30:00Z') });
  assert.doesNotMatch(request.system, /\{\{\w+\}\}/);
  assert.match(request.system, /You are Priya, a voice assistant calling on behalf of Home Credit/);
  assert.match(request.system, /Current day: Friday/);
  assert.deepEqual(request.contents.map((c) => c.role), ['user', 'model', 'user']);
  assert.equal(request.contents[0].parts[0].text, CALL_CONNECTED);
  assert.equal(request.tools[0].functionDeclarations[0].name, 'end_call');
});

test('agent result: end_call outcome is mapped; unknown outcomes are kept as OTHER', () => {
  const parsed = parseAgentResult({ text: 'Bye.', functionCalls: [{ name: 'end_call', args: { outcome: 'transfer', note: 'home loan' } }] });
  assert.deepEqual(parsed, { reply: 'Bye.', endCall: { outcome: OUTCOMES.TRANSFER_TO_SPECIALIST, note: 'home loan' } });
  assert.equal(parseAgentResult({ text: 'x', functionCalls: [{ name: 'end_call', args: { outcome: 'weird' } }] }).endCall.outcome, 'OTHER');
  assert.equal(parseAgentResult({ text: 'Next question?', functionCalls: [] }).endCall, null);
});

test('tracker request asks for schema-constrained JSON at temperature 0', () => {
  const request = buildTrackerRequest([{ role: 'customer', text: 'It is a flat.' }]);
  assert.equal(request.generationConfig.temperature, 0);
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.match(request.contents[0].parts[0].text, /CUSTOMER: It is a flat\./);
});

test('tracker output is validated: bad enums, negative numbers and nulls become UNKNOWN', () => {
  const state = normalizeTrackedState({
    customer_verified: true,
    property_type: 'castle',
    ownership_status: 'joint',
    documents_available: null,
    loan_amount: -5,
    market_value: 12_000_000,
    tenure_years: 12,
    income_mode: 'bank',
    occupation: 'self_employed',
    existing_property_loan: false,
  });
  assert.equal(state.property_type, UNKNOWN);
  assert.equal(state.ownership_status, 'joint');
  assert.equal(state.documents_available, UNKNOWN);
  assert.equal(state.loan_amount, UNKNOWN);
  assert.equal(state.market_value, 12_000_000);
  assert.equal(state.tenure, 12);
  assert.equal(state.existing_property_loan, false);
  assert.equal(normalizeTrackedState(null).property_type, UNKNOWN);
});

test('tracker JSON parsing tolerates code fences and rejects garbage', () => {
  assert.deepEqual(parseTrackerText('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(parseTrackerText('not json'), null);
});

const eligible = () => ({
  ...createInitialState(),
  customer_verified: true,
  property_type: 'residential',
  ownership_status: 'joint',
  documents_available: true,
  loan_amount: 40 * LAKH,
  occupation: 'salaried',
  income_mode: 'bank',
  market_value: 100 * LAKH,
  tenure: 10,
  existing_property_loan: false,
});
const statusOf = (checks, id) => checks.find((c) => c.id === id).status;

test('rule guard: premature qualification fails the handoff gate', () => {
  const state = { ...eligible(), tenure: UNKNOWN };
  const checks = auditTurn({
    state,
    reply: 'Great news, you meet the preliminary criteria for this offer.',
    endCall: { outcome: OUTCOMES.QUALIFIED_HANDOFF },
    ragProvided: false,
  });
  assert.equal(statusOf(checks, 'handoff_gate'), 'fail');
  const ok = auditTurn({ state: eligible(), reply: 'You meet the preliminary criteria.', endCall: { outcome: OUTCOMES.QUALIFIED_HANDOFF }, ragProvided: false });
  assert.equal(statusOf(ok, 'handoff_gate'), 'pass');
});

test('rule guard: a disqualification message is not read as a qualification claim', () => {
  const checks = auditTurn({
    state: { ...eligible(), income_mode: 'cash' },
    reply: "I'm sorry, but you don't meet the criteria for this specific offer at this time.",
    endCall: { outcome: OUTCOMES.DISQUALIFIED },
    ragProvided: false,
  });
  assert.equal(statusOf(checks, 'handoff_gate'), 'n/a');
  assert.equal(statusOf(checks, 'disqualification'), 'pass');
});

test('rule guard: continuing after cash income or an existing loan fails', () => {
  const cash = auditTurn({ state: { ...eligible(), income_mode: 'cash' }, reply: 'What is the market value?', endCall: null, ragProvided: false });
  assert.equal(statusOf(cash, 'disqualification'), 'fail');
  const loan = auditTurn({ state: { ...eligible(), existing_property_loan: true }, reply: 'How many years?', endCall: null, ragProvided: false });
  assert.equal(statusOf(loan, 'transfer'), 'fail');
});

test('rule guard: invented rates, loan cap and voice style', () => {
  const base = { ...createInitialState(), customer_verified: true };
  assert.equal(statusOf(auditTurn({ state: base, reply: 'Rates start at 9.5% per annum.', endCall: null, ragProvided: false }), 'no_invented_rates'), 'fail');
  assert.equal(statusOf(auditTurn({ state: base, reply: 'Rates start at 9.5%.', endCall: null, ragProvided: true }), 'no_invented_rates'), 'pass');

  const overCap = { ...base, requested_loan_amount: 90 * LAKH };
  assert.equal(statusOf(auditTurn({ state: overCap, reply: 'What do you do for a living?', endCall: null, ragProvided: false }), 'loan_cap'), 'warn');
  assert.equal(statusOf(auditTurn({ state: overCap, reply: 'Would you like to proceed with 75 lakh?', endCall: null, ragProvided: false }), 'loan_cap'), 'pass');

  assert.equal(statusOf(auditTurn({ state: base, reply: '**Great!** What type? Who owns it? Any papers?', endCall: null, ragProvided: false }), 'voice_style'), 'warn');
});
