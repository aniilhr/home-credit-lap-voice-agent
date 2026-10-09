import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { OUTCOMES } from '../src/engine/constants.js';
import { LlmError } from '../src/llm/gemini.js';
import { createRequestHandler } from '../src/server/app.js';
import { BASE_CONFIG } from '../src/scenarios/scenarios.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const loadTemplate = () => readFile(new URL('../prompts/system-prompt.md', import.meta.url), 'utf8');

/** Fake LLM: agent calls get `agentReply`, tracker calls (JSON mode) get `trackerJson`. */
function fakeLlm({ configured = true, agentReply = { text: 'Hello, am I speaking with Rahul?', functionCalls: [] }, trackerJson = {}, fail = null } = {}) {
  const requests = [];
  return {
    requests,
    settings: { provider: 'gemini', model: 'test-model', configured },
    async generate(request) {
      requests.push(request);
      if (fail) throw fail;
      if (request.generationConfig?.responseMimeType === 'application/json') {
        return { text: JSON.stringify(trackerJson), functionCalls: [] };
      }
      return agentReply;
    },
    async listModels() {
      return [{ id: 'test-model', displayName: 'Test' }];
    },
  };
}

let server;
let baseUrl;
let llm;

before(async () => {
  server = createServer((req, res) => createRequestHandler({ root, llm, loadTemplate })(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const postTurn = (body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(`${baseUrl}/api/llm/turn`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('status reports provider and configuration without exposing the key', async () => {
  llm = fakeLlm();
  const body = await (await fetch(`${baseUrl}/api/status`)).json();
  assert.deepEqual(body, { llm: { provider: 'gemini', model: 'test-model', configured: true } });
});

test('opening turn: no tracker call, agent speaks first', async () => {
  llm = fakeLlm();
  const res = await postTurn({ config: BASE_CONFIG, transcript: [] });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.reply, 'Hello, am I speaking with Rahul?');
  assert.equal(body.endCall, null);
  assert.equal(llm.requests.length, 1, 'only the agent call runs before the customer speaks');
});

test('customer turn: agent + tracker run, state and rule guard come back', async () => {
  llm = fakeLlm({
    agentReply: { text: 'Thank you. What type of property is it?', functionCalls: [] },
    trackerJson: { customer_verified: true, property_type: 'agricultural' },
  });
  const res = await postTurn({
    config: BASE_CONFIG,
    transcript: [
      { role: 'agent', text: 'Hello, am I speaking with Rahul?' },
      { role: 'customer', text: 'Yes. It is farm land, by the way.' },
    ],
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(llm.requests.length, 2);
  assert.equal(body.state.property_type, 'agricultural');
  assert.equal(body.stateAvailable, true);
  const guard = body.audit.find((c) => c.id === 'disqualification');
  assert.equal(guard.status, 'fail', 'agent kept asking after an agricultural answer');
});

test('end_call is returned with its mapped outcome', async () => {
  llm = fakeLlm({
    agentReply: { text: 'No problem, have a good day.', functionCalls: [{ name: 'end_call', args: { outcome: 'not_interested' } }] },
    trackerJson: { customer_verified: true },
  });
  const body = await (
    await postTurn({ config: BASE_CONFIG, transcript: [{ role: 'agent', text: 'Hi' }, { role: 'customer', text: 'Not interested.' }] })
  ).json();
  assert.deepEqual(body.endCall, { outcome: OUTCOMES.NOT_INTERESTED, note: '' });
});

test('input validation errors are 4xx with a message', async () => {
  llm = fakeLlm();
  const cases = [
    [postTurn('{bad json'), 400, /valid JSON/],
    [postTurn({ config: BASE_CONFIG }, { 'Content-Type': 'text/plain' }), 415, /application\/json/],
    [postTurn({ config: { ...BASE_CONFIG, customer_name: '' }, transcript: [] }), 400, /customer_name/],
    [postTurn({ config: BASE_CONFIG, transcript: [{ role: 'boss', text: 'x' }] }), 400, /role/],
    [postTurn({ config: BASE_CONFIG, transcript: [{ role: 'customer', text: 'x'.repeat(2001) }] }), 400, /longer than/],
    [postTurn({ config: BASE_CONFIG, transcript: [{ role: 'agent', text: 'Hi' }] }), 400, /last transcript turn/],
    [postTurn('x'.repeat(70 * 1024)), 413, /too large/],
  ];
  for (const [pending, status, message] of cases) {
    const res = await pending;
    assert.equal(res.status, status);
    assert.match((await res.json()).error, message);
  }
});

test('LLM errors surface with their status and code', async () => {
  llm = fakeLlm({ fail: new LlmError('Gemini is not configured.', { status: 503, code: 'not_configured' }) });
  const res = await postTurn({ config: BASE_CONFIG, transcript: [] });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'not_configured');
});

test('tracker failure does not break the turn', async () => {
  llm = fakeLlm();
  llm.generate = async (request) => {
    if (request.generationConfig?.responseMimeType) throw new LlmError('quota', { status: 429, code: 'rate_limited' });
    return { text: 'Next question?', functionCalls: [] };
  };
  const body = await (await postTurn({ config: BASE_CONFIG, transcript: [{ role: 'agent', text: 'Hi' }, { role: 'customer', text: 'Yes' }] })).json();
  assert.equal(body.reply, 'Next question?');
  assert.equal(body.stateAvailable, false);
});

test('static files: console, engine and prompt are served; server code, secrets and traversal are not', async () => {
  llm = fakeLlm();
  const status = async (path) => (await fetch(`${baseUrl}${path}`, { redirect: 'manual' })).status;
  assert.equal(await status('/'), 302);
  assert.equal(await status('/web/'), 200);
  assert.equal(await status('/src/engine/index.js'), 200);
  assert.equal(await status('/prompts/system-prompt.md'), 200);
  assert.equal(await status('/src/server/app.js'), 404);
  assert.equal(await status('/src/llm/gemini.js'), 404);
  assert.equal(await status('/.env'), 404);
  assert.equal(await status('/package.json'), 404);
  assert.equal(await status('/web/%2e%2e/package.json'), 404);
  assert.equal(await status('/api/unknown'), 404);
});
