import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAKH, OUTCOMES, UNKNOWN } from '../src/engine/constants.js';
import { ConfigError, createSession, extractTimePhrase, processTurn, startCall } from '../src/engine/conversation.js';
import { BASE_CONFIG } from '../src/scenarios/scenarios.js';

/** Starts a call and plays the given customer turns. Returns the final result plus all replies. */
function play(turns, config = {}) {
  let { session } = startCall(createSession({ ...BASE_CONFIG, ...config }));
  const replies = [];
  let last;
  for (const utterance of turns) {
    last = processTurn(session, utterance);
    session = last.session;
    replies.push(last.reply);
  }
  return { session, state: session.state, replies, last };
}

const OPEN = ['Yes, this is Rahul.', 'Yes, go ahead.', 'No, it is a fresh loan.'];

test('config validation rejects missing or unsupported values', () => {
  assert.throws(() => createSession({ ...BASE_CONFIG, customer_name: '' }), ConfigError);
  assert.throws(() => createSession({ ...BASE_CONFIG, agent_gender: 'robot' }), /agent_gender/);
  assert.throws(() => createSession({ ...BASE_CONFIG, language_to_speak: 'French' }), /language_to_speak/);
  assert.doesNotThrow(() => createSession({ ...BASE_CONFIG, language_to_speak: 'Hindi', agent_gender: 'male' }));
});

test('opening line uses the configured names', () => {
  const { reply } = startCall(createSession({ ...BASE_CONFIG, agent_name: 'Arjun', customer_name: 'Meera' }));
  assert.match(reply, /Arjun/);
  assert.match(reply, /Meera/);
  assert.match(reply, /Home Credit/);
});

test('empty utterances are rejected', () => {
  const { session } = startCall(createSession(BASE_CONFIG));
  assert.throws(() => processTurn(session, '   '), TypeError);
});

test('agricultural property disqualifies immediately and no further question is asked', () => {
  const { state, replies } = play([...OPEN, "It's agricultural land."]);
  assert.equal(state.outcome, OUTCOMES.DISQUALIFIED);
  assert.equal(state.disqualified, true);
  assert.equal(state.awaiting, null);
  assert.doesNotMatch(replies.at(-1), /\?/, 'the closing line must not ask another question');
  assert.match(replies.at(-1), /criteria for this specific offer/);
});

test('cash income disqualifies even when it arrives out of order', () => {
  const { state } = play([...OPEN, "Residential flat. By the way I'm self-employed and I get paid in cash."]);
  assert.equal(state.outcome, OUTCOMES.DISQUALIFIED);
  assert.equal(state.income_mode, 'cash');
  assert.equal(state.ownership_status, UNKNOWN, 'no further items are collected after disqualification');
});

test('missing original documents disqualify', () => {
  const { state } = play([...OPEN, 'Residential.', 'Sole.', "No, I don't have the originals."]);
  assert.equal(state.outcome, OUTCOMES.DISQUALIFIED);
  assert.equal(state.documents_available, false);
});

test('tenure below 3 and above 15 years disqualify; boundaries pass', () => {
  const prefix = [...OPEN, 'Residential, sole owner, originals available.', '40 lakh.', 'Salaried, bank.', 'About 1 crore.'];
  assert.equal(play([...prefix, '2 years.']).state.outcome, OUTCOMES.DISQUALIFIED);
  assert.equal(play([...prefix, '16 years.']).state.outcome, OUTCOMES.DISQUALIFIED);
  assert.equal(play([...prefix, '3 years.']).state.outcome, OUTCOMES.QUALIFIED_HANDOFF);
  assert.equal(play([...prefix, '15 years.']).state.outcome, OUTCOMES.QUALIFIED_HANDOFF);
});

test('loan above ₹75 lakh offers ₹75 lakh instead of rejecting', () => {
  const { state, replies } = play([...OPEN, 'Residential.', 'Sole.', 'Yes.', 'I need 90 lakhs.']);
  assert.equal(state.outcome, null, 'call continues');
  assert.equal(state.disqualified, false);
  assert.equal(state.requested_loan_amount, 90 * LAKH);
  assert.equal(state.loan_amount, UNKNOWN);
  assert.match(replies.at(-1), /up to ₹75 lakh/);
  assert.match(replies.at(-1), /proceed with ₹75 lakh\?/);
});

