import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCENARIOS } from '../src/scenarios/scenarios.js';
import { runScenario } from '../src/scenarios/runner.js';

test('scenario ids are unique', () => {
  const ids = SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const scenario of SCENARIOS) {
  test(`${scenario.id} — ${scenario.title}`, () => {
    const result = runScenario(scenario);
    const transcript = result.transcript.map((t) => `${t.role}: ${t.text}`).join('\n');
    assert.ok(result.passed, `${result.failures.join('\n')}\n\nTranscript:\n${transcript}`);
  });
}
