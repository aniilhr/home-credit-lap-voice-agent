import {
  CHECKLIST,
  MAX_LOAN_AMOUNT,
  RESULT,
  UNKNOWN,
  completedItemCount,
  createInitialState,
  createSession,
  evaluateField,
  processTurn,
  startCall,
  validateConfig,
} from '/src/engine/index.js';
import { ApiError, getLlmStatus, liveTurn } from '../api.js';
import { card, h, icon, pageHead, tag } from '../dom.js';
import { describeEvent, formatValue, outcomeLabel } from '../format.js';
import { callSetup, simulation } from '../store.js';
import { listenOnce, speak, speechLang, stopSpeaking, voiceSupport } from '../voice.js';

const FIELD_LABELS = { customer_name: 'Customer name', agent_name: 'Agent name', company_name: 'Company name' };
const GUARD_ICON = { pass: '✓', fail: '✕', warn: '!', 'n/a': '–' };

export async function renderSimulator() {
  const llm = await getLlmStatus();
  simulation.mode ??= llm.configured ? 'ai' : 'rules';
  if (!llm.configured && simulation.mode === 'ai' && !simulation.call) simulation.mode = 'rules';

  const ui = {};
  let timer = null;
  let listener = null;
  let controller = null;

  // ---------------------------------------------------------------------------
  // Actions

  function beginCall() {
    const config = { ...callSetup };
    const errors = validateConfig(config);
    for (const name of Object.keys(FIELD_LABELS)) {
      ui.form.querySelector(`[name="${name}"]`)?.setAttribute('aria-invalid', String(errors.some((e) => e.startsWith(name))));
    }
    if (errors.length) {
      ui.formError.textContent = errors.map((e) => e.replace(/^(\w+)/, (k) => FIELD_LABELS[k] ?? k)).join(' · ');
      return;
    }
    ui.formError.textContent = '';

    const call = {
      mode: simulation.mode,
      config,
      transcript: [],
      state: createInitialState(),
      audit: [],
      events: [],
      ended: false,
      outcome: null,
      endNote: '',
      pending: false,
      error: null,
      startedAt: Date.now(),
      session: null,
    };
    simulation.call = call;

    if (call.mode === 'rules') {
      const started = startCall(createSession(config));
      call.session = started.session;
      call.transcript = [...started.session.transcript];
      call.state = started.session.state;
      call.events = started.events;
      afterAgentReply(started.reply);
      render();
    } else {
      render();
      runAiTurn();
    }
    startTimer();
  }

  async function runAiTurn() {
    const call = simulation.call;
    if (!call || call.ended) return;
    call.pending = true;
    call.error = null;
    render();
    controller = new AbortController();
    try {
      const result = await liveTurn({ config: call.config, transcript: call.transcript }, { signal: controller.signal });
      if (simulation.call !== call) return;
      if (result.reply) call.transcript.push({ role: 'agent', text: result.reply });
      if (result.stateAvailable || !call.transcript.some((t) => t.role === 'customer')) call.state = result.state;
      call.audit = result.audit;
      call.latencyMs = result.latencyMs;
      if (result.endCall) endCall(result.endCall.outcome, result.endCall.note);
      afterAgentReply(result.reply);
    } catch (error) {
      if (error.name === 'AbortError') return;
      call.error = error instanceof ApiError ? error : new ApiError(error.message);
    } finally {
      if (simulation.call === call) {
        call.pending = false;
        render();
        if (!call.ended && !call.error) ui.input?.focus({ preventScroll: true });
      }
    }
  }

  function sendUtterance(raw) {
    const call = simulation.call;
    const text = raw.trim();
    if (!call || call.ended || call.pending || !text) return;
    stopSpeaking();
    ui.input.value = '';

    if (call.mode === 'rules') {
      const result = processTurn(call.session, text);
      call.session = result.session;
      call.transcript = [...result.session.transcript];
      call.state = result.session.state;
      call.events = result.events;
      if (result.session.state.phase === 'ended') endCall(result.session.state.outcome);
      afterAgentReply(result.reply);
      render();
      ui.input.focus({ preventScroll: true });
      return;
    }
    call.transcript.push({ role: 'customer', text });
    runAiTurn();
  }

  function afterAgentReply(reply) {
    if (reply && simulation.voiceReplies) {
      const { language_to_speak: language, agent_gender: gender } = simulation.call.config;
      speak(reply, { lang: speechLang(language), gender });
    }
  }

  function endCall(outcome, note = '') {
    const call = simulation.call;
    call.ended = true;
    call.outcome = outcome;
    call.endNote = note;
    call.endedAt = Date.now();
    stopListening();
    stopTimer();
  }

  function hangUp() {
    if (!simulation.call || simulation.call.ended) return;
    controller?.abort();
    simulation.call.pending = false;
    endCall('ENDED_BY_TESTER');
    stopSpeaking();
    render();
  }

  function reset() {
    controller?.abort();
    stopSpeaking();
    stopListening();
    stopTimer();
    simulation.call = null;
    render();
  }

  function setMode(mode) {
    if (simulation.call && !simulation.call.ended) return;
    simulation.mode = mode;
    simulation.call = null;
    render();
  }

  function toggleMic() {
    if (listener) {
      stopListening();
      return;
    }
    stopSpeaking(); // barge-in: the customer interrupts the agent
    const lang = speechLang(simulation.call.config.language_to_speak);
    try {
      listener = listenOnce({
        lang,
        onInterim: (text) => {
          ui.input.value = text;
        },
        onFinal: (text) => {
          stopListening();
          sendUtterance(text);
        },
        onEnd: () => stopListening(),
        onError: (message) => {
          stopListening();
          ui.voiceError.textContent = message;
        },
      });
      ui.voiceError.textContent = '';
      ui.mic.setAttribute('aria-pressed', 'true');
    } catch (error) {
      ui.voiceError.textContent = error.message;
    }
  }

  function stopListening() {
    listener?.stop();
    listener = null;
    ui.mic?.setAttribute('aria-pressed', 'false');
  }

  function toggleVoiceReplies() {
    simulation.voiceReplies = !simulation.voiceReplies;
    if (!simulation.voiceReplies) stopSpeaking();
    render();
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(renderStatus, 1000);
  }
  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }

  // ---------------------------------------------------------------------------
  // Static skeleton

  ui.modeAi = h(
    'button',
    { type: 'button', onclick: () => setMode('ai'), disabled: !llm.configured, title: llm.configured ? `Gemini · ${llm.model}` : 'Add GEMINI_API_KEY to .env to enable' },
    h('span', { class: `dot ${llm.configured ? 'dot--pass' : ''}` }),
    'Live AI · Gemini',
  );
  ui.modeRules = h('button', { type: 'button', onclick: () => setMode('rules') }, 'Rules engine');
  ui.status = h('span', { class: 'toolbar__status', 'aria-live': 'polite' });
  ui.hangup = h('button', { class: 'btn btn--danger', type: 'button', onclick: hangUp }, icon('stop'), 'End call');
  ui.reset = h('button', { class: 'btn btn--ghost', type: 'button', onclick: reset }, icon('reset'), 'New call');

  ui.speakerBtn = h('button', { class: 'icon-btn', type: 'button', onclick: toggleVoiceReplies, disabled: !voiceSupport.synthesis });
  ui.chatTitle = h('div', { class: 'chat__who' });
  ui.chatBody = h('div', { class: 'chat__body', 'aria-live': 'polite', 'aria-label': 'Call transcript' });
  ui.input = h('input', { type: 'text', placeholder: 'Say something as the customer…', 'aria-label': 'Customer reply', autocomplete: 'off', maxlength: 1000 });
  ui.mic = h(
    'button',
    {
      class: 'round-btn round-btn--mic',
      type: 'button',
      onclick: toggleMic,
      'aria-pressed': 'false',
      disabled: !voiceSupport.recognition,
      'aria-label': voiceSupport.recognition ? 'Speak as the customer' : 'Speech input is not supported in this browser',
      title: voiceSupport.recognition ? 'Speak (Chrome / Edge)' : 'Speech input not supported in this browser',
    },
    icon('mic'),
  );
  ui.send = h('button', { class: 'round-btn round-btn--send', type: 'submit', 'aria-label': 'Send' }, icon('send'));
  ui.voiceError = h('span', { class: 'error-text', role: 'status', style: 'padding:0 18px 10px' });
  ui.composer = h(
    'form',
    {
      class: 'composer',
      onsubmit: (e) => {
        e.preventDefault();
        sendUtterance(ui.input.value);
      },
    },
    ui.mic,
    ui.input,
    ui.send,
  );

  ui.form = setupForm(() => beginCall());
  ui.formError = ui.form.querySelector('.error-text');

  ui.side = h('div', { class: 'stack' });

  const view = h(
    'div',
    {},
    pageHead(
      'Live call',
      'Talk to the agent',
      'Play the customer — type or use the mic. In Live AI mode every reply comes from Gemini running the production system prompt; a second model call tracks the facts and the rule guard checks each turn against the eligibility rules.',
    ),
    h(
      'div',
      { class: 'toolbar glass' },
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Simulator mode' }, ui.modeAi, ui.modeRules),
      h('div', { class: 'btn-row' }, ui.status, ui.hangup, ui.reset),
    ),
    h(
      'div',
      { class: 'sim-grid' },
      h(
        'section',
        { class: 'glass chat' },
        h('div', { class: 'chat__head' }, ui.chatTitle, ui.speakerBtn),
        ui.chatBody,
        ui.voiceError,
        ui.composer,
      ),
      ui.side,
    ),
  );

  // ---------------------------------------------------------------------------
  // Rendering

  function render() {
    const call = simulation.call;
    const active = Boolean(call) && !call.ended;
    const callLocked = Boolean(call) && !call.ended;

    ui.modeAi.setAttribute('aria-pressed', String(simulation.mode === 'ai'));
    ui.modeRules.setAttribute('aria-pressed', String(simulation.mode === 'rules'));
    ui.modeAi.disabled = !llm.configured || callLocked;
    ui.modeRules.disabled = callLocked;
    ui.hangup.hidden = !active;
    ui.reset.hidden = !call;

    ui.speakerBtn.replaceChildren(icon(simulation.voiceReplies ? 'speaker' : 'mute'));
    ui.speakerBtn.setAttribute('aria-pressed', String(simulation.voiceReplies));
    ui.speakerBtn.setAttribute('aria-label', simulation.voiceReplies ? 'Mute spoken replies' : 'Speak agent replies aloud');
    ui.speakerBtn.title = voiceSupport.synthesis ? (simulation.voiceReplies ? 'Spoken replies on' : 'Spoken replies off') : 'Speech output not supported';

    const config = call?.config ?? callSetup;
    ui.chatTitle.replaceChildren(
      h('span', { class: 'avatar' }, (config.agent_name || 'A').charAt(0).toUpperCase()),
      h(
        'div',
        { style: 'min-width:0' },
        h('div', { style: 'font-weight:600' }, call ? `${config.agent_name} · ${config.company_name}` : 'New call'),
        h(
          'div',
          { class: 'small faint' },
          call
            ? `Calling ${config.customer_name} · ${config.language_to_speak} · ${config.agent_gender} agent · ${call.mode === 'ai' ? 'Gemini' : 'rules engine'}`
            : simulation.mode === 'ai'
              ? `Live AI · Gemini (${llm.model})`
              : 'Rules engine · offline, English reference phrasing',
        ),
      ),
    );

    ui.composer.hidden = !call;
    ui.input.disabled = !active || call.pending;
    ui.send.disabled = !active || call.pending;
    ui.mic.disabled = !active || call.pending || !voiceSupport.recognition;

    renderChat();
    renderStatus();
    renderSide();
  }

  function renderChat() {
    const call = simulation.call;
    if (!call) {
      const notice =
        simulation.mode === 'rules'
          ? h(
              'div',
              { class: 'notice', style: 'margin-bottom:18px' },
              h('div', {}, h('strong', {}, 'Rules engine mode. '), 'Deterministic pattern matching with fixed reply templates — useful for checking the business logic offline. It is not AI. ', llm.configured ? 'Switch to Live AI for the real agent.' : 'Add GEMINI_API_KEY to .env and restart npm start to talk to the real AI agent.'),
            )
          : null;
      ui.chatBody.replaceChildren(h('div', { class: 'setup' }, notice, ui.form));
      return;
    }

    const nodes = call.transcript.map((turn) => {
      const isAgent = turn.role === 'agent';
      return h(
        'div',
        { class: `msg msg--${turn.role}` },
        h('span', { class: 'msg__meta' }, isAgent ? call.config.agent_name : call.config.customer_name),
        h('div', { class: 'msg__bubble' }, turn.text),
      );
    });
    if (call.pending) {
      nodes.push(h('div', { class: 'msg msg--agent', 'aria-label': 'Agent is responding' }, h('div', { class: 'msg__bubble typing' }, h('span'), h('span'), h('span'))));
    }
    if (call.error) {
      nodes.push(
        h(
          'div',
          { class: 'notice notice--fail', role: 'alert' },
          h('div', { style: 'flex:1' }, call.error.message),
          h('button', { class: 'btn btn--ghost', type: 'button', onclick: runAiTurn }, 'Retry'),
        ),
      );
    }
    if (call.ended) {
      const label = call.outcome === 'ENDED_BY_TESTER' ? 'You ended the call' : `Call ended — ${outcomeLabel(call.outcome).label}`;
      nodes.push(h('div', { class: 'msg msg--system' }, h('div', { class: 'msg__bubble' }, call.endNote ? `${label} · ${call.endNote}` : label)));
    }
    ui.chatBody.replaceChildren(...nodes);
    ui.chatBody.scrollTop = ui.chatBody.scrollHeight;
  }

  function renderStatus() {
    const call = simulation.call;
    if (!call) {
      ui.status.replaceChildren(h('span', { class: 'dot' }), 'Idle');
      return;
    }
    const seconds = Math.floor(((call.endedAt ?? Date.now()) - call.startedAt) / 1000);
    const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (call.ended) {
      const info = call.outcome === 'ENDED_BY_TESTER' ? { label: 'Ended by you', variant: '' } : outcomeLabel(call.outcome);
      ui.status.replaceChildren(tag(info.label, info.variant), h('span', { class: 'mono' }, clock));
    } else {
      ui.status.replaceChildren(h('span', { class: 'dot dot--fail dot--live' }), call.pending ? 'Agent speaking…' : 'In call', h('span', { class: 'mono' }, clock));
    }
  }

  function renderSide() {
    const call = simulation.call;
    const state = call?.state ?? createInitialState();
    const statuses = CHECKLIST.map((item) => itemStatus(state, item));

    const qualification = card(
      h('div', { style: 'flex:1' }, h('div', { style: 'display:flex;justify-content:space-between;margin-bottom:10px' }, h('h2', {}, 'Qualification'), h('span', { class: 'small muted mono' }, `${completedItemCount(state)}/7`)), h('div', { class: 'progress', 'aria-hidden': 'true' }, statuses.map((s) => h('span', { class: s.bar ? `is-${s.bar}` : '' })))),
      h(
        'ul',
        { class: 'items' },
        CHECKLIST.map((item, i) =>
          h(
            'li',
            {},
            h('span', { class: 'items__num' }, i + 1),
            h('div', { style: 'min-width:0' }, h('div', {}, item.label), h('span', { class: 'items__value' }, item.fields.map((f) => formatValue(f, state[f])).join(' · '))),
            tag(statuses[i].label, statuses[i].variant),
          ),
        ),
      ),
      { flush: true },
    );

    const panels = [qualification];

    if (call?.mode === 'ai' || (!call && simulation.mode === 'ai')) {
      const audit = call?.audit ?? [];
      panels.push(
        card(
          'Rule guard',
          audit.length
            ? h(
                'ul',
                { class: 'guard' },
                audit.map((c) =>
                  h(
                    'li',
                    {},
                    h('span', { class: `guard__icon guard__icon--${c.status === 'n/a' ? 'na' : c.status}`, 'aria-label': c.status }, GUARD_ICON[c.status]),
                    h('div', {}, h('div', { style: 'font-weight:550' }, c.label), c.detail ? h('span', { class: 'guard__detail' }, c.detail) : null),
                  ),
                ),
              )
            : h('p', { class: 'small muted', style: 'padding:14px 18px;margin:0' }, 'After each turn, the agent’s reply is checked against the handoff gate, disqualification, transfer routing, the ₹75 lakh limit and invented rates.'),
          { flush: true, actions: call?.latencyMs ? h('span', { class: 'small faint mono' }, `${(call.latencyMs / 1000).toFixed(1)}s`) : null },
        ),
      );
    } else {
      panels.push(
        card(
          'Last turn',
          call?.events?.length
            ? h('ol', { class: 'events', style: 'padding-top:12px;padding-bottom:12px' }, call.events.map((e) => h('li', {}, describeEvent(e))))
            : h('p', { class: 'small muted', style: 'padding:14px 18px;margin:0' }, 'State events from the latest turn appear here.'),
          { flush: true },
        ),
      );
    }

    panels.push(
      card(
        'Routing',
        h(
          'dl',
          { class: 'kv' },
          [
            ['Customer verified', formatValue('customer_verified', state.customer_verified)],
            ['Existing property loan', formatValue('existing_property_loan', state.existing_property_loan)],
            ['EMI reduction request', formatValue('emi_reduction_request', state.emi_reduction_request)],
            ['Requested amount', formatValue('requested_loan_amount', state.requested_loan_amount)],
            ['Callback time', formatValue('callback_time', state.callback_time)],
          ].map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
        ),
      ),
    );
    ui.side.replaceChildren(...panels);
  }

  render();
  view.cleanup = () => {
    stopTimer();
    stopListening();
    stopSpeaking();
  };
  if (simulation.call && !simulation.call.ended) startTimer();
  return view;
}

