/**
 * Plays a scripted scenario against the live LLM agent and grades the result:
 * how the call ended (end_call outcome) and the facts the tracker extracted,
 * judged by the deterministic rules.
 */

import { findDisqualification, isTransferCase } from '../engine/rules.js';
import { auditTurn } from './audit.js';
import { buildAgentRequest, parseAgentResult } from './agent.js';
import { trackState } from './tracker.js';

const GRADED_FIELDS = [
  'customer_verified',
  'property_type',
  'ownership_status',
  'documents_available',
  'loan_amount',
  'requested_loan_amount',
  'occupation',
  'income_mode',
  'market_value',
  'tenure',
  'existing_property_loan',
  'emi_reduction_request',
];

export async function runLiveScenario({ llm, template, scenario, baseConfig }) {
  const config = { ...baseConfig, ...(scenario.config ?? {}) };
  const transcript = [];
  let endCall = null;

  const agentTurn = async () => {
    const { reply, endCall: ended } = parseAgentResult(await llm.generate(buildAgentRequest({ template, config, transcript })));
    if (reply) transcript.push({ role: 'agent', text: reply });
    return ended;
  };

  endCall = await agentTurn();
  let customerTurnsPlayed = 0;
  for (const utterance of scenario.turns) {
    if (endCall) break;
    transcript.push({ role: 'customer', text: utterance });
    customerTurnsPlayed += 1;
    endCall = await agentTurn();
  }

  const state = (await trackState(llm, transcript)) ?? null;
  const failures = [];
  const expect = scenario.expect ?? {};

  if ('outcome' in expect) {
    const actual = endCall?.outcome ?? null;
    if (actual !== expect.outcome) failures.push(`outcome: expected ${expect.outcome ?? 'call continues'}, got ${actual ?? 'call continues'}`);
  }
  if (!state) {
    failures.push('state tracker returned no usable JSON');
  } else {
    for (const [key, value] of Object.entries(expect.state ?? {})) {
      if (GRADED_FIELDS.includes(key) && state[key] !== value) {
        failures.push(`${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(state[key])}`);
      }
      if (key === 'disqualified' && Boolean(findDisqualification(state)) !== value) failures.push(`disqualified: expected ${value}`);
      if (key === 'transfer_required' && isTransferCase(state) !== value) failures.push(`transfer_required: expected ${value}`);
    }
  }
  if (customerTurnsPlayed < scenario.turns.length && expect.outcome === null) {
    failures.push(`call ended after ${customerTurnsPlayed} of ${scenario.turns.length} customer turns`);
  }

  const lastReply = [...transcript].reverse().find((t) => t.role === 'agent')?.text ?? '';
  const audit = state ? auditTurn({ state, reply: lastReply, endCall, ragProvided: Boolean(config.additional_context_from_rag) }) : [];
  for (const item of audit.filter((a) => a.status === 'fail')) failures.push(`rule guard: ${item.label} — ${item.detail}`);

  return { id: scenario.id, title: scenario.title, passed: failures.length === 0, failures, endCall, state, transcript, audit };
}
