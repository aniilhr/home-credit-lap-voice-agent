/**
 * Reference extractor: turns one customer utterance into structured facts and intents.
 *
 * On a live voice platform the LLM performs this step from the system prompt.
 * This deterministic version exists so the business logic (state updates,
 * disqualification, transfer routing, handoff gate) can be tested and demoed
 * without a platform account. It targets English / Indian-English speech.
 */

import {
  INCOME_MODE,
  LAKH,
  OCCUPATION,
  OWNERSHIP,
  PROPERTY_TYPES,
} from './constants.js';
import {
  clauseAt,
  convertNumberWords,
  findDurationMentions,
  findMoneyMentions,
  hasCorrectionBetween,
  isNegated,
  normalizeText,
  splitClauses,
} from './text.js';

// ---------------------------------------------------------------------------
// Categorical signal detection
// ---------------------------------------------------------------------------

/**
 * Collects pattern matches as signals. A signal is { value, index, end, strength }.
 * Signals are dropped when negated, excluded by preceding context, or when the
 * pattern needs topical context that the clause (or the awaited question) lacks.
 */
function collectSignals(text, clauses, patterns, { contextRe = null, contextSatisfied = false } = {}) {
  const signals = [];
  for (const p of patterns) {
    for (const m of text.matchAll(p.re)) {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      if (p.exclude && p.exclude.test(before)) continue;
      if (isNegated(text, m.index)) continue;
      if (p.needsContext && !contextSatisfied) {
        const clause = clauseAt(clauses, m.index);
        if (!clause || !contextRe.test(clause.text)) continue;
      }
      signals.push({ value: p.value, index: m.index, end: m.index + m[0].length, strength: p.strength ?? 2 });
    }
  }
  return signals.sort((a, b) => a.index - b.index);
}

/**
 * Resolves competing signals for one field.
 * - Stronger signals win over weaker ones.
 * - Conflicting values resolve to the latest only when a correction marker
 *   ("actually", "sorry", "I mean") separates them; otherwise the answer is ambiguous.
 */
export function resolveSignals(signals, text) {
  if (signals.length === 0) return null;
  const top = Math.max(...signals.map((s) => s.strength));
  const strong = signals.filter((s) => s.strength === top);
  const values = [...new Set(strong.map((s) => s.value))];
  if (values.length === 1) return { value: values[0] };

  const last = strong[strong.length - 1];
  const previous = [...strong].reverse().find((s) => s.value !== last.value);
  if (hasCorrectionBetween(text, previous.end, last.index)) return { value: last.value, corrected: true };
  return { ambiguous: true, values };
}

const PROPERTY_PATTERNS = [
  {
    value: PROPERTY_TYPES.AGRICULTURAL,
    re: /\b(?:agricultur\w*|farm ?lands?|farming land|agri land|khet\w*|cultivable land|crop land|farm)\b(?! ?house)/g,
  },
  { value: PROPERTY_TYPES.INDUSTRIAL, re: /\b(?:industrial|factory|factories|manufacturing unit)\b/g },
  {
    value: PROPERTY_TYPES.COMMERCIAL,
    re: /\b(?:commercial|shops?|office|showroom|retail space|dukaan|dukan)\b/g,
    // "I run a shop" / "I work in an office" describe occupation, not the property.
    exclude: /\b(?:run|runs|running|work|works|working)\s+(?:in |at |from )?(?:a |an |my |our |the )?(?:small |own |family )?$/,
  },
  {
    value: PROPERTY_TYPES.RESIDENTIAL,
    re: /\b(?:residential|house|flat|apartment|bungalow|villa|duplex|row ?house|makaan|ghar|\d ?bhk)\b/g,
    // "papers are at home / in my house" is a location, not a property description.
    exclude: /\b(?:at|in|inside|from)\s+(?:my |our |the |a )?$/,
  },
  { value: PROPERTY_TYPES.RESIDENTIAL, re: /\b(?:my|our|own|family) home\b(?! loan)/g },
];