// -----------------------------------------------------------------------------

function itemStatus(state, item) {
  const results = item.fields.map((field) => evaluateField(field, state[field]));
  if (results.includes(RESULT.FAIL)) return { label: 'Failed', variant: 'fail', bar: 'fail' };
  const overCap = item.id === 'loan_amount' && state.requested_loan_amount !== UNKNOWN && state.requested_loan_amount > MAX_LOAN_AMOUNT && state.loan_amount === UNKNOWN;
  if (overCap || (state.pending_confirmation?.field && item.fields.includes(state.pending_confirmation.field))) {
    return { label: 'Confirming', variant: 'warn', bar: 'warn' };
  }
  if (results.every((r) => r === RESULT.PASS)) return { label: item.id === 'market_value' ? 'Captured' : 'Passed', variant: 'pass', bar: 'pass' };
  if (results.some((r) => r === RESULT.PASS)) return { label: 'Partial', variant: 'warn', bar: 'warn' };
  return { label: 'Open', variant: '', bar: '' };
}

function setupForm(onStart) {
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
      { id: `setup-${name}`, name, onchange: (e) => { callSetup[name] = e.target.value; } },
      options.map(([value, label]) => h('option', { value, selected: callSetup[name] === value }, label)),
    );

  return h(
    'form',
    { novalidate: true, onsubmit: (e) => { e.preventDefault(); onStart(); } },
    h('h2', {}, 'Set up the call'),
    h('p', { class: 'lead' }, 'These fill the system prompt’s dynamic variables for this call.'),
    h(
      'div',
      { class: 'form-grid' },
      h('div', { class: 'field' }, h('label', { for: 'setup-customer_name' }, 'Customer name'), input('customer_name', { placeholder: 'e.g. Rahul' })),
      h('div', { class: 'field' }, h('label', { for: 'setup-agent_name' }, 'Agent name'), input('agent_name', { placeholder: 'e.g. Priya' })),
      h('div', { class: 'field' }, h('label', { for: 'setup-agent_gender' }, 'Agent gender'), select('agent_gender', [['female', 'Female'], ['male', 'Male']])),
      h('div', { class: 'field' }, h('label', { for: 'setup-language_to_speak' }, 'Language'), select('language_to_speak', [['English', 'English'], ['Hindi', 'Hindi']])),
      h('div', { class: 'field field--full' }, h('label', { for: 'setup-company_name' }, 'Company'), input('company_name')),
      h(
        'div',
        { class: 'field field--full' },
        h('label', { for: 'setup-additional_context_from_rag' }, 'Product knowledge (optional)'),
        h(
          'textarea',
          {
            id: 'setup-additional_context_from_rag',
            name: 'additional_context_from_rag',
            rows: 3,
            placeholder: 'Approved product facts. The agent answers product questions only from this text.',
            oninput: (e) => { callSetup.additional_context_from_rag = e.target.value; },
          },
          callSetup.additional_context_from_rag,
        ),
      ),
    ),
    h('div', { class: 'btn-row', style: 'margin-top:18px' }, h('button', { class: 'btn btn--primary', type: 'submit' }, icon('phone'), 'Start call'), h('span', { class: 'error-text', role: 'alert' })),
  );
}