test('accepting the ₹75 lakh alternative continues with ₹75 lakh', () => {
  const { state, replies } = play([...OPEN, 'Residential.', 'Sole.', 'Yes.', 'I need 90 lakhs.', 'Yes, that works.']);
  assert.equal(state.loan_amount, 75 * LAKH);
  assert.equal(state.pending_confirmation, null);
  assert.equal(state.awaiting, 'occupation_income');
  assert.match(replies.at(-1), /salaried or self-employed/);
});

test('choosing a lower amount after the cap explanation is accepted', () => {
  const { state } = play([...OPEN, 'Residential.', 'Sole.', 'Yes.', 'One crore.', 'Okay, make it 70 lakh then.']);
  assert.equal(state.loan_amount, 70 * LAKH);
  assert.equal(state.awaiting, 'occupation_income');
});

test('declining the ₹75 lakh alternative ends the call politely', () => {
  const { state, replies } = play([...OPEN, 'Residential.', 'Sole.', 'Yes.', 'One crore.', 'No.']);
  assert.equal(state.outcome, OUTCOMES.LOAN_CAP_DECLINED);
  assert.equal(state.disqualified, false);
  assert.match(replies.at(-1), /Thank you/);
});

test('existing loan answer at the fresh-loan check routes to the transfer specialist', () => {
  const { state, replies } = play(['Yes.', 'Sure.', 'Yes, there is a home loan running on it.']);
  assert.equal(state.outcome, OUTCOMES.TRANSFER_TO_SPECIALIST);
  assert.equal(state.existing_property_loan, true);
  assert.equal(state.transfer_required, true);
  assert.match(replies.at(-1), /loan-transfer specialist/);
  assert.equal(state.property_type, UNKNOWN, 'none of the 7 questions are asked');
});

test('EMI reduction mid-flow stops the fresh-loan questions', () => {
  const { state, last } = play([...OPEN, 'Commercial shop.', 'Honestly I just want to lower my existing EMI.']);
  assert.equal(state.outcome, OUTCOMES.TRANSFER_TO_SPECIALIST);
  assert.equal(state.emi_reduction_request, true);
  assert.ok(!last.events.some((e) => e.type === 'next_question'));
});

test('a later turn after the call has ended produces no reply', () => {
  const { session } = play([...OPEN, "It's agricultural land."]);
  const after = processTurn(session, 'Wait, can you check again?');
  assert.equal(after.reply, null);
  assert.equal(after.session, session);
});

test('joint ownership and bank income go all the way to handoff', () => {
  const { state, replies } = play([
    ...OPEN,
    'Residential, jointly owned with my wife.',
    'Yes, originals are with us.',
    '40 lakh.',
    'Self-employed, payments come into my bank account.',
    'About 1 crore.',
    '12 years.',
  ]);
  assert.equal(state.outcome, OUTCOMES.QUALIFIED_HANDOFF);
  assert.match(replies.at(-1), /senior loan expert/);
  assert.match(replies.at(-1), /interest rate/);
});

test('handoff is blocked until the 7th item is answered, even if the customer asks to finish', () => {
  const { state, replies } = play([
    ...OPEN,
    'Residential, sole owner, originals available.',
    '40 lakh.',
    'Salaried, bank.',
    'About 1 crore.',
    "That's everything, am I eligible?",
  ]);
  assert.equal(state.outcome, null);
  assert.equal(state.awaiting, 'tenure');
  assert.doesNotMatch(replies.at(-1), /meet the preliminary criteria/);
});

test('item 5 asks only for the missing half', () => {
  const { state, replies } = play([...OPEN, 'Residential, sole, originals available.', '40 lakh.', "I'm salaried."]);
  assert.equal(state.occupation, 'salaried');
  assert.equal(state.awaiting, 'occupation_income');
  assert.match(replies.at(-1), /bank account, or in cash/);
  assert.doesNotMatch(replies.at(-1), /salaried or self-employed/);
});

test('ambiguous document answer triggers a clarification and stays unknown', () => {
  const { state, replies } = play([...OPEN, 'Residential.', 'Sole.', 'I think the papers are probably somewhere.']);
  assert.equal(state.documents_available, UNKNOWN);
  assert.equal(state.awaiting, 'documents_available');
  assert.match(replies.at(-1), /Just to confirm/);
});

