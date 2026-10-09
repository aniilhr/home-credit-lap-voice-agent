import { h, pageHead } from '../dom.js';

const STAGES = [
  {
    title: 'Greeting and verification',
    detail: 'Agent introduces itself and the company, then confirms it is speaking with the customer.',
    branches: [
      'Asks who is calling → introduce again without offer details, re-ask.',
      'Wrong person or wrong number → apologise, end the call. No offer details shared.',
    ],
  },
  {
    title: 'Availability',
    detail: 'Short reason for the call and a check that now is a good time.',
    branches: ['Busy → ask for a callback time, confirm it, end the call.', 'Not interested → thank and end the call.'],
  },
  {
    title: 'Offer and fresh-loan check',
    detail: 'Pre-approved Loan Against Property offer of up to ₹75 lakh as a reward for loyalty, then one question about any loan already on the property.',
    branches: ['Existing loan on the property or wants to reduce a current EMI → loan-transfer specialist, end the call.'],
  },
  {
    title: 'Seven-item qualification',
    detail: 'After every reply: extract all facts, store them, check rules, check transfer intent, then ask only the earliest unanswered item.',
    branches: [
      'Failing answer (agricultural, no originals, cash income, tenure outside 3–15 years) → disqualify immediately.',
      'Amount above ₹75 lakh → offer ₹75 lakh. Accept → continue. Decline → end politely.',
      'Uncertain answer → one clarifying question; nothing is assumed.',
      'Question or interruption → brief answer from product context (or defer to the senior expert), then resume.',
      'Existing loan or EMI reduction mentioned at any point → transfer branch.',
    ],
  },
  {
    title: 'Final handoff',
    detail: 'Only when all 7 items are answered and every rule has passed: a senior loan expert will call shortly with exact interest rates and next steps.',
    branches: [],
  },
  {
    title: 'Call termination',
    detail: 'Every path ends with one polite closing line and the call is ended. No further questions after a closing line.',
    branches: [],
  },
];

export function renderFlow() {
  return h(
    'div',
    {},
    pageHead(
      'Call flow',
      'Stages and exits',
      'Each stage, and the branches that can end the call early. docs/conversation-flow.md has the same flow as a Mermaid state machine.',
    ),
    h(
      'section',
      { class: 'glass card--pad' },
      h(
        'ol',
        { class: 'steps' },
        STAGES.map((stage) =>
          h(
            'li',
            {},
            h('div', { class: 'steps__title' }, stage.title),
            h('div', { class: 'steps__detail' }, stage.detail),
            stage.branches.length ? h('ul', { class: 'branches' }, stage.branches.map((b) => h('li', {}, b))) : null,
          ),
        ),
      ),
    ),
  );
}
