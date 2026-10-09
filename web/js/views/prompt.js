import { renderPrompt as fillTemplate, runtimeDateValues } from '/src/prompt/render.js';
import { PROMPT_VARIABLES } from '/src/prompt/variables.js';
import { card, h, icon, pageHead } from '../dom.js';
import { callSetup } from '../store.js';

let templateCache = null;

const CHOICES = { agent_gender: ['female', 'male'], language_to_speak: ['English', 'Hindi'] };

async function loadTemplate() {
  if (templateCache) return templateCache;
  const response = await fetch('/prompts/system-prompt.md', { cache: 'no-store' });
  if (!response.ok) throw new Error(`could not load prompts/system-prompt.md (HTTP ${response.status})`);
  templateCache = await response.text();
  return templateCache;
}

export async function renderPrompt() {
  const template = await loadTemplate();
  const values = Object.fromEntries(
    PROMPT_VARIABLES.map((v) => [v.name, typeof callSetup[v.name] === 'string' ? callSetup[v.name] : '']),
  );

  const preview = h('pre', { class: 'prompt-preview', tabindex: 0, 'aria-label': 'System prompt preview' });
  const status = h('span', { class: 'small muted', 'aria-live': 'polite' });
  const fillToggle = h('input', { type: 'checkbox', id: 'fill-values', onchange: update });
  const inputs = {};

  function currentText() {
    if (!fillToggle.checked) return { text: template, unfilled: PROMPT_VARIABLES.map((v) => v.name) };
    const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''));
    return fillTemplate(template, filled);
  }

  function update() {
    const { text, unfilled } = currentText();
    preview.replaceChildren(
      ...text.split(/(\{\{[a-z_]+\}\})/g).map((part) =>
        /^\{\{[a-z_]+\}\}$/.test(part) ? h('span', { class: 'placeholder' }, part) : part,
      ),
    );
    status.textContent = fillToggle.checked
      ? `${unfilled.length} variable${unfilled.length === 1 ? '' : 's'} left for the platform to fill`
      : 'Raw template — paste as-is into a platform that supports {{variables}}';
  }

  async function copy(button) {
    try {
      await navigator.clipboard.writeText(currentText().text);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed — select the text manually';
    }
    setTimeout(() => {
      button.textContent = 'Copy prompt';
    }, 2000);
  }

  function download() {
    const blob = new Blob([currentText().text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: 'system-prompt.txt' });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const variableRows = PROMPT_VARIABLES.map((variable) => {
    const multiline = ['additional_context_from_rag', 'conversation_history'].includes(variable.name);
    const attrs = {
      id: `var-${variable.name}`,
      name: variable.name,
      oninput: (e) => {
        values[variable.name] = e.target.value;
        if (variable.name in callSetup) callSetup[variable.name] = e.target.value;
        update();
      },
    };
    const choices = CHOICES[variable.name];
    if (multiline) inputs[variable.name] = h('textarea', { ...attrs, rows: 2 }, values[variable.name]);
    else if (choices) {
      attrs.onchange = attrs.oninput;
      delete attrs.oninput;
      inputs[variable.name] = h('select', attrs, choices.map((c) => h('option', { value: c, selected: values[variable.name] === c }, c)));
    } else inputs[variable.name] = h('input', { ...attrs, type: 'text', value: values[variable.name], autocomplete: 'off' });
    return h(
      'div',
      { class: `field${multiline ? ' field--full' : ''}` },
      h('label', { for: `var-${variable.name}` }, h('span', { class: 'mono' }, variable.name)),
      inputs[variable.name],
      h('span', { class: 'hint' }, `${variable.description} Supplied by: ${variable.source}.`),
    );
  });

  const useClock = () => {
    for (const [name, value] of Object.entries(runtimeDateValues())) {
      values[name] = value;
      inputs[name].value = value;
    }
    fillToggle.checked = true;
    update();
  };

  const copyLabel = h('span', {}, 'Copy prompt');
  const copyButton = h('button', { class: 'btn btn--primary', type: 'button', onclick: () => copy(copyLabel) }, icon('copy'), copyLabel);

  const view = h(
    'div',
    {},
    pageHead(
      'Prompt',
      'System prompt',
      'The production prompt from prompts/system-prompt.md — the same text the live Gemini agent runs. Paste the raw template into a platform that supports {{variables}}, or fill the variables here.',
    ),
    h('div', { class: 'stack' },
    card(
      'Variables',
      h(
        'details',
        {},
        h('summary', { class: 'small' }, `Edit the ${PROMPT_VARIABLES.length} dynamic variables`),
        h('div', { class: 'form-grid', style: 'margin-top:16px' }, variableRows),
        h(
          'div',
          { class: 'btn-row', style: 'margin-top:16px' },
          h('label', { for: 'fill-values', class: 'check' }, fillToggle, 'Fill variables in the preview'),
          h('button', { class: 'btn btn--ghost', type: 'button', onclick: useClock }, 'Use current date and time'),
        ),
      ),
    ),
    card('Prompt', preview, {
      actions: h(
        'div',
        { class: 'btn-row' },
        status,
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: download }, icon('download'), 'Download'),
        copyButton,
      ),
      flush: true,
    }),
    ),
  );
  update();
  return view;
}
