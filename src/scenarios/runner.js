import { createSession, processTurn, startCall } from '../engine/conversation.js';
import { BASE_CONFIG } from './scenarios.js';

function compareState(state, expected, label, failures) {
  for (const [key, value] of Object.entries(expected ?? {})) {
    if (state[key] !== value) {
      failures.push(`${label}: expected ${key} = ${JSON.stringify(value)}, got ${JSON.stringify(state[key])}`);
    }
  }
}

/**
 * Runs one scenario through the engine and evaluates its expectations.
 * Returns the full transcript so failures can be inspected.
 */
export function runScenario(scenario) {
  const config = { ...BASE_CONFIG, ...(scenario.config ?? {}) };
  let { session } = startCall(createSession(config));
  const failures = [];
  const turns = [];

  scenario.turns.forEach((utterance, i) => {
    const turnNumber = i + 1;
    if (session.state.phase === 'ended') {
      failures.push(`turn ${turnNumber}: call already ended before "${utterance}"`);
      return;
    }
    const result = processTurn(session, utterance);
    session = result.session;
    turns.push({ utterance, reply: result.reply, events: result.events, state: session.state });

    for (const check of (scenario.checks ?? []).filter((c) => c.afterTurn === turnNumber)) {
      const label = `after turn ${turnNumber}`;
      if (check.replyIncludes && !(result.reply ?? '').includes(check.replyIncludes)) {
        failures.push(`${label}: reply should include "${check.replyIncludes}" — got "${result.reply}"`);
      }
      if (check.replyExcludes && (result.reply ?? '').includes(check.replyExcludes)) {
        failures.push(`${label}: reply should not include "${check.replyExcludes}"`);
      }
      if (check.nextQuestion && session.state.awaiting !== check.nextQuestion) {
        failures.push(`${label}: expected next question ${check.nextQuestion}, agent is awaiting ${session.state.awaiting}`);
      }
      compareState(session.state, check.state, label, failures);
    }
  });

  const { expect = {} } = scenario;
  if ('outcome' in expect && session.state.outcome !== expect.outcome) {
    failures.push(`final: expected outcome ${expect.outcome}, got ${session.state.outcome}`);
  }
  compareState(session.state, expect.state, 'final', failures);

  return { id: scenario.id, passed: failures.length === 0, failures, transcript: session.transcript, turns, finalState: session.state };
}
