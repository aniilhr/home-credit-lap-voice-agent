import { SCENARIOS } from '/src/scenarios/scenarios.js';
import { runScenario } from '/src/scenarios/runner.js';
import { h, pageHeader, panel, tag } from '../dom.js';
import { outcomeLabel } from '../format.js';

export function renderScenarios() {
  const body = h('tbody');
  const summary = h('span', { class: 'small muted', 'aria-live': 'polite' });
  const runButton = h('button', { class: 'btn btn--secondary', type: 'button', onclick: run }, 'Run again');

  function run() {
    const results = SCENARIOS.map((scenario) => ({ scenario, result: runScenario(scenario) }));
    const passed = results.filter((r) => r.result.passed).length;
    summary.textContent = `${passed} of ${results.length} passed · run at ${new Date().toLocaleTimeString()}`;
    body.replaceChildren(...results.flatMap(({ scenario, result }) => rowsFor(scenario, result)));
  }

  const view = h(
    'div',
    {},
    pageHeader(
      'Test scenarios',
      'Scripted customer conversations run through the reference engine in your browser. The same scenarios run in the automated test suite (npm test). Select a row to read the transcript.',
    ),
    panel(
      'Scenario results',
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          {},
          h(
            'thead',
            {},
            h('tr', {}, ['ID', 'Scenario', 'Category', 'Expected outcome', 'Result'].map((x) => h('th', { scope: 'col' }, x))),
          ),
          body,
        ),
      ),
      { actions: h('div', { class: 'btn-row' }, summary, runButton), bodyClass: '' },
    ),
  );
  run();
  return view;
}

function rowsFor(scenario, result) {
  const expectedOutcome = scenario.expect?.outcome;
  const expected =
    expectedOutcome === null ? { label: 'Call continues', variant: '' } : expectedOutcome ? outcomeLabel(expectedOutcome) : null;
  const detail = h(
    'tr',
    { class: 'detail-row', hidden: true },
    h('td', { colspan: 5 }, detailFor(scenario, result)),
  );
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
    h('td', { class: 'mono nowrap' }, scenario.id),
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
    { style: 'padding:8px 0' },
    scenario.note ? h('p', { class: 'small muted' }, scenario.note) : null,
    result.failures.length
      ? h('ul', { class: 'small', style: 'color:var(--fail);margin:0 0 12px' }, result.failures.map((f) => h('li', {}, f)))
      : null,
    h(
      'div',
      { class: 'small', style: 'display:grid;gap:6px' },
      result.transcript.map((turn) =>
        h(
          'div',
          {},
          h('strong', {}, turn.role === 'agent' ? 'Agent: ' : 'Customer: '),
          turn.text,
        ),
      ),
    ),
  );
}
