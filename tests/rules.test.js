import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAKH, MAX_LOAN_AMOUNT, UNKNOWN } from '../src/engine/constants.js';
import { canHandoff, evaluateField, findDisqualification, RESULT } from '../src/engine/rules.js';
import { createInitialState, firstMissingItem } from '../src/engine/state.js';

const completeEligibleState = () => ({
  ...createInitialState(),
  customer_verified: true,
  property_type: 'residential',
  ownership_status: 'sole',
  documents_available: true,
  loan_amount: 50 * LAKH,
  occupation: 'salaried',
  income_mode: 'bank',
  market_value: 100 * LAKH,
  tenure: 10,
  existing_property_loan: false,
});

test('property type: residential, commercial and industrial pass; agricultural fails', () => {
  assert.equal(evaluateField('property_type', 'residential'), RESULT.PASS);
  assert.equal(evaluateField('property_type', 'commercial'), RESULT.PASS);
  assert.equal(evaluateField('property_type', 'industrial'), RESULT.PASS);
  assert.equal(evaluateField('property_type', 'agricultural'), RESULT.FAIL);
});

test('ownership: sole and joint are both eligible', () => {
  assert.equal(evaluateField('ownership_status', 'sole'), RESULT.PASS);
  assert.equal(evaluateField('ownership_status', 'joint'), RESULT.PASS);
});

test('documents: originals must be available', () => {
  assert.equal(evaluateField('documents_available', true), RESULT.PASS);
  assert.equal(evaluateField('documents_available', false), RESULT.FAIL);
});

test('loan amount: up to ₹75 lakh passes, above needs the ₹75 lakh confirmation (never a fail)', () => {
  assert.equal(evaluateField('loan_amount', 10 * LAKH), RESULT.PASS);
  assert.equal(evaluateField('loan_amount', MAX_LOAN_AMOUNT), RESULT.PASS);
  assert.equal(evaluateField('loan_amount', MAX_LOAN_AMOUNT + 1), RESULT.NEEDS_ACTION);
  assert.equal(evaluateField('loan_amount', 200 * LAKH), RESULT.NEEDS_ACTION);
});

test('occupation and income: salaried or self-employed, income through bank only', () => {
  assert.equal(evaluateField('occupation', 'salaried'), RESULT.PASS);
  assert.equal(evaluateField('occupation', 'self_employed'), RESULT.PASS);
  assert.equal(evaluateField('income_mode', 'bank'), RESULT.PASS);
  assert.equal(evaluateField('income_mode', 'cash'), RESULT.FAIL);
});

test('market value is captured only — no threshold in either direction', () => {
  for (const value of [1, 5 * LAKH, 50 * LAKH, 10_000 * LAKH]) {
    assert.equal(evaluateField('market_value', value), RESULT.PASS, `value ${value}`);
  }
});

test('tenure: 3 to 15 years inclusive', () => {
  const cases = [
    [2, RESULT.FAIL],
    [2.9, RESULT.FAIL],
    [3, RESULT.PASS],
    [10, RESULT.PASS],
    [15, RESULT.PASS],
    [15.5, RESULT.FAIL],
    [16, RESULT.FAIL],
    [20, RESULT.FAIL],
  ];
  for (const [years, expected] of cases) assert.equal(evaluateField('tenure', years), expected, `${years} years`);
});

test('unanswered fields are neither pass nor fail', () => {
  assert.equal(evaluateField('tenure', UNKNOWN), RESULT.UNANSWERED);
  assert.equal(evaluateField('income_mode', UNKNOWN), RESULT.UNANSWERED);
});

test('findDisqualification reports the failing field and ignores unanswered ones', () => {
  const state = { ...createInitialState(), property_type: 'residential', income_mode: 'cash' };
  const failure = findDisqualification(state);
  assert.equal(failure.field, 'income_mode');
  assert.match(failure.reason, /cash/i);
  assert.equal(findDisqualification(createInitialState()), null);
});

test('handoff gate opens only with all 7 items answered and passing', () => {
  assert.equal(canHandoff(completeEligibleState()), true);

  for (const field of ['property_type', 'ownership_status', 'documents_available', 'loan_amount', 'occupation', 'income_mode', 'market_value', 'tenure']) {
    const state = { ...completeEligibleState(), [field]: UNKNOWN };
    assert.equal(canHandoff(state), false, `handoff must be blocked while ${field} is unknown`);
  }
});

test('handoff gate stays closed for transfer cases, failed rules, pending confirmations and unverified customers', () => {
  assert.equal(canHandoff({ ...completeEligibleState(), existing_property_loan: true }), false);
  assert.equal(canHandoff({ ...completeEligibleState(), emi_reduction_request: true }), false);
  assert.equal(canHandoff({ ...completeEligibleState(), tenure: 16 }), false);
  assert.equal(canHandoff({ ...completeEligibleState(), loan_amount: 90 * LAKH }), false);
  assert.equal(canHandoff({ ...completeEligibleState(), pending_confirmation: { kind: 'loan_cap' } }), false);
  assert.equal(canHandoff({ ...completeEligibleState(), customer_verified: UNKNOWN }), false);
});

test('first missing item follows checklist order and treats item 5 as two facts', () => {
  const state = { ...completeEligibleState(), income_mode: UNKNOWN, ownership_status: UNKNOWN };
  assert.equal(firstMissingItem(state).id, 'ownership_status');
  state.ownership_status = 'joint';
  assert.equal(firstMissingItem(state).id, 'occupation_income');
  state.income_mode = 'bank';
  assert.equal(firstMissingItem(state), null);
});
