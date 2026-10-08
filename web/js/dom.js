/**
 * Small element builder. Children may be strings, nodes, arrays, or null.
 * Text is always inserted as text nodes, never as HTML.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function panel(title, body, { actions = null, bodyClass = 'panel__body' } = {}) {
  return h(
    'section',
    { class: 'panel' },
    title ? h('div', { class: 'panel__header' }, h('h2', {}, title), actions) : null,
    h('div', { class: bodyClass }, body),
  );
}

export function pageHeader(title, lead) {
  return h('div', { class: 'page-header' }, h('h1', {}, title), lead ? h('p', { class: 'lead' }, lead) : null);
}

export function tag(text, variant = '') {
  return h('span', { class: `tag${variant ? ` tag--${variant}` : ''}` }, text);
}

export function table(headers, rows) {
  return h(
    'div',
    { class: 'table-wrap' },
    h('table', {}, h('thead', {}, h('tr', {}, headers.map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, rows)),
  );
}
