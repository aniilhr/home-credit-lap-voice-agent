import { renderOverview } from './views/overview.js';
import { renderSimulator } from './views/simulator.js';
import { renderScenarios } from './views/scenarios.js';
import { renderRules } from './views/rules.js';
import { renderFlow } from './views/flow.js';
import { renderPrompt } from './views/prompt.js';
import { getLlmStatus } from './api.js';
import { h, icon } from './dom.js';

const ROUTES = {
  overview: { title: 'Overview', render: renderOverview },
  simulator: { title: 'Live call', render: renderSimulator },
  scenarios: { title: 'Scenarios', render: renderScenarios },
  rules: { title: 'Eligibility rules', render: renderRules },
  flow: { title: 'Call flow', render: renderFlow },
  prompt: { title: 'System prompt', render: renderPrompt },
};

const main = document.getElementById('main');
let cleanup = null;

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '');
  return ROUTES[name] ? name : 'overview';
}

async function navigate() {
  const name = currentRoute();
  const route = ROUTES[name];
  document.title = `${route.title} · LAP Console`;
  for (const link of document.querySelectorAll('.nav a')) {
    if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  cleanup?.();
  cleanup = null;
  try {
    const view = await route.render();
    cleanup = view.cleanup ?? null;
    main.replaceChildren(view);
  } catch (error) {
    console.error(error);
    main.replaceChildren(h('div', { class: 'notice notice--fail', role: 'alert' }, `This section failed to load: ${error.message}`));
  }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// Theme ---------------------------------------------------------------------

const themeButton = document.getElementById('theme-toggle');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function effectiveTheme() {
  return document.documentElement.dataset.theme ?? (prefersDark.matches ? 'dark' : 'light');
}

function paintThemeButton() {
  const dark = effectiveTheme() === 'dark';
  themeButton.replaceChildren(icon(dark ? 'sun' : 'moon'));
  themeButton.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

themeButton.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('lap-theme', next);
  } catch {
    // Storage unavailable (private mode); the choice lasts for this page only.
  }
  paintThemeButton();
});
prefersDark.addEventListener('change', paintThemeButton);
paintThemeButton();

// LLM status chip -------------------------------------------------------------

getLlmStatus().then((llm) => {
  const chip = document.getElementById('llm-status');
  const [dot, label] = chip.children;
  if (llm.configured) {
    dot.className = 'dot dot--pass';
    label.textContent = `Gemini · ${llm.model}`;
    chip.title = 'Live AI mode is available';
  } else {
    dot.className = 'dot dot--warn';
    label.textContent = llm.unreachable ? 'API offline' : 'AI not configured';
    chip.title = llm.unreachable
      ? 'Open the console through npm start to enable the live API'
      : 'Add GEMINI_API_KEY to .env and restart npm start';
  }
});

window.addEventListener('hashchange', navigate);
navigate();
