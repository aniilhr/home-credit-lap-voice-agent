/**
 * Reference agent phrasing (English) used by the simulator and tests.
 * Short, spoken-style turns. The live agent generates its own wording from
 * the system prompt; these lines show the intended tone and content.
 */

import { INCOME_MODE, MAX_TENURE_YEARS, MIN_TENURE_YEARS, OCCUPATION, OWNERSHIP, UNKNOWN } from './constants.js';
import { formatRupees } from './text.js';

const ACKS = ['Got it', 'Thank you', 'Noted', 'Understood'];

export function ack(turn) {
  return ACKS[turn % ACKS.length];
}

export function describeFact(field, value) {
  switch (field) {
    case 'property_type':
      return `a ${value} property`;
    case 'ownership_status':
      return value === OWNERSHIP.SOLE ? 'in your name alone' : 'jointly owned';
    case 'documents_available':
      return value ? 'original documents available' : 'original documents not available';
    case 'loan_amount':
      return `a loan of ${formatRupees(value)}`;
    case 'occupation':
      return value === OCCUPATION.SALARIED ? 'salaried' : value === OCCUPATION.SELF_EMPLOYED ? 'self-employed' : value;
    case 'income_mode':
      return value === INCOME_MODE.BANK ? 'income received in your bank account' : 'income received in cash';
    case 'market_value':
      return `worth about ${formatRupees(value)}`;
    case 'tenure':
      return `a ${value}-year tenure`;
    default:
      return String(value);
  }
}

export const lines = {
  opening: ({ agent_name, company_name, customer_name }) =>
    `Hello, this is ${agent_name} calling from ${company_name}. Am I speaking with ${customer_name}?`,

  identify: ({ agent_name, company_name, customer_name }) =>
    `I'm ${agent_name}, calling from ${company_name} about your account with us. May I know if I'm speaking with ${customer_name}?`,

  reVerify: ({ customer_name }) => `Sorry, I didn't quite catch that. Am I speaking with ${customer_name}?`,

  wrongPerson: ({ customer_name }) =>
    `I'm sorry for the trouble. I'll try to reach ${customer_name} another time. Have a good day.`,

  availability: ({ customer_name, company_name }) =>
    `Thank you, ${customer_name}. I'm calling with an offer for you as an existing ${company_name} customer. It'll take about two minutes — is this a good time to talk?`,

  reAvailability: () => 'Sorry, I missed that. Is now a good time for a quick two-minute conversation?',

  askCallbackTime: () => 'No problem at all. What would be a convenient time for us to call you back?',

  reAskCallbackTime: () => 'Would later today or sometime tomorrow work better for you?',

  callbackConfirmed: (time) =>
    `Thank you, I've noted ${time}. We'll call you back then. Have a good day.`,

  callbackUnspecified: () =>
    "No problem. We'll try you again at a more convenient time. Have a good day.",

  offerIntro: ({ company_name }) =>
    `To thank you for being a valued ${company_name} customer, you have a pre-approved Loan Against Property offer of up to ₹75 lakh. I just need a few quick details to check your eligibility.`,

  existingLoanQuestion: () => "First — is there any loan currently running on the property you'd use for this?",

  reAskExistingLoan: () => 'And just to check — is there any loan currently running on that property?',

  notInterested: ({ customer_name }) =>
    `No problem at all, ${customer_name}. Thank you for your time, and have a good day.`,

  transfer: ({ customer_name }, reason) =>
    reason === 'emi'
      ? `Thank you for telling me. Since you're looking to reduce your current EMI, this will be handled by our loan-transfer specialist, who will contact you shortly. Thank you for your time, ${customer_name}.`
      : `Thank you for telling me. Since there's already a loan on the property, this will be handled by our loan-transfer specialist, who will contact you shortly. Thank you for your time, ${customer_name}.`,

  disqualified: ({ customer_name }, field) =>
    `Thank you for sharing that, ${customer_name}. I'm sorry, but ${DISQUALIFY_REASON[field] ?? 'that does not meet the requirements'}, so you don't meet the criteria for this specific offer at this time. Thank you for your time, and have a good day.`,

  loanCap: (requested) =>
    `I understand. This offer supports a loan of up to ₹75 lakh, so ${formatRupees(requested)} would be above the limit. Would you like to proceed with ₹75 lakh?`,

  loanCapDeclined: ({ customer_name }) =>
    `I understand, ${customer_name}. Since this offer goes up to ₹75 lakh, I won't take more of your time today. Thank you, and have a good day.`,

  confirmAmount: (value) => `Just to confirm, is that ${formatRupees(value)}?`,

  clarify: {
    property_type: 'Just to make sure I have this right — is the property residential, commercial, industrial, or agricultural?',
    ownership_status: 'Just to confirm — is the property in your name alone, or jointly owned with someone else?',
    documents_available: 'Just to confirm — do you have the original property documents available for verification?',
    occupation: 'Just to confirm — are you salaried, or self-employed?',
    income_mode: 'Just to confirm — is your income received in your bank account, or in cash?',
  },

  occupationOutside: () =>
    'Thank you. For this offer I need to check your current source of income — do you earn a salary from a job, or run your own business?',

  handoff: ({ customer_name, company_name }) =>
    `Thank you, ${customer_name}. Based on what you've shared, you meet the preliminary criteria for this offer. A senior loan expert from ${company_name} will call you shortly with the exact interest rate and next steps. Thank you for your time, and have a good day.`,

  interestFallback: () =>
    'The exact interest rate will be shared by our senior loan expert once this preliminary check is complete.',

  documentsListFallback: () =>
    'Our senior loan expert will share the complete document list with you. For now I only need to know whether the original property documents are available.',

  unknownAnswer: () =>
    "I don't have that information on this call, but our senior loan expert will be able to help you with it.",

  eligibilityPending: () => "I'll be able to tell you once I've gone through a few more details.",

  goAhead: () => 'Of course, please go ahead.',

  hold: () => 'Sure, take your time.',

  presence: () => 'Yes, I can hear you.',

  notCaught: () => "Sorry, I didn't quite catch that.",

};

const DISQUALIFY_REASON = {
  property_type: "this offer doesn't cover agricultural property",
  documents_available: 'original property documents are required for this offer',
  income_mode: 'this offer requires income to be received through a bank account',
  occupation: 'this offer is available only for salaried or self-employed customers',
  tenure: `the repayment period for this offer has to be between ${MIN_TENURE_YEARS} and ${MAX_TENURE_YEARS} years`,
};

/** The question for a checklist item, adapted to what is already known. */
export function questionFor(itemId, state) {
  switch (itemId) {
    case 'property_type':
      return 'What type of property is it — residential like a house or flat, commercial like a shop or office, or industrial like a factory?';
    case 'ownership_status':
      return 'Is the property in your name alone, or is it jointly owned with family or a partner?';
    case 'documents_available':
      return 'Do you have the original property documents available for verification?';
    case 'loan_amount':
      return 'How much would you like to borrow against the property?';
    case 'occupation_income':
      if (state.occupation !== UNKNOWN && state.income_mode === UNKNOWN) {
        return 'And is your income received in your bank account, or in cash?';
      }
      if (state.occupation === UNKNOWN && state.income_mode !== UNKNOWN) {
        return 'And are you salaried, or self-employed?';
      }
      return 'Are you salaried or self-employed? And is your income received in your bank account, or in cash?';
    case 'market_value':
      return "Roughly what would the property be worth in today's market?";
    case 'tenure':
      return 'And over how many years would you like to repay the loan?';
    default:
      throw new Error(`Unknown checklist item "${itemId}"`);
  }
}
