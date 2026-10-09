/**
 * State tracker: a second, temperature-0 LLM call that reads the transcript
 * and returns the qualification facts as JSON. The deterministic rules in
 * src/engine/rules.js then judge those facts, so eligibility decisions are
 * never left to free-form model output.
 */

import { INCOME_MODE, OCCUPATION, OWNERSHIP, PROPERTY_TYPES, UNKNOWN } from '../engine/constants.js';
import { createInitialState } from '../engine/state.js';

const SYSTEM = `You extract facts from a phone call between a loan agent and a customer about a Loan Against Property offer of up to 75 lakh rupees.
Return JSON that matches the schema. Rules:
- Use only what the CUSTOMER clearly stated or clearly confirmed (a "yes" to the agent's direct question counts). Never guess.
- If the customer was uncertain ("I think", "probably", "not sure") or contradicted themselves without correcting, use null.
- When the customer corrects an answer, use the latest clear answer.
- Amounts are integers in rupees: 1 lakh = 100000, 1 crore = 10000000.
- tenure_years is a number of years (months / 12).
- loan_amount is the amount the customer is going ahead with and is at most 7500000. If they asked for more than 75 lakh, put that figure in requested_loan_amount; set loan_amount only if they then accepted 75 lakh or chose an amount up to 75 lakh.
- occupation is "other" only if the customer confirmed they are neither salaried nor self-employed.
- income_mode is "bank" when income is received mainly through a bank account, "cash" when received in cash.
- documents_available is true when the original property documents are available for verification (they need not be in hand), false when only copies exist or originals are lost or unavailable.
- existing_property_loan is true only for a loan on this property (including originals held by a lender); false if the customer said there is none.
- emi_reduction_request is true if the customer wants to reduce a current EMI or transfer an existing loan.
- customer_verified is true once the customer confirmed their identity, false if someone else answered.`;

const nullable = (schema) => ({ ...schema, nullable: true });

export const TRACKER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    customer_verified: nullable({ type: 'BOOLEAN' }),
    customer_busy: nullable({ type: 'BOOLEAN' }),
    callback_time: nullable({ type: 'STRING' }),
    property_type: nullable({ type: 'STRING', enum: Object.values(PROPERTY_TYPES) }),
    ownership_status: nullable({ type: 'STRING', enum: Object.values(OWNERSHIP) }),
    documents_available: nullable({ type: 'BOOLEAN' }),
    loan_amount: nullable({ type: 'NUMBER' }),
    requested_loan_amount: nullable({ type: 'NUMBER' }),
    occupation: nullable({ type: 'STRING', enum: Object.values(OCCUPATION) }),
    income_mode: nullable({ type: 'STRING', enum: Object.values(INCOME_MODE) }),
    market_value: nullable({ type: 'NUMBER' }),
    tenure_years: nullable({ type: 'NUMBER' }),
    existing_property_loan: nullable({ type: 'BOOLEAN' }),
    emi_reduction_request: nullable({ type: 'BOOLEAN' }),
  },
  required: [
    'customer_verified',
    'property_type',
    'ownership_status',
    'documents_available',
    'loan_amount',
    'occupation',
    'income_mode',
    'market_value',
    'tenure_years',
    'existing_property_loan',
    'emi_reduction_request',
  ],
};

export function buildTrackerRequest(transcript) {
  const lines = transcript.map((t) => `${t.role === 'agent' ? 'AGENT' : 'CUSTOMER'}: ${t.text}`).join('\n');
  return {
    system: SYSTEM,
    contents: [{ role: 'user', parts: [{ text: `Transcript:\n${lines}` }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: TRACKER_SCHEMA,
    },
  };
}

const oneOf = (value, allowed) => (allowed.includes(value) ? value : UNKNOWN);
const bool = (value) => (typeof value === 'boolean' ? value : UNKNOWN);
const positive = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : UNKNOWN);

/** Validates tracker JSON and maps it onto the engine's state shape. Invalid values become UNKNOWN. */
export function normalizeTrackedState(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const state = createInitialState();
  state.customer_verified = bool(data.customer_verified);
  state.customer_available = data.customer_busy === true ? false : UNKNOWN;
  state.callback_time = typeof data.callback_time === 'string' && data.callback_time.trim() ? data.callback_time.trim() : UNKNOWN;
  state.property_type = oneOf(data.property_type, Object.values(PROPERTY_TYPES));
  state.ownership_status = oneOf(data.ownership_status, Object.values(OWNERSHIP));
  state.documents_available = bool(data.documents_available);
  state.loan_amount = positive(data.loan_amount);
  state.requested_loan_amount = positive(data.requested_loan_amount);
  state.occupation = oneOf(data.occupation, Object.values(OCCUPATION));
  state.income_mode = oneOf(data.income_mode, Object.values(INCOME_MODE));
  state.market_value = positive(data.market_value);
  state.tenure = positive(data.tenure_years);
  state.existing_property_loan = bool(data.existing_property_loan);
  state.emi_reduction_request = bool(data.emi_reduction_request);
  return state;
}

export function parseTrackerText(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/** Runs the tracker and returns a normalised state, or null if the model output was unusable. */
export async function trackState(llm, transcript) {
  const result = await llm.generate(buildTrackerRequest(transcript));
  const parsed = parseTrackerText(result.text);
  return parsed ? normalizeTrackedState(parsed) : null;
}
