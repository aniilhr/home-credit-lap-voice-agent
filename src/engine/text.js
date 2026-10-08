/**
 * Text helpers for spoken-style customer utterances:
 * filler removal, number words, Indian currency units, durations.
 */

import { CRORE, LAKH } from './constants.js';

const FILLERS = /\b(?:u+m+|u+h+|h+m+|e+r+m*|a+h+|you know|like i said|basically)\b/g;

export function normalizeText(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\b(?:rs\.?|inr|rupees?)\s*(?=\d)/g, '₹')
    .replace(/([a-z])-([a-z])/g, '$1 $2')
    .replace(FILLERS, ' ')
    .replace(/\s*(?:\.\.\.|…|—|–)\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNIT_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS_WORDS = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const isNumberWord = (w) => w in UNIT_WORDS || w in TENS_WORDS || w === 'hundred';

/**
 * Converts spelled-out numbers to digits: "seventy-five" -> "75",
 * "one and a half" -> "1.5", "half a crore" -> "0.5 crore".
 */
export function convertNumberWords(text) {
  const prepared = text
    .replace(/\bhalf an?\b/g, '0.5')
    .replace(/([a-z0-9])-([a-z])/g, '$1 $2');
  const tokens = prepared.split(' ');
  const out = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const bare = tokens[i].replace(/[^a-z]/g, '');
    if (!isNumberWord(bare) || bare === 'hundred') {
      out.push(tokens[i]);
      continue;
    }

    let value = 0;
    let j = i;
    let trailing = '';
    while (j < tokens.length) {
      const word = tokens[j].replace(/[^a-z]/g, '');
      if (word in UNIT_WORDS) value += UNIT_WORDS[word];
      else if (word in TENS_WORDS) value += TENS_WORDS[word];
      else if (word === 'hundred') value = (value || 1) * 100;
      else break;
      trailing = tokens[j].replace(/[a-z]/g, '');
      j += 1;
      if (trailing) break; // punctuation ends the number phrase
    }

    if (!trailing && tokens[j] === 'and' && tokens[j + 1] === 'a' && /^half/.test(tokens[j + 2] ?? '')) {
      value += 0.5;
      trailing = tokens[j + 2].replace(/[a-z]/g, '');
      j += 3;
    }

    out.push(`${value}${trailing}`);
    i = j - 1;
  }
  return out.join(' ');
}

const MONEY_UNIT = '(lakhs?|lacs?|lacks?|lakh|crores?|cr|l)';
const NUM = '(\\d+(?:\\.\\d+)?)';

function unitMultiplier(unit) {
  return /^(crore|cr)/.test(unit) ? CRORE : LAKH;
}

/**
 * Finds money mentions in already number-converted text.
 * Returns [{ value (rupees), index, end, hasUnit }]. Ranges resolve to the upper bound.
 */
export function findMoneyMentions(text) {
  const mentions = [];
  const taken = [];
  const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a);
  const add = (value, index, end, hasUnit) => {
    if (overlaps(index, end)) return;
    taken.push([index, end]);
    mentions.push({ value: Math.round(value), index, end, hasUnit });
  };

  const range = new RegExp(`₹?\\s*${NUM}\\s*(?:to|-|or)\\s*₹?\\s*${NUM}\\s*${MONEY_UNIT}\\b`, 'g');
  for (const m of text.matchAll(range)) {
    const upper = Math.max(Number(m[1]), Number(m[2]));
    add(upper * unitMultiplier(m[3]), m.index, m.index + m[0].length, true);
  }

  const withUnit = new RegExp(`₹?\\s*${NUM}\\s*${MONEY_UNIT}\\b`, 'g');
  for (const m of text.matchAll(withUnit)) {
    add(Number(m[1]) * unitMultiplier(m[2]), m.index, m.index + m[0].length, true);
  }

  // Plain rupee figures such as "₹75,00,000" or "₹4500000".
  for (const m of text.matchAll(/₹\s*(\d{1,3}(?:,\d{2,3})+|\d{4,})/g)) {
    add(Number(m[1].replace(/,/g, '')), m.index, m.index + m[0].length, true);
  }

  // Large bare figures ("7500000") are unambiguous rupee amounts.
  for (const m of text.matchAll(/\b(\d{1,3}(?:,\d{2,3}){2,}|\d{6,})\b/g)) {
    add(Number(m[1].replace(/,/g, '')), m.index, m.index + m[0].length, true);
  }

  return mentions.sort((a, b) => a.index - b.index);
}

