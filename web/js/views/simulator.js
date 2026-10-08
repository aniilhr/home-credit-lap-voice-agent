import {
  CHECKLIST,
  RESULT,
  completedItemCount,
  createSession,
  evaluateField,
  processTurn,
  startCall,
  validateConfig,
} from '/src/engine/index.js';
import { h, pageHeader, panel, table, tag } from '../dom.js';
import { describeEvent, formatValue, outcomeLabel } from '../format.js';
import { callSetup, simulation } from '../store.js';

const FIELD_LABELS = {
  customer_name: 'Customer name',
  agent_name: 'Agent name',
  company_name: 'Company name',
};

export function renderSimulator() {
  const refs = {};

  const root = h(
    'div',
    {},
    pageHeader(
      'Call simulator',
      'Type what a customer would say and watch the qualification state update turn by turn. This runs the reference engine in the browser — the same code the automated tests use.',
    ),
    h(
      'div',
      { class: 'notice' },
      'This is a logic reference, not the live voice agent. Replies use English reference phrasing; on a voice platform the agent speaks in the configured language using the system prompt.',
    ),
    h(
      'div',
      { class: 'sim-grid' },
      h('div', {}, setupPanel(refs), conversationPanel(refs)),
      h('div', {}, (refs.statePanel = h('div')), (refs.eventsPanel = h('div'))),
    ),
  );

  refresh(refs);
  return root;
}

// ---------------------------------------------------------------------------

function setupPanel(refs) {
  const input = (name, attrs = {}) =>
    h('input', {
      type: 'text',
      id: `setup-${name}`,
      name,
      value: callSetup[name],
      autocomplete: 'off',
      oninput: (e) => {
        callSetup[name] = e.target.value;
      },
      ...attrs,
    });
  const select = (name, options) =>
    h(
      'select',
      {
        id: `setup-${name}`,
        name,
        onchange: (e) => {
          callSetup[name] = e.target.value;
        },
      },
      options.map(([value, label]) => h('option', { value, selected: callSetup[name] === value }, label)),
    );

  refs.errors = h('div', { class: 'error-text', role: 'alert' });
  refs.startButton = h('button', { class: 'btn', type: 'submit' }, 'Start call');
  refs.resetButton = h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => resetCall(refs) }, 'Reset');

  refs.setupForm = h(
    'form',
    {
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        beginCall(refs);
      },
    },
    h(
      'div',
      { class: 'form-grid' },
      h('div', { class: 'field' }, h('label', { for: 'setup-customer_name' }, 'Customer name'), input('customer_name', { required: true })),
      h('div', { class: 'field' }, h('label', { for: 'setup-agent_name' }, 'Agent name'), input('agent_name', { required: true })),
      h('div', { class: 'field' }, h('label', { for: 'setup-company_name' }, 'Company name'), input('company_name', { required: true })),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'setup-agent_gender' }, 'Agent gender'),
        select('agent_gender', [
          ['female', 'Female'],
          ['male', 'Male'],
        ]),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'setup-language_to_speak' }, 'Language to speak'),
        select('language_to_speak', [
          ['English', 'English'],
          ['Hindi', 'Hindi'],
        ]),
        h('span', { class: 'hint' }, 'The simulator understands English input and replies in English.'),
      ),
      h(
        'div',
        { class: 'field field--full' },
        h('label', { for: 'setup-additional_context_from_rag' }, 'Product context (additional_context_from_rag)'),
        h(
          'textarea',
          {
            id: 'setup-additional_context_from_rag',
            name: 'additional_context_from_rag',
            rows: 3,
            placeholder: 'Optional. Paste approved product information; the agent answers questions only from this text.',
            oninput: (e) => {
              callSetup.additional_context_from_rag = e.target.value;
            },
          },
          callSetup.additional_context_from_rag,
        ),
      ),
    ),
    h('div', { class: 'btn-row', style: 'margin-top:16px' }, refs.startButton, refs.resetButton, refs.errors),
  );

  return panel('Call setup', refs.setupForm);
}

function conversationPanel(refs) {
  refs.transcript = h('div', { class: 'transcript', 'aria-live': 'polite', 'aria-label': 'Call transcript' });
  refs.utterance = h('input', {
    type: 'text',
    id: 'customer-utterance',
    placeholder: 'What the customer says…',
    'aria-label': 'Customer utterance',
    autocomplete: 'off',
    maxlength: 500,
  });
  refs.sendButton = h('button', { class: 'btn', type: 'submit' }, 'Send');
  refs.outcome = h('span');

  const composer = h(
    'form',
    {
      class: 'composer',
      onsubmit: (e) => {
        e.preventDefault();
        sendUtterance(refs);
      },
    },
    refs.utterance,
    refs.sendButton,
  );

  return h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel__header' }, h('h2', {}, 'Conversation'), refs.outcome),
    refs.transcript,
    composer,
  );
}

// ---------------------------------------------------------------------------

