import { PROMPT_VARIABLE_NAMES } from './variables.js';

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Returns the distinct variable names used in a template, in order of first use. */
export function findVariables(template) {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/**
 * Fills `{{variable}}` placeholders.
 * Variables without a value are left in place (so a platform can fill them later)
 * and reported in `unfilled`. Unknown variables in the template are reported too.
 */
export function renderPrompt(template, values = {}) {
  if (typeof template !== 'string') throw new TypeError('template must be a string');
  const unfilled = new Set();
  const text = template.replace(PLACEHOLDER, (match, name) => {
    const value = values[name];
    if (value === undefined || value === null) {
      unfilled.add(name);
      return match;
    }
    return String(value);
  });
  const used = findVariables(template);
  return {
    text,
    unfilled: [...unfilled],
    unknown: used.filter((name) => !PROMPT_VARIABLE_NAMES.includes(name)),
    missingFromTemplate: PROMPT_VARIABLE_NAMES.filter((name) => !used.includes(name)),
  };
}

/** Converts `{{var}}` to `{var}` for platforms that use single-brace variables. */
export function toSingleBraceSyntax(template) {
  return template.replace(PLACEHOLDER, (_, name) => `{${name}}`);
}

/** Runtime values derived from a Date, in the formats the prompt expects. */
export function runtimeDateValues(date = new Date(), timeZone = 'Asia/Kolkata') {
  const fmt = (options) => new Intl.DateTimeFormat('en-IN', { timeZone, ...options }).format(date);
  return {
    current_date: fmt({ day: 'numeric', month: 'long', year: 'numeric' }),
    current_day: fmt({ weekday: 'long' }),
    current_time: fmt({ hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}
