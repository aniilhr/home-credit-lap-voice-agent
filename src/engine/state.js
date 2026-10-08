import { CHECKLIST, PHASES, UNKNOWN } from './constants.js';

/**
 * Creates the internal qualification state for a new call.
 * Every eligibility field starts as UNKNOWN; booleans that drive routing start false.
 */
export function createInitialState() {
  return {
    phase: PHASES.VERIFICATION,
    awaiting: 'verification',

    customer_verified: UNKNOWN,
    customer_available: UNKNOWN,

    property_type: UNKNOWN,
    ownership_status: UNKNOWN,
    documents_available: UNKNOWN,
    loan_amount: UNKNOWN,
    requested_loan_amount: UNKNOWN,
    occupation: UNKNOWN,
    income_mode: UNKNOWN,
    market_value: UNKNOWN,
    tenure: UNKNOWN,

    existing_property_loan: UNKNOWN,
    emi_reduction_request: UNKNOWN,

    disqualified: false,
    disqualification_reason: null,
    transfer_required: false,
    callback_time: UNKNOWN,

    pending_confirmation: null,
    outcome: null,
    turn: 0,
  };
}

export const isKnown = (value) => value !== UNKNOWN && value !== null && value !== undefined;

export function isChecklistItemComplete(state, item) {
  return item.fields.every((field) => isKnown(state[field]));
}

/** Returns the earliest checklist item that still has an unanswered field, or null. */
export function firstMissingItem(state) {
  return CHECKLIST.find((item) => !isChecklistItemComplete(state, item)) ?? null;
}

export function completedItemCount(state) {
  return CHECKLIST.filter((item) => isChecklistItemComplete(state, item)).length;
}

export function cloneState(state) {
  return structuredClone(state);
}