function beginCall(refs) {
  const config = { ...callSetup };
  const errors = validateConfig(config);
  for (const name of ['customer_name', 'agent_name', 'company_name']) {
    const field = refs.setupForm.querySelector(`[name="${name}"]`);
    field.setAttribute('aria-invalid', String(errors.some((e) => e.startsWith(name))));
  }
  if (errors.length) {
    refs.errors.textContent = errors.map((e) => e.replace(/^(\w+)/, (k) => FIELD_LABELS[k] ?? k)).join(' · ');
    return;
  }
  refs.errors.textContent = '';
  const started = startCall(createSession(config));
  simulation.session = started.session;
  simulation.lastEvents = started.events;
  refresh(refs);
  refs.utterance.focus();
}

function resetCall(refs) {
  simulation.session = null;
  simulation.lastEvents = [];
  refs.errors.textContent = '';
  refresh(refs);
}

function sendUtterance(refs) {
  const text = refs.utterance.value.trim();
  if (!text || !simulation.session) return;
  const result = processTurn(simulation.session, text);
  simulation.session = result.session;
  simulation.lastEvents = result.events;
  refs.utterance.value = '';
  refresh(refs);
  if (simulation.session.state.phase !== 'ended') refs.utterance.focus();
}

// ---------------------------------------------------------------------------

function refresh(refs) {
  const { session } = simulation;
  const active = Boolean(session) && session.state.phase !== 'ended';

  for (const el of refs.setupForm.querySelectorAll('input, select, textarea')) el.disabled = Boolean(session);
  refs.startButton.disabled = Boolean(session);
  refs.resetButton.disabled = !session;
  refs.utterance.disabled = !active;
  refs.sendButton.disabled = !active;

  renderTranscript(refs, session);
  const outcome = session ? outcomeLabel(session.state.outcome) : null;
  refs.outcome.replaceChildren(outcome ? tag(outcome.label, outcome.variant) : '');

  refs.statePanel.replaceChildren(statePanel(session));
  refs.eventsPanel.replaceChildren(
    panel(
      'Last turn',
      simulation.lastEvents.length
        ? h('ol', { class: 'events' }, simulation.lastEvents.map((e) => h('li', {}, describeEvent(e))))
        : h('p', { class: 'muted small' }, 'State events from the latest turn appear here.'),
    ),
  );
}

function renderTranscript(refs, session) {
  if (!session) {
    refs.transcript.replaceChildren(h('p', { class: 'empty' }, 'Fill in the call setup and start a call.'));
    return;
  }
  const turns = session.transcript.map((turn) =>
    h(
      'div',
      { class: `turn turn--${turn.role}` },
      h('div', { class: 'turn__who' }, turn.role === 'agent' ? session.config.agent_name : session.config.customer_name),
      h('div', { class: 'turn__text' }, turn.text),
    ),
  );
  if (session.state.phase === 'ended') {
    turns.push(h('div', { class: 'turn turn--system' }, h('div', { class: 'turn__text' }, 'Call ended.')));
  }
  refs.transcript.replaceChildren(...turns);
  refs.transcript.scrollTop = refs.transcript.scrollHeight;
}

function itemStatus(state, item) {
  const results = item.fields.map((field) => evaluateField(field, state[field]));
  if (results.includes(RESULT.FAIL)) return tag('Failed', 'fail');
  if (state.pending_confirmation?.field && item.fields.includes(state.pending_confirmation.field)) {
    return tag('Confirming', 'warn');
  }
  if (item.id === 'market_value' && results[0] === RESULT.PASS) return tag('Captured', 'pass');
  if (results.every((r) => r === RESULT.PASS)) return tag('Passed', 'pass');
  if (results.some((r) => r === RESULT.PASS)) return tag('Partial', 'warn');
  return tag('Unanswered');
}

function statePanel(session) {
  if (!session) {
    return panel('Qualification state', h('p', { class: 'muted small' }, 'No active call.'));
  }
  const { state } = session;
  const rows = CHECKLIST.map((item, i) =>
    h(
      'tr',
      {},
      h('td', { class: 'nowrap' }, `${i + 1}. ${item.label}`),
      h('td', { class: 'mono small' }, item.fields.map((f) => formatValue(f, state[f])).join(' / ')),
      h('td', { class: 'nowrap' }, itemStatus(state, item)),
    ),
  );

  const flags = [
    ['Phase', state.phase],
    ['Next question', state.awaiting ?? '—'],
    ['Customer verified', formatValue('customer_verified', state.customer_verified)],
    ['Existing property loan', formatValue('existing_property_loan', state.existing_property_loan)],
    ['EMI reduction request', formatValue('emi_reduction_request', state.emi_reduction_request)],
    ['Requested amount', formatValue('requested_loan_amount', state.requested_loan_amount)],
    ['Callback time', formatValue('callback_time', state.callback_time)],
    ['Disqualified', state.disqualified ? `Yes — ${state.disqualification_reason}` : 'No'],
    ['Transfer required', state.transfer_required ? 'Yes' : 'No'],
  ];

  return h(
    'div',
    {},
    panel('Checklist', table(['Item', 'Captured', 'Status'], rows), {
      actions: h('span', { class: 'small muted' }, `${completedItemCount(state)} of 7 answered`),
      bodyClass: '',
    }),
    panel(
      'Routing state',
      h('dl', { class: 'state-list' }, flags.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    ),
  );
}
