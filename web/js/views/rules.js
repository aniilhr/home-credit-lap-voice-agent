import { CHECKLIST, RULES } from '/src/engine/index.js';
import { card, h, pageHead, table } from '../dom.js';

const BEHAVIOUR = {
  property_type: 'Agricultural → disqualify immediately and end the call.',
  ownership_status: 'Both continue. Joint ownership is never a rejection.',
  documents_available: 'Not available → disqualify immediately. Uncertain answers are clarified first.',
  loan_amount: 'Above ₹75 lakh → explain the limit and ask to proceed with ₹75 lakh. Yes → continue at ₹75 lakh. No → end politely.',
  occupation: 'Both continue. If neither applies after one clarification, the offer criteria are not met.',
  income_mode: 'Cash → disqualify immediately. Mainly received in the bank counts as bank.',
  market_value: 'Recorded as the customer’s estimate. Never used to accept or reject.',
  tenure: 'Outside 3–15 years → disqualify immediately.',
};

const ROUTING = [
  ['Existing loan on the property', 'Stop qualification, tell the customer a loan-transfer specialist will contact them shortly, end the call.'],
  ['Wants to reduce a current EMI / balance transfer', 'Same as above — transfer branch, no further checklist questions.'],
  ['Customer is busy', 'Acknowledge, ask for a preferred callback time, confirm it, end the call.'],
  ['Question the agent cannot answer from product context', 'Do not invent. Say the senior loan expert will share details, then return to the checklist.'],
  ['All 7 items answered and passing', 'Tell the customer a senior loan expert will call shortly with exact interest rates and next steps.'],
];

const NOT_CHECKED = ['Minimum or maximum property value', 'Interest rates', 'Credit score', 'Age', 'Income amount', 'Employment duration', 'Loan-to-value ratio'];

export function renderRules() {
  const rows = CHECKLIST.flatMap((item, index) =>
    item.fields.map((field, i) =>
      h(
        'tr',
        {},
        h('td', { class: 'nowrap', style: 'font-weight:550' }, i === 0 ? `${index + 1}. ${item.label}` : ''),
        h('td', {}, RULES[field].eligible),
        h('td', {}, RULES[field].ineligible),
        h('td', { class: 'muted' }, BEHAVIOUR[field]),
      ),
    ),
  );

  return h(
    'div',
    {},
    pageHead(
      'Rules',
      'Eligibility rules',
      'Every rule comes from the assignment brief. This table is generated from the same definitions the rules engine, the rule guard and the tests use.',
    ),
    h('div', { class: 'stack' },
    card('Checklist rules', table(['Item', 'Eligible', 'Not eligible / special', 'Agent behaviour'], rows), { flush: true }),
    card(
      'Routing rules',
      table(
        ['Situation', 'Agent behaviour'],
        ROUTING.map(([situation, behaviour]) => h('tr', {}, h('td', {}, situation), h('td', {}, behaviour))),
      ),
      { flush: true },
    ),
    card(
      'Not part of the preliminary check',
      h(
        'div',
        {},
        h('p', { class: 'small muted' }, 'The brief defines no condition for these, so the agent neither asks about them nor applies them:'),
        h('div', { class: 'btn-row' }, NOT_CHECKED.map((x) => h('span', { class: 'tag' }, x))),
      ),
    ),
    ),
  );
}
