import { CHECKLIST } from '/src/engine/index.js';
import { getLlmStatus } from '../api.js';
import { card, h, icon, table, tag } from '../dom.js';
import { OUTCOME_INFO } from '../format.js';

const OUTCOME_DESCRIPTIONS = {
  QUALIFIED_HANDOFF: 'All 7 items answered and passing. A senior loan expert calls back with exact rates.',
  DISQUALIFIED: 'A mandatory criterion failed. Polite explanation, call ends.',
  TRANSFER_TO_SPECIALIST: 'Existing loan on the property, or a request to reduce a current EMI.',
  CALLBACK_SCHEDULED: 'Customer was busy. Preferred callback time captured.',
  LOAN_CAP_DECLINED: 'Wanted more than ₹75 lakh and declined the ₹75 lakh option.',
  NOT_INTERESTED: 'Customer declined the offer.',
  WRONG_PERSON: 'Someone else answered. No offer details shared.',
};

const STATUS = [
  ['Production system prompt (11 dynamic variables)', 'Done', 'prompts/system-prompt.md'],
  ['Live AI agent on Gemini with end-call tool', 'Needs GEMINI_API_KEY', 'src/llm/agent.js'],
  ['State tracker + deterministic rule guard', 'Done', 'src/llm/tracker.js, src/llm/audit.js'],
  ['Live scenario eval against Gemini', 'Needs GEMINI_API_KEY', 'npm run eval:llm'],
  ['Rules engine and automated test suite', 'Done', 'src/engine/, tests/'],
  ['Agent on Retell / Bolna, recorded calls, public link', 'Needs platform account', 'docs/voice-platform-setup.md'],
];

export async function renderOverview() {
  const llm = await getLlmStatus();

  return h(
    'div',
    {},
    h(
      'section',
      { class: 'hero' },
      h('p', { class: 'eyebrow' }, 'Home Credit · Loan Against Property'),
      h('h1', {}, 'A voice agent that qualifies loan leads like an advisor, not a form.'),
      h(
        'p',
        { class: 'lead' },
        'It verifies the customer, presents a pre-approved offer of up to ₹75 lakh, collects 7 eligibility answers in any order, disqualifies or routes to a transfer specialist the moment it should, and hands off only when every rule passes.',
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('a', { class: 'btn btn--primary', href: '#/simulator' }, icon('phone'), 'Start a live call'),
        h('a', { class: 'btn btn--ghost', href: '#/scenarios' }, icon('play'), 'Run scenarios'),
        h('a', { class: 'btn btn--ghost', href: '#/prompt' }, 'View system prompt'),
        h(
          'span',
          { class: 'status-chip', style: 'margin-left:4px' },
          h('span', { class: `dot ${llm.configured ? 'dot--pass' : 'dot--warn'}` }),
          llm.configured ? `Live AI ready · ${llm.model}` : 'Live AI needs GEMINI_API_KEY in .env',
        ),
      ),
    ),

    h(
      'div',
      { class: 'grid-3', style: 'margin-bottom:16px' },
      stepCard('01', 'System prompt drives the agent', 'Gemini runs the exact prompt you paste into Retell or Bolna, with every variable filled for the call. It speaks and decides; nothing is scripted.'),
      stepCard('02', 'A tracker reads the call', 'After each customer turn, a second temperature-0 model call extracts the 7 eligibility facts as schema-checked JSON.'),
      stepCard('03', 'Rules judge every turn', 'Deterministic code checks the agent against the brief: handoff gate, immediate disqualification, transfer routing, ₹75 lakh limit, no invented rates.'),
    ),

    h(
      'div',
      { class: 'grid-2', style: 'margin-bottom:16px;align-items:start' },
      card(
        'Eligibility checklist',
        h('ol', { class: 'list' }, CHECKLIST.map((item, i) => h('li', {}, h('span', { class: 'list__num' }, String(i + 1).padStart(2, '0')), item.label))),
      ),
      card(
        'Call outcomes',
        h(
          'ul',
          { class: 'list' },
          Object.entries(OUTCOME_INFO).map(([key, info]) =>
            h('li', { style: 'flex-direction:column;gap:4px' }, h('span', {}, tag(info.label, info.variant)), h('span', { class: 'muted small' }, OUTCOME_DESCRIPTIONS[key])),
          ),
        ),
      ),
    ),

    card(
      'Implementation status',
      table(
        ['Deliverable', 'Status', 'Where'],
        STATUS.map(([name, status, where]) =>
          h('tr', {}, h('td', {}, name), h('td', { class: 'nowrap' }, tag(status, status === 'Done' ? 'pass' : 'warn')), h('td', { class: 'mono small muted' }, where)),
        ),
      ),
      { flush: true },
    ),
  );
}

function stepCard(num, title, text) {
  return h('div', { class: 'glass step-card' }, h('div', { class: 'step-card__num' }, num), h('h3', {}, title), h('p', {}, text));
}
