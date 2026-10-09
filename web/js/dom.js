/**
 * Small element builder. Children may be strings, nodes, arrays or null.
 * Text is always inserted as text nodes, never parsed as HTML.
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

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

/** Returns an inline SVG icon (stroke style, inherits currentColor). */
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}

export function card(title, body, { actions = null, flush = false, className = '' } = {}) {
  return h(
    'section',
    { class: `glass card ${className}`.trim() },
    title ? h('div', { class: 'card__head' }, typeof title === 'string' ? h('h2', {}, title) : title, actions) : null,
    flush ? body : h('div', { class: 'card__body' }, body),
  );
}

export function pageHead(eyebrow, title, lead) {
  return h(
    'div',
    { class: 'page-head' },
    eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null,
    h('h1', {}, title),
    lead ? h('p', { class: 'lead' }, lead) : null,
  );
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
