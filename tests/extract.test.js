import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CRORE, LAKH } from '../src/engine/constants.js';
import { analyzeUtterance } from '../src/engine/extract.js';
import { convertNumberWords, findMoneyMentions, formatRupees, normalizeText } from '../src/engine/text.js';

const facts = (text, awaiting = null, phase = 'qualification') => analyzeUtterance(text, { awaiting, phase }).facts;
const intents = (text, awaiting = null, phase = 'qualification') => analyzeUtterance(text, { awaiting, phase }).intents;

test('money parsing handles lakh, crore, spelled-out numbers and rupee figures', () => {
  const parse = (text) => findMoneyMentions(convertNumberWords(normalizeText(text))).map((m) => m.value);
  assert.deepEqual(parse('75 lakh'), [75 * LAKH]);
  assert.deepEqual(parse('about 1.2 crore'), [1.2 * CRORE]);
  assert.deepEqual(parse('Rs. 75,00,000'), [75 * LAKH]);
  assert.deepEqual(parse('seventy-five lakhs'), [75 * LAKH]);
  assert.deepEqual(parse('one and a half crore'), [1.5 * CRORE]);
  assert.deepEqual(parse('half a crore'), [0.5 * CRORE]);
  assert.deepEqual(parse('somewhere between 60 to 70 lakh'), [70 * LAKH]);
});

test('formatRupees speaks Indian units', () => {
  assert.equal(formatRupees(75 * LAKH), '₹75 lakh');
  assert.equal(formatRupees(1.2 * CRORE), '₹1.2 crore');
  assert.equal(formatRupees(50_000), '₹50,000');
});

test('amounts are attributed to loan amount or market value by context', () => {
  const f = facts('My house is worth around one crore and I need 60 lakhs.');
  assert.equal(f.market_value, 1 * CRORE);
  assert.equal(f.loan_amount, 60 * LAKH);
});

test('income figures are not mistaken for loan amount or market value', () => {
  const f = facts('I earn ₹80,000 a month and my property is worth about 1 crore.');
  assert.equal(f.loan_amount, undefined);
  assert.equal(f.market_value, 1 * CRORE);
});

test('out-of-order answer captures every fact in one utterance', () => {
  const f = facts("I have a residential property, it's jointly owned with my wife, and it's worth around one crore.", 'property_type');
  assert.deepEqual(
    { property_type: f.property_type, ownership_status: f.ownership_status, market_value: f.market_value },
    { property_type: 'residential', ownership_status: 'joint', market_value: 1 * CRORE },
  );
});

test('several answers in one sentence', () => {
  const f = facts("It's my own residential property, original documents are available, I need 40 lakhs and I'd prefer 10 years.");
  assert.equal(f.property_type, 'residential');
  assert.equal(f.ownership_status, 'sole');
  assert.equal(f.documents_available, true);
  assert.equal(f.loan_amount, 40 * LAKH);
  assert.equal(f.tenure, 10);
});

test('the latest clear answer wins after a correction', () => {
  assert.equal(facts("It's a 10-year tenure... actually, make that 12 years.").tenure, 12);
  assert.equal(facts("It's residential... actually no, it's agricultural land.").property_type, 'agricultural');
});

test('negated categories are not captured', () => {
  assert.equal(facts("It's not agricultural, it's a residential plot with a house.").property_type, 'residential');
  assert.equal(facts('Not in cash, it comes to my bank account.', 'occupation_income').income_mode, 'bank');
});

test('location phrases do not set property type', () => {
  assert.equal(facts('The originals are at home.', 'documents_available').property_type, undefined);
});

test('running a shop is an occupation, not a commercial property', () => {
  const f = facts('I run a small shop.');
  assert.equal(f.occupation, 'self_employed');
  assert.equal(f.property_type, undefined);
});

test('uncertain document answers are flagged for clarification, not assumed', () => {
  const result = analyzeUtterance('I think the papers are probably somewhere.', { awaiting: 'documents_available' });
  assert.equal(result.facts.documents_available, undefined);
  assert.deepEqual(result.ambiguous, ['documents_available']);
});

test('document availability: originals at home pass, photocopies fail', () => {
  assert.equal(facts("I've got the original papers somewhere at home.", 'documents_available').documents_available, true);
  assert.equal(facts('Yes.', 'documents_available').documents_available, true);
  assert.equal(facts('I only have photocopies.', 'documents_available').documents_available, false);
  assert.equal(facts('No.', 'documents_available').documents_available, false);
  assert.equal(facts('The originals got lost in a flood.', 'documents_available').documents_available, false);
});

test('originals held by a bank signal an existing loan on the property', () => {
  const i = intents('The original documents are with the bank.', 'documents_available');
  assert.equal(i.existingLoan, true);
  assert.equal(i.lenderHoldsDocuments, true);
});

test('income mode: "most of my income comes into my bank" is bank; an even split is ambiguous', () => {
  assert.equal(
    facts('I run a small business and most of my income comes directly into my bank account.').income_mode,
    'bank',
  );
  const split = analyzeUtterance('Half of it comes in cash and half in the bank.', { awaiting: 'occupation_income' });
  assert.equal(split.facts.income_mode, undefined);
  assert.ok(split.ambiguous.includes('income_mode'));
});

test('self-employed wins over a weak salaried signal', () => {
  assert.equal(facts("I'm self-employed, working for 8 years in my own business.").occupation, 'self_employed');
  assert.equal(facts("I'm salaried, I work for an IT company.").occupation, 'salaried');
});

test('existing loan on the property is detected; denials and other loan types are not', () => {
  assert.equal(intents('I already have a home loan on this house.').existingLoan, true);
  assert.equal(intents('There is a loan against this property already.').existingLoan, true);
  assert.equal(intents("No, I don't have any existing loan on it.").existingLoan, false);
  assert.equal(intents('There is no loan on it.').existingLoan, false);
  assert.equal(intents('I already have a car loan, but the house is clear.').existingLoan, false);
  assert.equal(intents('I want to take a loan against my house.').existingLoan, false);
});

test('EMI reduction is detected, but a question about the new EMI is not', () => {
  assert.equal(intents('I want to reduce my EMI.').emiReduction, true);
  assert.equal(intents('My current EMI is too high.').emiReduction, true);
  assert.equal(intents('Can I do a balance transfer?').emiReduction, true);
  assert.equal(intents('What would the EMI be for 40 lakh?').emiReduction, false);
  assert.equal(intents('Can I reduce the EMI by choosing a longer tenure?').emiReduction, false);
});

test('busy and availability signals', () => {
  assert.equal(intents("I'm driving right now, call me later.", null, 'availability').busy, true);
  assert.equal(intents("No no, I'm not busy, go ahead.", null, 'availability').busy, false);
});

test('a bare number for a money question asks for confirmation instead of guessing the unit', () => {
  const result = analyzeUtterance('Around 50.', { awaiting: 'loan_amount' });
  assert.equal(result.facts.loan_amount, undefined);
  assert.deepEqual(result.confirm, { field: 'loan_amount', value: 50 * LAKH });
});

test('a bare number answers the tenure question', () => {
  assert.equal(facts('12', 'tenure').tenure, 12);
  assert.equal(facts('36 months', 'tenure').tenure, 3);
});

test('years of ownership or work are not mistaken for tenure', () => {
  assert.equal(facts("I've owned it for 20 years.").tenure, undefined);
  assert.equal(facts("I've been running my business for 12 years.").tenure, undefined);
});