test('a correction several turns later overwrites the earlier answer', () => {
  const { state, last } = play([...OPEN, 'Residential.', 'Sole owner.', 'Sorry, actually it is jointly owned with my brother.']);
  assert.equal(state.ownership_status, 'joint');
  assert.ok(last.events.some((e) => e.type === 'fact_corrected' && e.field === 'ownership_status'));
  assert.equal(state.awaiting, 'documents_available');
});

test('interest-rate question gets no invented figure and the flow resumes', () => {
  const { state, replies } = play([...OPEN, 'What is the interest rate?']);
  assert.doesNotMatch(replies.at(-1), /\d+(\.\d+)?\s*%|percent/);
  assert.match(replies.at(-1), /senior loan expert/);
  assert.equal(state.awaiting, 'property_type');
});

test('interest-rate question is answered from RAG context when provided', () => {
  const rag = 'Interest rates for this campaign are communicated only by the senior loan expert.\nProcessing is done at the nearest branch.';
  const { replies } = play([...OPEN, 'What is the interest rate?'], { additional_context_from_rag: rag });
  assert.match(replies.at(-1), /^Interest rates for this campaign/);
});

test('busy customer: callback time captured, nothing else asked', () => {
  const { state, replies } = play(['Yes, speaking.', "I'm driving right now."]);
  assert.equal(state.phase, 'callback');
  assert.match(replies.at(-1), /convenient time/);
  const done = play(['Yes, speaking.', "I'm driving right now.", 'Try me this evening around 7 pm.']);
  assert.equal(done.state.outcome, OUTCOMES.CALLBACK_SCHEDULED);
  assert.equal(done.state.callback_time, 'evening around 7 pm');
  assert.equal(done.state.property_type, UNKNOWN);
});

test('callback time is captured even when given with the busy message', () => {
  const { state } = play(["Yes, it's me, but I'm in a meeting. Call me after 5 pm."]);
  assert.equal(state.outcome, OUTCOMES.CALLBACK_SCHEDULED);
  assert.equal(state.callback_time, 'after 5 pm');
});

test('extractTimePhrase spans the whole time expression', () => {
  assert.equal(extractTimePhrase('Call me tomorrow after six pm'), 'tomorrow after 6 pm');
  assert.equal(extractTimePhrase('Sorry, I am busy'), null);
});

test('wrong person: no offer details are shared', () => {
  const { state, replies } = play(['No, this is his wife speaking.']);
  assert.equal(state.outcome, OUTCOMES.WRONG_PERSON);
  assert.doesNotMatch(replies.at(-1), /lakh|loan|offer/i);
});

test('who-is-calling gets an introduction without offer details, then verification continues', () => {
  const { state, replies } = play(['Who is this?']);
  assert.equal(state.customer_verified, UNKNOWN);
  assert.match(replies.at(-1), /Priya/);
  assert.doesNotMatch(replies.at(-1), /lakh|Loan Against Property/);
});

test('"Hello?" is treated as a presence check, not a product question', () => {
  const { state, replies } = play([...OPEN, 'Hello?']);
  assert.match(replies.at(-1), /^Yes, I can hear you\./);
  assert.doesNotMatch(replies.at(-1), /don't have that information/);
  assert.equal(state.awaiting, 'property_type');
});

test('"not now" at the availability check starts the callback branch', () => {
  const { state, replies } = play(['Yes, speaking.', 'Not now, please.']);
  assert.equal(state.phase, 'callback');
  assert.match(replies.at(-1), /convenient time/);
});

test('retired customer: one clarification, then criteria not met if neither salaried nor self-employed', () => {
  const prefix = [...OPEN, 'Residential, sole, originals available.', '40 lakh.', "I'm retired actually."];
  const asked = play(prefix);
  assert.equal(asked.state.outcome, null);
  assert.match(asked.replies.at(-1), /salary from a job, or run your own business/);
  const done = play([...prefix, 'No, neither.']);
  assert.equal(done.state.outcome, OUTCOMES.DISQUALIFIED);
  assert.equal(done.state.occupation, 'other');
});

test('a split income answer is clarified, and the captured occupation is acknowledged', () => {
  const { state, replies } = play([...OPEN, 'Residential, sole, originals available.', '40 lakh.', 'Half cash and half bank, I am self employed.']);
  assert.equal(state.occupation, 'self_employed');
  assert.equal(state.income_mode, UNKNOWN);
  assert.match(replies.at(-1), /self-employed/);
  assert.match(replies.at(-1), /Just to confirm/);
});
