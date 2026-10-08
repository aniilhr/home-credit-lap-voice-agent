import { renderOverview } from './views/overview.js';
import { renderSimulator } from './views/simulator.js';
import { renderScenarios } from './views/scenarios.js';
import { renderRules } from './views/rules.js';
import { renderFlow } from './views/flow.js';
import { renderPrompt } from './views/prompt.js';
import { h } from './dom.js';

const ROUTES = {
  overview: { title: 'Overview', render: renderOverview },
  simulator: { title: 'Call simulator', render: renderSimulator },
  scenarios: { title: 'Test scenarios', render: renderScenarios },
  rules: { title: 'Eligibility rules', render: renderRules },
  flow: { title: 'Call flow', render: renderFlow },
  prompt: { title: 'System prompt', render: renderPrompt },
};

const main = document.getElementById('main');

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '');
  return ROUTES[name] ? name : 'overview';
}

async function navigate() {
  const name = currentRoute();
  const route = ROUTES[name];
  document.title = `${route.title} · LAP Qualification Console`;
  for (const link of document.querySelectorAll('.sidenav a')) {
    if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  main.replaceChildren();
  try {
    const view = await route.render();
    main.replaceChildren(view);
  } catch (error) {
    console.error(error);
    main.replaceChildren(
      h('div', { class: 'notice notice--warn', role: 'alert' }, `This section failed to load: ${error.message}`),
    );
  }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', navigate);
navigate();