/** Finds duration mentions. Returns [{ years, index, end }]. Ranges resolve to the upper bound. */
export function findDurationMentions(text) {
  const mentions = [];
  const taken = [];
  const add = (years, index, end) => {
    if (taken.some(([a, b]) => index < b && end > a)) return;
    taken.push([index, end]);
    mentions.push({ years, index, end });
  };

  const yearUnit = '(?:years?|yrs?|saal|sal)\\b';
  for (const m of text.matchAll(new RegExp(`${NUM}\\s*(?:to|-|or)\\s*${NUM}\\s*${yearUnit}`, 'g'))) {
    add(Math.max(Number(m[1]), Number(m[2])), m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(new RegExp(`${NUM}\\s*${yearUnit}`, 'g'))) {
    add(Number(m[1]), m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(new RegExp(`${NUM}\\s*months?\\b`, 'g'))) {
    add(Math.round((Number(m[1]) / 12) * 100) / 100, m.index, m.index + m[0].length);
  }
  return mentions.sort((a, b) => a.index - b.index);
}

/** Splits text into clauses, keeping character offsets. Decimal points and digit commas are preserved. */
export function splitClauses(text) {
  const clauses = [];
  const boundary = /(?:[;!?]|\.(?!\d)|,(?!\d)|\b(?:and|but|while|also|plus)\b)/g;
  let start = 0;
  for (const m of text.matchAll(boundary)) {
    if (m.index > start) clauses.push({ text: text.slice(start, m.index), start, end: m.index });
    start = m.index + m[0].length;
  }
  if (start < text.length) clauses.push({ text: text.slice(start), start, end: text.length });
  return clauses.filter((c) => c.text.trim().length > 0);
}

export function clauseAt(clauses, index) {
  return clauses.find((c) => index >= c.start && index < c.end) ?? null;
}

const NEGATORS = /\b(?:not|no|never|without|isn'?t|aren'?t|wasn'?t|don'?t|doesn'?t|didn'?t|haven'?t|hasn'?t|nahi|nahin|na)\b|n't\b/;

/** True when one of the few words before `index` negates what follows. */
export function isNegated(text, index, windowWords = 3) {
  // Only look inside the current clause: in "actually no, it's agricultural" the "no" is a correction, not a negation.
  const clauseStart = Math.max(...[',', ';', '.', '!', '?'].map((p) => text.lastIndexOf(p, index - 1))) + 1;
  const before = text.slice(clauseStart, index).trim().split(/\s+/).slice(-windowWords).join(' ');
  return NEGATORS.test(before);
}

export const CORRECTION_MARKERS = /\b(?:actually|sorry|i mean|no wait|wait|rather|make that|correction|scratch that|let me correct)\b/;

export function hasCorrectionBetween(text, from, to) {
  return CORRECTION_MARKERS.test(text.slice(from, to));
}

export function formatRupees(amount) {
  if (amount >= CRORE) {
    const crore = amount / CRORE;
    return `₹${Number.isInteger(crore) ? crore : crore.toFixed(2).replace(/0+$/, '')} crore`;
  }
  if (amount >= LAKH) {
    const lakh = amount / LAKH;
    return `₹${Number.isInteger(lakh) ? lakh : lakh.toFixed(2).replace(/0+$/, '')} lakh`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}
