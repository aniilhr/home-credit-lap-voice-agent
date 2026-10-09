/**
 * Runs one agent turn: the production system prompt (with variables filled)
 * plus the call transcript, sent to the LLM. The agent hangs up through an
 * `end_call` function, mirroring the end-call tool on voice platforms.
 */

import { OUTCOMES } from '../engine/constants.js';
import { renderPrompt, runtimeDateValues } from '../prompt/render.js';

export const CALL_CONNECTED = '[The customer has picked up the call. Speak your opening line.]';

export const END_CALL_OUTCOMES = Object.freeze({
  qualified: OUTCOMES.QUALIFIED_HANDOFF,
  disqualified: OUTCOMES.DISQUALIFIED,
  transfer: OUTCOMES.TRANSFER_TO_SPECIALIST,
  callback: OUTCOMES.CALLBACK_SCHEDULED,
  loan_cap_declined: OUTCOMES.LOAN_CAP_DECLINED,
  not_interested: OUTCOMES.NOT_INTERESTED,
  wrong_person: OUTCOMES.WRONG_PERSON,
});

export const END_CALL_TOOL = Object.freeze({
  functionDeclarations: [
    {
      name: 'end_call',
      description:
        'Hang up the phone call. Use it only after you have spoken your closing line in the same turn, and only when the call has reached one of the endings described in your instructions.',
      parameters: {
        type: 'OBJECT',
        properties: {
          outcome: {
            type: 'STRING',
            enum: [...Object.keys(END_CALL_OUTCOMES), 'other'],
            description: 'Why the call is ending.',
          },
          note: { type: 'STRING', description: 'One short sentence for the call log, e.g. the failed criterion or the callback time.' },
        },
        required: ['outcome'],
      },
    },
  ],
});

/**
 * @param {{ template: string, config: object, transcript: {role: 'agent'|'customer', text: string}[], now?: Date }} input
 */
export function buildAgentRequest({ template, config, transcript, now = new Date() }) {
  const lastCustomer = [...transcript].reverse().find((t) => t.role === 'customer');
  const values = {
    ...config,
    ...runtimeDateValues(now),
    additional_context_from_rag: config.additional_context_from_rag ?? '',
    // The live conversation is sent as messages, so these blocks stay light (the prompt handles empty ones).
    conversation_history: '',
    customer_utterance: lastCustomer?.text ?? '',
  };
  const { text: system, unfilled } = renderPrompt(template, values);
  if (unfilled.length) throw new Error(`Prompt variables left unfilled: ${unfilled.join(', ')}`);

  const contents = [{ role: 'user', parts: [{ text: CALL_CONNECTED }] }];
  for (const turn of transcript) {
    contents.push({ role: turn.role === 'agent' ? 'model' : 'user', parts: [{ text: turn.text }] });
  }

  return {
    system,
    contents,
    tools: [END_CALL_TOOL],
    // Headroom matters: on thinking models, reasoning tokens count against this limit.
    generationConfig: { maxOutputTokens: 8192 },
  };
}

/** Extracts the spoken reply and an optional end-call request from the model result. */
export function parseAgentResult(result) {
  const call = result.functionCalls.find((c) => c.name === 'end_call');
  const endCall = call
    ? {
        outcome: END_CALL_OUTCOMES[call.args?.outcome] ?? 'OTHER',
        note: typeof call.args?.note === 'string' ? call.args.note : '',
      }
    : null;
  return { reply: result.text, endCall };
}
