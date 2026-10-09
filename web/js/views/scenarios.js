import { SCENARIOS } from '/src/scenarios/scenarios.js';
import { runScenario } from '/src/scenarios/runner.js';
import { card, h, icon, pageHead, tag } from '../dom.js';
import { outcomeLabel } from '../format.js';

export function renderScenarios() {
  const body = h('tbody');
  const summary = h('span', { class: 'small muted', 'aria-live': 'polite' });

  function run() {
    const results = SCENARIOS.map((scenario) => ({ scenario, result: runScenario(scenario) }));
    const passed = results.filter((r) => r.result.passed).length;
    summary.textContent = `${passed}/${results.length} passed · ${new Date().toLocaleTimeString()}`;
    body.replaceChildren(...results.flatMap(({ scenario, result }) => rowsFor(scenario, result)));
  }

  const view = h(
    'div',
    {},
    pageHead(
      'Scenarios',
      'Scripted calls',
      'Twenty-five customer scripts covering every rule and edge case. Here they replay through the rules engine in your browser (same as npm test). To run the same scripts against the live Gemini agent, use npm run eval:llm.',
    ),
    card(
      h('h2', {}, 'Results'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, ['ID', 'Scenario', 'Category', 'Expected', 'Result'].map((x) => h('th', { scope: 'col' }, x)))),
          body,
        ),
      ),
      {
        flush: true,
        actions: h('div', { class: 'btn-row' }, summary, h('button', { class: 'btn btn--ghost', type: 'button', onclick: run }, icon('play'), 'Run again')),
      },
    ),
  );
  run();
  return view;
}

function rowsFor(scenario, result) {
  const expectedOutcome = scenario.expect?.outcome;
  const expected =
    expectedOutcome === null ? { label: 'Call continues', variant: '' } : expectedOutcome ? outcomeLabel(expectedOutcome) : null;
  const detail = h('tr', { class: 'detail-row', hidden: true }, h('td', { colspan: 5 }, detailFor(scenario, result)));
  const toggle = () => {
    detail.hidden = !detail.hidden;
    row.setAttribute('aria-expanded', String(!detail.hidden));
  };
  const row = h(
    'tr',
    {
      class: 'is-clickable',
      tabindex: 0,
      'aria-expanded': 'false',
      onclick: toggle,
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      },
    },
    h('td', { class: 'mono nowrap faint' }, scenario.id),
    h('td', {}, scenario.title),
    h('td', { class: 'nowrap muted' }, scenario.category),
    h('td', {}, expected ? tag(expected.label, expected.variant) : '—'),
    h('td', {}, result.passed ? tag('Pass', 'pass') : tag('Fail', 'fail')),
  );
  return [row, detail];
}

function detailFor(scenario, result) {
  return h(
    'div',
    { style: 'padding:6px 0;display:grid;gap:10px' },
    scenario.note ? h('p', { class: 'small muted', style: 'margin:0' }, scenario.note) : null,
    result.failures.length ? h('ul', { class: 'small', style: 'color:var(--fail);margin:0' }, result.failures.map((f) => h('li', {}, f))) : null,
    h(
      'div',
      { style: 'display:grid;gap:8px' },
      result.transcript.map((turn) =>
        h('div', { class: `msg msg--${turn.role}`, style: 'max-width:88%' }, h('div', { class: 'msg__bubble', style: 'font-size:13px' }, turn.text)),
      ),
    ),
  );
}