const OWNERSHIP_CONTEXT = /\b(?:own|owns|owned|owner|owners|ownership|name|names|title|joint\w*|co ?own\w*|share|shared|sole\w*|mine|registered|property|house|flat)\b/;
const OWNERSHIP_PATTERNS = [
  { value: OWNERSHIP.JOINT, re: /\b(?:joint\w*|co ?own\w*|both (?:of )?our names|our names|shared ownership|joint names?)\b/g },
  {
    value: OWNERSHIP.JOINT,
    re: /\b(?:with|and) (?:my |our )?(?:wife|husband|spouse|brother|sister|father|mother|dad|mom|mum|parents|son|daughter|partners?|family|uncle|cousin|in ?laws?)(?:'s)?\b/g,
    needsContext: true,
  },
  {
    value: OWNERSHIP.SOLE,
    re: /\b(?:sole\w*|solely|only me|just me|only my name|only in my name|in my name only|my name alone|in my name alone|me alone|single owner|only owner|nobody else|entirely mine|fully mine|only mine)\b/g,
  },
  {
    value: OWNERSHIP.SOLE,
    re: /\b(?:in my name|my own|mine|myself|alone|i own it|i'?m the owner)\b/g,
    strength: 1,
    needsContext: true,
  },
];

const OCCUPATION_PATTERNS = [
  {
    value: OCCUPATION.SELF_EMPLOYED,
    re: /\b(?:self ?employed|own business|my business|our business|family business|a business|business ?(?:man|woman|owner|person)|businessman|businesswoman|entrepreneur|freelanc\w*|consultant|proprietor|trader|shopkeeper|work for myself|(?:run|runs|running) (?:a|my|our|the) (?:\w+ )?(?:business|shop|firm|company|clinic|practice|store|agency|restaurant)|i do business|in business|dukaan chala\w*|vyapar\w*)\b/g,
  },
  {
    value: OCCUPATION.SALARIED,
    re: /\b(?:salaried|salary|on payroll|government (?:job|employee|servant)|govt (?:job|employee)|private job|naukri)\b/g,
  },
  {
    value: OCCUPATION.SALARIED,
    re: /\b(?:employee|employed|(?:a|my|full time) job|i work (?:at|for|in|with)|working (?:at|for|in|with|as)|i work as)\b/g,
    strength: 1,
  },
];

const OCCUPATION_OUTSIDE = /\b(?:retired|pensioner|student|homemaker|housewife|unemployed|not working|between jobs)\b/;
const NEITHER = /\b(?:neither|none of (?:these|them|those)|no income|not working|nothing)\b/;

const INCOME_CONTEXT = /\b(?:income|salary|earn\w*|paid|pay|payment|money|comes?|coming|receive\w*|credited|deposit\w*|turnover|revenue|sales|customers|clients)\b/;
const INCOME_PATTERNS = [
  {
    value: INCOME_MODE.BANK,
    re: /\b(?:bank\w*|account|a\/c|neft|rtgs|imps|upi|cheques?|bank transfer|online transfer|online|credited|direct deposit)\b/g,
    needsContext: true,
  },
  { value: INCOME_MODE.CASH, re: /\b(?:cash|in hand|by hand|hand mein|nagad|nakad)\b/g, needsContext: true },
];
const DOMINANT = /\b(?:mostly|mainly|majorly|majority|primarily|largely|most of|almost all|nearly all|predominantly|all of)\b/;

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const DOC_CONTEXT = /\b(?:original\w*|papers?|documents?|docs|deeds?|registry|registries|title|paperwork|kaagaz\w*)\b/;
const DOC_LENDER = /\b(?:with|at|in|to) (?:the |a |my )?(?:bank|lender|nbfc|financier|finance company|housing finance)\b|\bmortgaged\b|\bpledged\b/;
const DOC_NEG = /\b(?:(?:only|just) (?:have )?(?:the |a )?(?:photo ?cop\w*|xerox\w*|cop(?:y|ies)|scan\w*|soft cop\w*|duplicates?)|(?:got |been |was |were )?(?:lost|misplaced|missing)|(?:don'?t|do not|didn'?t) have|(?:haven'?t|have not) got|not available|unavailable|no originals?|not with me anymore|nahi hai|nahin hai)\b/g;
const DOC_HEDGE = /\b(?:i think|i believe|probably|maybe|might|not sure|unsure|i guess|should be|have to check|need to check|let me check|will check|don'?t know|no idea|don'?t think|not certain)\b/g;
const DOC_POS = /\b(?:have|got|available|with me|at home|ready|safe|in (?:my|the|a) (?:locker|cupboard|almirah|safe)|i do|we do|yes|yeah|yep|haan|of course|sure|definitely|absolutely|all there)\b/g;
const BARE_NO = /^(?:no|nope|nah|nahi|nahin|not really|no sir|no ma'?am)\b/;

function blank(text, re) {
  return text.replace(re, (m) => ' '.repeat(m.length));
}

function detectDocuments(text, awaitingDocs) {
  if (!awaitingDocs && !DOC_CONTEXT.test(text)) return null;
  // Outside the documents question, only consider clauses that talk about documents.
  const scope = awaitingDocs
    ? text
    : splitClauses(text).filter((c) => DOC_CONTEXT.test(c.text)).map((c) => c.text).join(', ');

  if (DOC_LENDER.test(scope)) return { lenderHeld: true };

  const neg = [...scope.matchAll(DOC_NEG)];
  const hedge = [...scope.matchAll(DOC_HEDGE)];
  const posText = blank(blank(scope, DOC_NEG), DOC_HEDGE);
  const pos = [...posText.matchAll(DOC_POS)];

  if (neg.length && pos.length) {
    const lastNeg = neg[neg.length - 1];
    const lastPos = pos[pos.length - 1];
    const [first, second, value] = lastNeg.index > lastPos.index ? [lastPos, lastNeg, false] : [lastNeg, lastPos, true];
    if (hasCorrectionBetween(scope, first.index + first[0].length, second.index)) return { value };
    return { ambiguous: true };
  }
  if (neg.length) return { value: false };
  if (hedge.length) return { ambiguous: true };
  if (pos.length) return { value: true };
  if (awaitingDocs && BARE_NO.test(scope)) return { value: false };
  return null;
}

// ---------------------------------------------------------------------------
// Numeric fields
// ---------------------------------------------------------------------------

const MARKET_CUES = /\b(?:worth|value|valued|valuation|market|price|priced|cost|costs|sell|fetch|estimate\w*|appraised)\b/g;
const LOAN_CUES = /\b(?:need|needs|needed|want|wants|wanted|looking|borrow\w*|loan|require\w*|take|apply|amount|sanction\w*)\b/g;
const INCOME_CUES = /\b(?:earn\w*|salary|income|per month|a month|monthly|per annum|a year|yearly|annual\w*|turnover|profit|emi|ctc|package)\b/g;
const PROPERTY_NOUN_AFTER = /^\s*(?:worth of )?(?:property|house|flat|home|shop|office|factory|building|apartment|bungalow|villa)\b/;
const NON_TENURE_CUES = /\b(?:owned|own it|bought|purchased|working|work|job|business|since|old|ago|living|lived|staying|stayed|built|constructed|experience|age|aged|salaried|employed|company|service)\b/;

function nearestCueRole(text, clause, mention) {
  const candidates = [
    ['market_value', MARKET_CUES],
    ['loan_amount', LOAN_CUES],
    ['income', INCOME_CUES],
  ];
  let best = null;
  for (const [role, re] of candidates) {
    for (const m of clause.text.matchAll(re)) {
      const cueStart = clause.start + m.index;
      const cueEnd = cueStart + m[0].length;
      const distance = cueEnd <= mention.index ? mention.index - cueEnd : cueStart - mention.end + 15;
      if (distance >= 0 && (!best || distance < best.distance)) best = { role, distance };
    }
  }
  if (PROPERTY_NOUN_AFTER.test(text.slice(mention.end))) return 'market_value';
  return best?.role ?? null;
}

function attributeMoney(text, clauses, awaiting) {
  const mentions = findMoneyMentions(text);
  const assigned = [];
  mentions.forEach((mention, i) => {
    const clause = clauseAt(clauses, mention.index) ?? { text, start: 0, end: text.length };
    let role = nearestCueRole(text, clause, mention);
    if (!role && i > 0 && assigned.length) {
      const prev = assigned[assigned.length - 1];
      if (hasCorrectionBetween(text, prev.end, mention.index)) role = prev.role;
    }
    if (!role && (awaiting === 'loan_amount' || awaiting === 'market_value')) role = awaiting;
    if (!role && awaiting === 'loan_cap') role = 'loan_amount';
    if (role === 'loan_amount' || role === 'market_value') assigned.push({ ...mention, role });
  });
  return assigned;
}

function attributeDurations(text, clauses, awaiting) {
  return findDurationMentions(text).filter((mention) => {
    const clause = clauseAt(clauses, mention.index);
    const clauseText = clause ? clause.text : text;
    if (awaiting === 'tenure') return !/\b(?:old|ago|age|aged)\b/.test(clauseText);
    return !NON_TENURE_CUES.test(clauseText);
  });
}

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

const OTHER_LOAN_TYPES = /\b(?:car|vehicle|bike|two wheeler|personal|gold|education|business|credit card|consumer|mobile|phone)\s+loans?\b/;
const NEGATION_INSIDE = /\b(?:no|not|never|without|don'?t|nahi)\b/;

const EXISTING_LOAN_PATTERNS = [
  /\b(?:already|existing|current|currently|running|ongoing|outstanding|active|pending)\b[\w\s']{0,20}?\b(?:home loan|housing loan|property loan|mortgage|loan against (?:the |this |my )?(?:property|it|this|house|flat))\b/g,
  /\b(?:have|has|had|got|taken|took|running|existing|already|still paying|paying|there'?s|there is)\b[\w\s']{0,20}?\b(?:loan|mortgage)\s+(?:on|against)\s+(?:this|the|my|that|it|our)\b/g,
  /\b(?:is|it'?s|its|property is|house is)\s+(?:already\s+)?mortgaged\b/g,
  /\b(?:paying|pay)\s+(?:an?\s+)?emis?\s+(?:on|for)\s+(?:this|the|my|that|it)\b/g,
];
const EXISTING_LOAN_GENERIC = /\b(?:already|existing|running|current|ongoing|outstanding)\b[\w\s']{0,15}?\bloan\b/g;

const EMI_REDUCTION_PATTERNS = [
  /\b(?:reduce|reducing|lower|lowering|decrease|bring down|cut|minimi[sz]e)\s+(?:my|our|the current|current|existing|present|running|monthly)\s+(?:\w+\s+)?emis?\b/g,
  /\b(?:my|our|current|existing|present)\s+emis?\b[\w\s']{0,20}?\b(?:too high|very high|high|burden|heavy)\b/g,
  /\bbalance transfer\b/g,
  /\b(?:transfer|shift|move|switch|take over)\s+(?:my|our|the)\s+(?:existing\s+|current\s+|home\s+)?(?:loan|emi)\b/g,
  /\brefinanc\w*\b/g,
];

function findUnnegated(text, patterns, { rejectInside = null } = {}) {
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      if (isNegated(text, m.index, 4)) continue;
      if (NEGATION_INSIDE.test(m[0])) continue;
      if (rejectInside && rejectInside.test(m[0])) continue;
      return true;
    }
  }
  return false;
}

function detectExistingLoan(text, phase) {
  if (findUnnegated(text, EXISTING_LOAN_PATTERNS, { rejectInside: OTHER_LOAN_TYPES })) return true;
  const propertyTalk = /\b(?:property|house|flat|home|shop|office|it|this)\b/.test(text);
  if (phase === 'loan_check' || propertyTalk) {
    return findUnnegated(text, [EXISTING_LOAN_GENERIC], { rejectInside: OTHER_LOAN_TYPES });
  }
  return false;
}

const AFFIRM = /^(?:yes|yeah|yep|yup|ya|haan|han|ji|sure|okay|ok|correct|right|of course|definitely|absolutely|go ahead|please|fine|alright|why not|sounds good|that'?s right|speaking|tell me|bolo|i do|we do)\b/;
const DENY = /^(?:no|nope|nah|nahi|nahin|not really|never|not at all)\b/;
const BUSY = /\b(?:busy|not now|in a meeting|driving|call (?:me )?(?:back )?later|call back|not a good time|bad time|can'?t talk|cannot talk|not free|abhi nahi|baad mein|talk later)\b/;
const NOT_INTERESTED = /\b(?:not interested|no thanks|no thank you|don'?t (?:need|want) (?:a |any )?(?:loan|this|it)|not looking for (?:a |any )?loan|stop calling|remove my number)\b/;
const WRONG_PERSON = /\b(?:wrong number|not (?:him|her)|(?:he|she)(?:'s| is) not (?:here|available|home|around)|(?:he|she) isn'?t (?:here|available|home|around)|no one by that name|nobody by that name|doesn'?t live here|this is (?:his|her) (?:wife|husband|son|daughter|father|mother|brother|sister))\b/;
const WHO_IS_CALLING = /\b(?:who(?:'?s| is) (?:this|calling|it|speaking)|who are you|where are you calling from|which company|kaun)\b/;
const QUESTION_START = /^(?:what|where|when|why|how|which|who|can you|could you|do you|does|is there|is it|are there|will|would|tell me|kya|kitna|kab)\b/;
const INTEREST = /\b(?:interest|rate of interest|roi|interest rates?|rates?)\b/;
const ASK_PERMISSION = /\b(?:can i ask (?:you )?(?:something|a question)|i have a question|one question|quick question)\b/;
const PRESENCE = /^(?:hello|hi|hey|are you there|can you hear me|you there)[\s?!.,]*(?:hello[\s?!.,]*)*$/;
const HOLD = /^(?:wait|hold on|one (?:sec|second|minute|min)|just a (?:sec|second|minute)|give me a (?:sec|second|minute))\b/;
const ELIGIBILITY_CHECK = /\b(?:am i eligible|do i qualify|will i get (?:it|the loan)|am i qualified|is it approved)\b/;
const FRESH_LOAN = /\b(?:fresh|new loan|no loan|no existing|free of (?:any )?loans?|loan free|not mortgaged|clear title|nothing (?:on it|pending)|no,? nothing|none)\b/;
const TIME_EXPRESSION = /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|o'?clock|baje)|\d{1,2}(?::\d{2})|morning|afternoon|evening|night|tonight|today|tomorrow|day after|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|next week|in (?:an?|\d+) (?:hour|hours|minutes?|mins?)|after (?:\d{1,2}|lunch|work|office)|before (?:\d{1,2}|lunch)|later today|lunch|kal|shaam|subah)\b/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyses one customer utterance.
 *
 * @param {string} utterance raw customer speech (transcribed)
 * @param {{ awaiting?: string|null, phase?: string }} context the question the agent last asked
 * @returns {{
 *   clean: string,
 *   facts: Record<string, unknown>,
 *   ambiguous: string[],
 *   confirm: { field: string, value: number } | null,
 *   intents: Record<string, boolean|string>
 * }}
 */
export function analyzeUtterance(utterance, { awaiting = null, phase = null } = {}) {
  const clean = normalizeText(utterance);
  const numeric = convertNumberWords(clean);
  const clauses = splitClauses(clean);
  const numericClauses = splitClauses(numeric);

  const facts = {};
  const ambiguous = [];
  let confirm = null;

  const applyResolution = (field, resolution) => {
    if (!resolution) return;
    if (resolution.ambiguous) ambiguous.push(field);
    else facts[field] = resolution.value;
  };

  // Property type
  applyResolution('property_type', resolveSignals(collectSignals(clean, clauses, PROPERTY_PATTERNS), clean));

  // Ownership
  applyResolution(
    'ownership_status',
    resolveSignals(
      collectSignals(clean, clauses, OWNERSHIP_PATTERNS, {
        contextRe: OWNERSHIP_CONTEXT,
        contextSatisfied: awaiting === 'ownership_status',
      }),
      clean,
    ),
  );

  // Documents (an originals-held-by-lender answer means there is a loan on the property)
  const docs = detectDocuments(clean, awaiting === 'documents_available');
  let lenderHoldsDocuments = false;
  if (docs?.lenderHeld) lenderHoldsDocuments = true;
  else if (docs?.ambiguous) ambiguous.push('documents_available');
  else if (docs) facts.documents_available = docs.value;

  // Occupation
  applyResolution('occupation', resolveSignals(collectSignals(clean, clauses, OCCUPATION_PATTERNS), clean));
  const awaitingIncomeItem = awaiting === 'occupation_income';

  // Income mode
  const incomeSignals = collectSignals(clean, clauses, INCOME_PATTERNS, {
    contextRe: INCOME_CONTEXT,
    contextSatisfied: awaitingIncomeItem,
  });
  const modes = [...new Set(incomeSignals.map((s) => s.value))];
  if (modes.length === 1) {
    facts.income_mode = modes[0];
  } else if (modes.length > 1) {
    const dominant = modes.filter((mode) =>
      incomeSignals.some((s) => s.value === mode && DOMINANT.test(clauseAt(clauses, s.index)?.text ?? '')),
    );
    if (dominant.length === 1) facts.income_mode = dominant[0];
    else applyResolution('income_mode', resolveSignals(incomeSignals, clean));
  }

  // Money
  const money = attributeMoney(numeric, numericClauses, awaiting);
  for (const m of money) facts[m.role] = m.value; // later mentions overwrite earlier ones

  // Durations
  const durations = attributeDurations(numeric, numericClauses, awaiting);
  if (durations.length) facts.tenure = durations[durations.length - 1].years;

  // Bare numbers in answer to a numeric question ("around 50", "12")
  const bare = numeric.match(/^\D*?(\d+(?:\.\d+)?)(?!\s*(?:%|percent))\D*$/);
  if (bare && !money.length && !durations.length) {
    const n = Number(bare[1]);
    if (awaiting === 'tenure' && n > 0 && n <= 40) facts.tenure = n;
    if (awaiting === 'loan_amount' || awaiting === 'market_value') {
      if (n >= 1000) facts[awaiting] = n;
      else if (n > 0) confirm = { field: awaiting, value: Math.round(n * LAKH) };
    }
  }

  const isQuestion =
    clean.includes('?') || QUESTION_START.test(clean) || ASK_PERMISSION.test(clean) || ELIGIBILITY_CHECK.test(clean);

  const timeMatch = numeric.match(TIME_EXPRESSION);

  const intents = {
    affirm: AFFIRM.test(clean),
    deny: DENY.test(clean),
    busy: BUSY.test(clean) && !/\b(?:not busy|i'?m free|am free)\b/.test(clean),
    notInterested: NOT_INTERESTED.test(clean),
    wrongPerson: WRONG_PERSON.test(clean),
    whoIsCalling: WHO_IS_CALLING.test(clean),
    question: isQuestion,
    interestQuestion: isQuestion && INTEREST.test(clean),
    askPermission: ASK_PERMISSION.test(clean),
    hold: HOLD.test(clean),
    presenceCheck: PRESENCE.test(clean),
    eligibilityCheck: ELIGIBILITY_CHECK.test(clean),
    existingLoan: lenderHoldsDocuments || detectExistingLoan(clean, phase),
    lenderHoldsDocuments,
    emiReduction: findUnnegated(clean, EMI_REDUCTION_PATTERNS),
    freshLoan: FRESH_LOAN.test(clean),
    occupationOutsideCriteria: OCCUPATION_OUTSIDE.test(clean) && !facts.occupation,
    neither: NEITHER.test(clean),
    callbackTime: timeMatch ? utterance.trim() : null,
  };

  return { clean, facts, ambiguous, confirm, intents };
}
