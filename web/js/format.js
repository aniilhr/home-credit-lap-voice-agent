import { OUTCOMES, UNKNOWN, formatRupees } from '/src/engine/index.js';

const LABELS = {
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
  agricultural: 'Agricultural',
  sole: 'Sole',
  joint: 'Joint',
  salaried: 'Salaried',
  self_employed: 'Self-employed',
  other: 'Neither salaried nor self-employed',
  bank: 'Bank',
  cash: 'Cash',
};

export function formatValue(field, value) {
  if (value === UNKNOWN || value === null || value === undefined) return '—';
  if (typeof value === 'boolean') {
    if (field === 'documents_available') return value ? 'Available' : 'Not available';
    return value ? 'Yes' : 'No';
  }
  if (['loan_amount', 'requested_loan_amount', 'market_value'].includes(field)) return formatRupees(value);
  if (field === 'tenure') return `${value} ${value === 1 ? 'year' : 'years'}`;
  return LABELS[value] ?? String(value);
}

export const OUTCOME_INFO = {
  [OUTCOMES.QUALIFIED_HANDOFF]: { label: 'Qualified — handed to senior loan expert', variant: 'pass' },
  [OUTCOMES.DISQUALIFIED]: { label: 'Disqualified', variant: 'fail' },
  [OUTCOMES.TRANSFER_TO_SPECIALIST]: { label: 'Routed to loan-transfer specialist', variant: 'accent' },
  [OUTCOMES.CALLBACK_SCHEDULED]: { label: 'Callback scheduled', variant: 'warn' },
  [OUTCOMES.LOAN_CAP_DECLINED]: { label: 'Declined ₹75 lakh alternative', variant: 'warn' },
  [OUTCOMES.NOT_INTERESTED]: { label: 'Not interested', variant: '' },
  [OUTCOMES.WRONG_PERSON]: { label: 'Wrong person', variant: '' },
};

export function outcomeLabel(outcome) {
  if (!outcome) return { label: 'In progress', variant: '' };
  if (outcome === 'OTHER') return { label: 'Call ended', variant: '' };
  return OUTCOME_INFO[outcome] ?? { label: outcome, variant: '' };
}

export function describeEvent(event) {
  const parts = [event.type];
  if (event.field) parts.push(event.field);
  if (event.item) parts.push(event.item);
  if (event.value !== undefined) {
    const field = event.field ?? (event.type.startsWith('loan_cap') ? 'loan_amount' : 'value');
    parts.push(formatValue(field, event.value));
  }
  if (event.outcome) parts.push(event.outcome);
  return parts.join(' · ');
}
