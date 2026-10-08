/**
 * Business constants for the LAP qualification flow.
 * Every value here comes directly from the assignment brief.
 */

export const UNKNOWN = 'UNKNOWN';

export const LAKH = 100_000;
export const CRORE = 10_000_000;

/** Maximum loan amount supported by the pre-approved offer (₹75,00,000). */
export const MAX_LOAN_AMOUNT = 75 * LAKH;

/** Repayment tenure bounds in years, both inclusive. */
export const MIN_TENURE_YEARS = 3;
export const MAX_TENURE_YEARS = 15;

export const PROPERTY_TYPES = Object.freeze({
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  INDUSTRIAL: 'industrial',
  AGRICULTURAL: 'agricultural',
});

export const ELIGIBLE_PROPERTY_TYPES = Object.freeze([
  PROPERTY_TYPES.RESIDENTIAL,
  PROPERTY_TYPES.COMMERCIAL,
  PROPERTY_TYPES.INDUSTRIAL,
]);

export const OWNERSHIP = Object.freeze({ SOLE: 'sole', JOINT: 'joint' });

export const OCCUPATION = Object.freeze({
  SALARIED: 'salaried',
  SELF_EMPLOYED: 'self_employed',
  /** Customer confirmed neither salaried nor self-employed. */
  OTHER: 'other',
});

export const INCOME_MODE = Object.freeze({ BANK: 'bank', CASH: 'cash' });

/**
 * The mandatory 7-item checklist, in the order the agent asks it.
 * Item 5 is a single checklist item made of two state fields.
 */
export const CHECKLIST = Object.freeze([
  { id: 'property_type', label: 'Property type', fields: ['property_type'] },
  { id: 'ownership_status', label: 'Ownership status', fields: ['ownership_status'] },
  { id: 'documents_available', label: 'Original property documents', fields: ['documents_available'] },
  { id: 'loan_amount', label: 'Desired loan amount', fields: ['loan_amount'] },
  { id: 'occupation_income', label: 'Occupation and income mode', fields: ['occupation', 'income_mode'] },
  { id: 'market_value', label: 'Estimated property market value', fields: ['market_value'] },
  { id: 'tenure', label: 'Desired loan tenure', fields: ['tenure'] },
]);

export const PHASES = Object.freeze({
  VERIFICATION: 'verification',
  AVAILABILITY: 'availability',
  LOAN_CHECK: 'loan_check',
  QUALIFICATION: 'qualification',
  CALLBACK: 'callback',
  ENDED: 'ended',
});

export const OUTCOMES = Object.freeze({
  QUALIFIED_HANDOFF: 'QUALIFIED_HANDOFF',
  DISQUALIFIED: 'DISQUALIFIED',
  TRANSFER_TO_SPECIALIST: 'TRANSFER_TO_SPECIALIST',
  CALLBACK_SCHEDULED: 'CALLBACK_SCHEDULED',
  LOAN_CAP_DECLINED: 'LOAN_CAP_DECLINED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  WRONG_PERSON: 'WRONG_PERSON',
});
