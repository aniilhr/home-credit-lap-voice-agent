import {
  CHECKLIST,
  ELIGIBLE_PROPERTY_TYPES,
  INCOME_MODE,
  MAX_LOAN_AMOUNT,
  MAX_TENURE_YEARS,
  MIN_TENURE_YEARS,
  OCCUPATION,
  OWNERSHIP,
} from './constants.js';
import { isKnown, isChecklistItemComplete } from './state.js';

export const RESULT = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  /** Value is known but needs a follow-up before it can pass (loan amount above the cap). */
  NEEDS_ACTION: 'needs_action',
  UNANSWERED: 'unanswered',
});

/**
 * Rule table. `check` returns a RESULT for a known value.
 * Market value has no pass/fail condition: the brief only asks for it to be captured.
 */
export const RULES = Object.freeze({
  property_type: {
    label: 'Property type',
    eligible: 'Residential, Commercial, Industrial',
    ineligible: 'Agricultural',
    check: (v) => (ELIGIBLE_PROPERTY_TYPES.includes(v) ? RESULT.PASS : RESULT.FAIL),
    failReason: 'Agricultural property is not eligible for this offer.',
  },
  ownership_status: {
    label: 'Ownership status',
    eligible: 'Sole, Joint',
    ineligible: '—',
    check: (v) => ([OWNERSHIP.SOLE, OWNERSHIP.JOINT].includes(v) ? RESULT.PASS : RESULT.FAIL),
    failReason: 'Ownership status must be sole or joint.',
  },
  documents_available: {
    label: 'Original property documents',
    eligible: 'Available',
    ineligible: 'Not available',
    check: (v) => (v === true ? RESULT.PASS : RESULT.FAIL),
    failReason: 'Original property documents are not available.',
  },
  loan_amount: {
    label: 'Desired loan amount',
    eligible: 'Up to ₹75 lakh',
    ineligible: 'Above ₹75 lakh triggers the ₹75 lakh option, not rejection',
    check: (v) => (v <= MAX_LOAN_AMOUNT ? RESULT.PASS : RESULT.NEEDS_ACTION),
    failReason: null,
  },
  occupation: {
    label: 'Occupation',
    eligible: 'Salaried, Self-employed',
    ineligible: '—',
    check: (v) => ([OCCUPATION.SALARIED, OCCUPATION.SELF_EMPLOYED].includes(v) ? RESULT.PASS : RESULT.FAIL),
    failReason: 'Only salaried and self-employed customers are covered by this offer.',
  },
  income_mode: {
    label: 'Income mode',
    eligible: 'Bank',
    ineligible: 'Cash',
    check: (v) => (v === INCOME_MODE.BANK ? RESULT.PASS : RESULT.FAIL),
    failReason: 'Income received in cash is not eligible for this offer.',
  },
  market_value: {
    label: 'Estimated market value',
    eligible: 'Any estimate (captured only)',
    ineligible: 'No threshold in the brief',
    check: () => RESULT.PASS,
    failReason: null,
  },
  tenure: {
    label: 'Desired tenure',
    eligible: `${MIN_TENURE_YEARS}–${MAX_TENURE_YEARS} years inclusive`,
    ineligible: `Below ${MIN_TENURE_YEARS} or above ${MAX_TENURE_YEARS} years`,
    check: (v) => (v >= MIN_TENURE_YEARS && v <= MAX_TENURE_YEARS ? RESULT.PASS : RESULT.FAIL),
    failReason: `Requested tenure is outside the ${MIN_TENURE_YEARS}–${MAX_TENURE_YEARS} year range.`,
  },
});

export function evaluateField(field, value) {
  const rule = RULES[field];
  if (!rule) throw new Error(`No eligibility rule for field "${field}"`);
  if (!isKnown(value)) return RESULT.UNANSWERED;
  return rule.check(value);
}

/**
 * Returns the first failing field in checklist order, or null.
 * Used after every turn so a disqualifying answer ends the flow immediately.
 */
export function findDisqualification(state) {
  for (const item of CHECKLIST) {
    for (const field of item.fields) {
      if (evaluateField(field, state[field]) === RESULT.FAIL) {
        return { field, reason: RULES[field].failReason, value: state[field] };
      }
    }
  }
  return null;
}

export function isTransferCase(state) {
  return state.existing_property_loan === true || state.emi_reduction_request === true;
}

/**
 * Final handoff gate: all 7 items answered, every rule passed,
 * no transfer intent and no unresolved confirmation.
 */
export function canHandoff(state) {
  if (state.disqualified || isTransferCase(state) || state.pending_confirmation) return false;
  if (state.customer_verified !== true) return false;
  return CHECKLIST.every(
    (item) =>
      isChecklistItemComplete(state, item) &&
      item.fields.every((field) => evaluateField(field, state[field]) === RESULT.PASS),
  );
}
