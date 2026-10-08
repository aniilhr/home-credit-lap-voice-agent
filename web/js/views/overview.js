import { CHECKLIST } from '/src/engine/index.js';
import { h, pageHeader, panel, table, tag } from '../dom.js';
import { OUTCOME_INFO } from '../format.js';

const STATUS = [
  ['System prompt with dynamic variables', 'Implemented', 'prompts/system-prompt.md'],
  ['Eligibility rules and handoff gate', 'Implemented', 'src/engine/rules.js'],
  ['Reference conversation engine (state machine)', 'Implemented', 'src/engine/conversation.js'],
  ['Automated tests and 25 call scenarios', 'Implemented', 'tests/, src/scenarios/'],
  ['Prompt renderer for platform variables', 'Implemented', 'scripts/render-prompt.js'],
  ['Agent created on a voice platform', 'Needs platform account', 'docs/voice-platform-setup.md'],
  ['Test calls, recordings and transcripts', 'Needs platform account', 'submission/call-log.md'],
  ['Public link to call recordings and logs', 'Needs platform account', 'submission/call-log.md'],
];

const OUTCOME_DESCRIPTIONS = {
  QUALIFIED_HANDOFF: 'All 7 items answered and every rule passed. A senior loan expert calls back with exact rates.',
  DISQUALIFIED: 'A mandatory criterion failed. The agent explains politely and ends the call.',
  TRANSFER_TO_SPECIALIST: 'Existing loan on the property or a request to reduce a current EMI.',
  CALLBACK_SCHEDULED: 'Customer was busy. A preferred callback time is captured.',
  LOAN_CAP_DECLINED: 'Customer wanted more than ₹75 lakh and declined the ₹75 lakh option.',
  NOT_INTERESTED: 'Customer declined the offer.',
  WRONG_PERSON: 'Someone other than the customer answered. No offer details are shared.',
};

export function renderOverview() {
  return h(
    'div',
    {},
    pageHeader(
      'Overview',
      'An outbound voice agent that tells existing Home Credit customers about a pre-approved Loan Against Property offer of up to ₹75 lakh, runs a preliminary eligibility check, and hands qualified leads to a senior loan expert.',
    ),
    h(
      'div',
      { class: 'grid-2' },
      panel(
        'Eligibility checklist',
        h(
          'ol',
          { class: 'small', style: 'margin:0;padding-left:20px' },
          CHECKLIST.map((item) => h('li', {}, item.label)),
        ),
      ),
      panel(
        'How each turn is processed',
        h(
          'ol',
          { class: 'small', style: 'margin:0;padding-left:20px' },
          h('li', {}, 'Extract every fact in the customer’s reply, including out-of-order answers.'),
          h('li', {}, 'Store new facts; the latest clear answer replaces earlier ones.'),
          h('li', {}, 'Stop immediately if a mandatory criterion fails.'),
          h('li', {}, 'Route to the loan-transfer specialist on an existing loan or EMI-reduction request.'),
          h('li', {}, 'Ask only the earliest unanswered checklist item.'),
          h('li', {}, 'Hand off only when all 7 items are answered and passing.'),
        ),
      ),
    ),
    panel(
      'Call outcomes',
      table(
        ['Outcome', 'When it happens'],
        Object.entries(OUTCOME_INFO).map(([key, info]) =>
          h('tr', {}, h('td', { class: 'nowrap' }, tag(info.label, info.variant)), h('td', {}, OUTCOME_DESCRIPTIONS[key])),
        ),
      ),
      { bodyClass: '' },
    ),
    panel(
      'Implementation status',
      table(
        ['Deliverable', 'Status', 'Location'],
        STATUS.map(([name, status, where]) =>
          h(
            'tr',
            {},
            h('td', {}, name),
            h('td', { class: 'nowrap' }, tag(status, status === 'Implemented' ? 'pass' : 'warn')),
            h('td', { class: 'mono small' }, where),
          ),
        ),
      ),
      { bodyClass: '' },
    ),
  );
}
