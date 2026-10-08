import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { findVariables, renderPrompt, toSingleBraceSyntax } from '../src/prompt/render.js';
import { PROMPT_VARIABLE_NAMES } from '../src/prompt/variables.js';

const prompt = readFileSync(new URL('../prompts/system-prompt.md', import.meta.url), 'utf8');

test('system prompt uses every required dynamic variable and no unknown ones', () => {
  const used = findVariables(prompt);
  for (const name of PROMPT_VARIABLE_NAMES) assert.ok(used.includes(name), `missing {{${name}}}`);
  assert.deepEqual(used.filter((name) => !PROMPT_VARIABLE_NAMES.includes(name)), []);
});

test('system prompt covers all 7 checklist items in order', () => {
  const items = ['Property type', 'Ownership status', 'Original property documents', 'Desired loan amount', 'Occupation and income mode', 'Estimated current market value', 'Desired loan tenure'];
  let lastIndex = -1;
  for (const item of items) {
    const index = prompt.indexOf(item, lastIndex + 1);
    assert.ok(index > lastIndex, `"${item}" missing or out of order`);
    lastIndex = index;
  }
});

test('system prompt states the business rules from the brief', () => {
  assert.match(prompt, /Agricultural → disqualify immediately/);
  assert.match(prompt, /Received in cash → disqualify immediately/);
  assert.match(prompt, /3 to 15 years, inclusive/);
  assert.match(prompt, /Up to ₹75 lakh/);
  assert.match(prompt, /Above ₹75 lakh → do NOT reject/);
  assert.match(prompt, /Sole, Joint/);
  assert.match(prompt, /loan-transfer specialist|specialist for loan transfer/);
  assert.match(prompt, /callback time/i);
  assert.match(prompt, /all 7 checklist items are answered/);
});

test('system prompt never quotes an interest rate or an invented threshold', () => {
  assert.doesNotMatch(prompt, /\d+(\.\d+)?\s*%/, 'no percentage figures');
  assert.doesNotMatch(prompt, /\bper annum\b|\bp\.a\./i);
  // The only rupee figures allowed are the ₹75 lakh limit and unit examples.
  const amounts = [...prompt.matchAll(/₹\s?[\d.,]+\s?(?:lakh|crore)?/gi)].map((m) => m[0].replace(/\s/g, '').toLowerCase());
  const allowed = new Set(['₹75lakh', '₹1.2crore']);
  assert.deepEqual(amounts.filter((a) => !allowed.has(a)), []);
  assert.match(prompt, /there is no minimum or maximum property value/);
});

test('render fills provided values and leaves the rest for the platform', () => {
  const result = renderPrompt('Hi {{customer_name}}, this is {{agent_name}} from {{company_name}}.', {
    customer_name: 'Meera',
    company_name: 'Home Credit',
  });
  assert.equal(result.text, 'Hi Meera, this is {{agent_name}} from Home Credit.');
  assert.deepEqual(result.unfilled, ['agent_name']);
});

test('render reports unknown variables and variables missing from the template', () => {
  const result = renderPrompt('{{customer_name}} {{loyalty_tier}}', { customer_name: 'A' });
  assert.deepEqual(result.unknown, ['loyalty_tier']);
  assert.ok(result.missingFromTemplate.includes('agent_gender'));
});

test('rendering the real prompt with full values leaves no placeholders', () => {
  const values = Object.fromEntries(PROMPT_VARIABLE_NAMES.map((name) => [name, `<${name}>`]));
  const result = renderPrompt(prompt, values);
  assert.deepEqual(result.unfilled, []);
  assert.doesNotMatch(result.text, /\{\{/);
});

test('single-brace conversion', () => {
  assert.equal(toSingleBraceSyntax('Hello {{customer_name}}'), 'Hello {customer_name}');
});
