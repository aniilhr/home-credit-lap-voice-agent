/**
 * Call scenarios shared by the automated tests and the console's scenario runner.
 *
 * Each scenario is a scripted customer side of a call. `expect` describes the
 * final outcome and state; `checks` assert behaviour after specific turns
 * (1-based customer turn numbers).
 *
 * The customer name and agent name used here are test inputs only.
 */

import { OUTCOMES } from '../engine/constants.js';

export const BASE_CONFIG = Object.freeze({
  company_name: 'Home Credit',
  customer_name: 'Rahul',
  agent_name: 'Priya',
  agent_gender: 'female',
  language_to_speak: 'English',
  additional_context_from_rag: '',
});

/** Standard opening used by most scenarios: verify, accept the call, confirm fresh loan. */
const OPEN = ['Yes, this is Rahul speaking.', 'Sure, go ahead.', 'No, there is no loan on it.'];

export const SCENARIOS = [
  {
    id: 'S01',
    title: 'Eligible customer, standard flow',
    category: 'Happy path',
    turns: [
      ...OPEN,
      "It's a residential flat.",
      "It's only in my name.",
      'Yes, I have the original documents at home.',
      'About 50 lakhs.',
      "I'm salaried and my salary is credited to my bank account.",
      'Roughly one crore.',
      '10 years.',
    ],
    expect: {
      outcome: OUTCOMES.QUALIFIED_HANDOFF,
      state: {
        property_type: 'residential',
        ownership_status: 'sole',
        documents_available: true,
        loan_amount: 5_000_000,
        occupation: 'salaried',
        income_mode: 'bank',
        market_value: 10_000_000,
        tenure: 10,
        disqualified: false,
        transfer_required: false,
      },
    },
  },
  {
    id: 'S02',
    title: 'Agricultural property',
    category: 'Disqualification',
    turns: [...OPEN, "It's agricultural land, our family farm."],
    expect: {
      outcome: OUTCOMES.DISQUALIFIED,
      state: { property_type: 'agricultural', disqualified: true, ownership_status: 'UNKNOWN' },
    },
  },
  {
    id: 'S03',
    title: 'Self-employed, income in cash',
    category: 'Disqualification',
    turns: [
      ...OPEN,
      'A commercial shop.',
      'Sole owner.',
      'Yes, originals are with me.',
      '30 lakh.',
      'I run a kirana store and customers mostly pay me in cash.',
    ],
    expect: {
      outcome: OUTCOMES.DISQUALIFIED,
      state: { occupation: 'self_employed', income_mode: 'cash', disqualified: true, market_value: 'UNKNOWN' },
    },
  },
  {
    id: 'S04',
    title: 'Original documents not available',
    category: 'Disqualification',
    turns: [...OPEN, 'Residential house.', "It's mine.", 'I only have photocopies, the originals got lost.'],
    expect: {
      outcome: OUTCOMES.DISQUALIFIED,
      state: { documents_available: false, disqualified: true, loan_amount: 'UNKNOWN' },
    },
  },
  {
    id: 'S05',
    title: 'Tenure below 3 years',
    category: 'Disqualification',
    turns: [
      ...OPEN,
      'Industrial, a small factory.',
      'Jointly with my partner.',
      'Yes, available.',
      '60 lakhs.',
      'Self-employed, everything comes through the bank account.',
      'Around 2 crore.',
      'Just 2 years.',
    ],
    expect: { outcome: OUTCOMES.DISQUALIFIED, state: { tenure: 2, disqualified: true } },
  },
  {
    id: 'S06',
    title: 'Tenure above 15 years',
    category: 'Disqualification',
    turns: [
      ...OPEN,
      'A residential apartment.',
      'In my name only.',
      'Yes, the originals are in my locker.',
      '45 lakh.',
      'Salaried, paid into my bank account.',
      'Maybe 90 lakh.',
      'I would like 20 years.',
    ],
    expect: { outcome: OUTCOMES.DISQUALIFIED, state: { tenure: 20, disqualified: true } },
  },
  {
    id: 'S07',
    title: 'Requests ₹90 lakh, accepts ₹75 lakh',
    category: '₹75 lakh limit',
    turns: [
      ...OPEN,
      'Residential bungalow.',
      'Sole.',
      'Yes, I have them.',
      'I need around 90 lakhs.',
      'Okay, yes, let us go with 75.',
      'Salaried, bank transfer every month.',
      'It should be worth about 2.5 crore.',
      '15 years.',
    ],
    checks: [{ afterTurn: 7, replyIncludes: 'up to ₹75 lakh', state: { loan_amount: 'UNKNOWN', requested_loan_amount: 9_000_000 } }],
    expect: { outcome: OUTCOMES.QUALIFIED_HANDOFF, state: { loan_amount: 7_500_000, requested_loan_amount: 9_000_000, tenure: 15 } },
  },
  {
    id: 'S08',
    title: 'Requests ₹1 crore, declines ₹75 lakh',
    category: '₹75 lakh limit',
    turns: [...OPEN, 'Commercial office space.', 'Sole owner.', 'Yes.', 'One crore.', "No, that won't be enough for me."],
    expect: { outcome: OUTCOMES.LOAN_CAP_DECLINED, state: { loan_amount: 'UNKNOWN', disqualified: false } },
  },
  {
    id: 'S09',
    title: 'Joint ownership is eligible',
    category: 'Happy path',
    turns: [
      ...OPEN,
      'Residential house.',
      "It's jointly owned with my brother.",
      'Yes, originals are available.',
      '35 lakh.',
      'Self-employed, all my income comes into my current account.',
      'About 80 lakh.',
      'Seven years.',
    ],
    expect: { outcome: OUTCOMES.QUALIFIED_HANDOFF, state: { ownership_status: 'joint', income_mode: 'bank', tenure: 7 } },
  },
  {
    id: 'S10',
    title: 'Existing loan on the property',
    category: 'Transfer',
    turns: ['Yes, speaking.', 'Yes, tell me.', 'Yes, I already have a home loan running on this flat.'],
    expect: {
      outcome: OUTCOMES.TRANSFER_TO_SPECIALIST,
      state: { existing_property_loan: true, transfer_required: true, property_type: 'residential' },
    },
  },
  {
    id: 'S11',
    title: 'EMI reduction request mid-qualification',
    category: 'Transfer',
    turns: [...OPEN, 'Residential.', 'Actually, what I really want is to reduce my current EMI, it is too high.'],
    expect: {
      outcome: OUTCOMES.TRANSFER_TO_SPECIALIST,
      state: { emi_reduction_request: true, transfer_required: true, ownership_status: 'UNKNOWN' },
    },
  },
  {
    id: 'S12',
    title: 'Busy customer asks for a callback',
    category: 'Busy',
    turns: ["Yes, but I'm in a meeting right now.", 'Call me tomorrow after 6 pm.'],
    expect: { outcome: OUTCOMES.CALLBACK_SCHEDULED, state: { callback_time: 'tomorrow after 6 pm', property_type: 'UNKNOWN' } },
  },
  {
    id: 'S13',
    title: 'Out-of-order information',
    category: 'Natural conversation',
    turns: [
      ...OPEN,
      "I have a residential property, it's jointly owned with my wife, and it's worth around one crore.",
      'Yes, the originals are with me.',
      '40 lakh.',
      'Salaried, bank.',
      'Ten years.',
    ],
    checks: [
      {
        afterTurn: 4,
        nextQuestion: 'documents_available',
        state: { property_type: 'residential', ownership_status: 'joint', market_value: 10_000_000 },
      },
      // Market value was given early, so it is never asked: after income the next question is tenure.
      { afterTurn: 7, nextQuestion: 'tenure' },
    ],
    expect: { outcome: OUTCOMES.QUALIFIED_HANDOFF, state: { market_value: 10_000_000 } },
  },
  {
    id: 'S14',
    title: 'Several answers in one sentence',
    category: 'Natural conversation',
    turns: [
      ...OPEN.slice(0, 2),
      "No loan. It's my own residential property, original documents are available, I need 40 lakhs and I'd prefer 10 years.",
      "I'm salaried and the salary comes to my bank account.",
      'Around 95 lakhs.',
    ],
    checks: [
      {
        afterTurn: 3,
        nextQuestion: 'occupation_income',
        state: { property_type: 'residential', ownership_status: 'sole', documents_available: true, loan_amount: 4_000_000, tenure: 10 },
      },
    ],
    expect: { outcome: OUTCOMES.QUALIFIED_HANDOFF, state: { market_value: 9_500_000 } },
  },
  {
    id: 'S15',
    title: 'Customer interrupts with a question',
    category: 'Interruptions',
    turns: [
      ...OPEN,
      "Yes, it's residential — sorry, can I ask something?",
      'What documents will you need from me?',
      'Okay. It is in my name.',
    ],
    checks: [
      { afterTurn: 4, replyIncludes: 'go ahead', nextQuestion: 'ownership_status', state: { property_type: 'residential' } },
      { afterTurn: 5, replyIncludes: 'senior loan expert', nextQuestion: 'ownership_status' },
      { afterTurn: 6, nextQuestion: 'documents_available', state: { property_type: 'residential', ownership_status: 'sole' } },
    ],
    expect: { outcome: null },
  },
  {
    id: 'S16',
    title: 'Ambiguous answer about documents',
    category: 'Ambiguity',
    turns: [...OPEN, 'Residential.', 'Sole.', 'I think the papers are probably somewhere.', 'Yes, I checked, the originals are in the cupboard.'],
    checks: [{ afterTurn: 6, replyIncludes: 'Just to confirm', state: { documents_available: 'UNKNOWN' } }],
    expect: { outcome: null, state: { documents_available: true } },
  },
  {
    id: 'S17',
    title: 'Customer corrects an earlier answer',
    category: 'Corrections',
    turns: [
      ...OPEN,
      'Residential.',
      'Sole.',
      'Yes, originals are there.',
      '25 lakhs.',
      'Salaried with bank credit.',
      'About 70 lakhs.',
      "It's a 10-year tenure... actually, make that 12 years.",
    ],
    expect: { outcome: OUTCOMES.QUALIFIED_HANDOFF, state: { tenure: 12 } },
  },
  {
    id: 'S18',
    title: 'Interest rate question (no context available)',
    category: 'Diversions',
    turns: [...OPEN, 'Before that, what interest rate do you offer?', 'Okay. It is a commercial shop.'],
    checks: [
      { afterTurn: 4, replyIncludes: 'senior loan expert', replyExcludes: '%', nextQuestion: 'property_type' },
      { afterTurn: 5, state: { property_type: 'commercial' }, nextQuestion: 'ownership_status' },
    ],
    expect: { outcome: null },
  },
  {
    id: 'S19',
    title: 'Unrelated question',
    category: 'Diversions',
    turns: [...OPEN, 'Residential.', 'Where is your nearest branch?'],
    checks: [{ afterTurn: 5, replyIncludes: "don't have that information", nextQuestion: 'ownership_status' }],
    expect: { outcome: null, state: { property_type: 'residential' } },
  },
  {
    id: 'S20',
    title: 'Contradiction resolved by correction',
    category: 'Corrections',
    turns: [...OPEN, "It's residential... actually no, it's agricultural land."],
    expect: { outcome: OUTCOMES.DISQUALIFIED, state: { property_type: 'agricultural' } },
  },
  {
    id: 'S21',
    title: 'Wrong person answers',
    category: 'Verification',
    turns: ["No, he's not at home. This is his wife."],
    expect: { outcome: OUTCOMES.WRONG_PERSON, state: { customer_verified: false } },
  },
  {
    id: 'S22',
    title: 'Original documents held by a bank',
    category: 'Transfer',
    turns: [...OPEN.slice(0, 2), 'Residential flat.', 'Sole owner.', 'The original papers are with the bank.'],
    expect: { outcome: OUTCOMES.TRANSFER_TO_SPECIALIST, state: { existing_property_loan: true } },
  },
  {
    id: 'S23',
    title: 'Customer asks "am I eligible?" before all items are answered',
    category: 'Handoff gate',
    turns: [
      ...OPEN,
      'Residential, sole owner, originals available.',
      '40 lakh.',
      'Self-employed, bank.',
      'About 1 crore.',
      'So am I eligible?',
      '8 years.',
    ],
    checks: [{ afterTurn: 8, nextQuestion: 'tenure', state: { outcome: null } }],
    expect: { outcome: OUTCOMES.QUALIFIED_HANDOFF, state: { tenure: 8 } },
  },
  {
    id: 'S24',
    title: 'Product question answered from RAG context',
    category: 'Diversions',
    note: 'The RAG text below is a test fixture used to prove retrieval works; it is not product information.',
    config: {
      additional_context_from_rag:
        'This pre-approved offer is valid only for existing customers contacted in this campaign.',
    },
    turns: [...OPEN, 'Is this offer valid only for existing customers?', 'Residential.'],
    checks: [{ afterTurn: 4, replyIncludes: 'existing customers contacted in this campaign', nextQuestion: 'property_type' }],
    expect: { outcome: null, state: { property_type: 'residential' } },
  },
  {
    id: 'S25',
    title: 'Customer not interested',
    category: 'Call termination',
    turns: ['Yes.', "Sorry, I'm not interested."],
    expect: { outcome: OUTCOMES.NOT_INTERESTED },
  },
];
