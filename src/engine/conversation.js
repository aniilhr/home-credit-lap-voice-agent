/**
 * Reference conversation engine for the LAP qualification call.
 *
 * Each customer turn runs the same pipeline the system prompt prescribes:
 *   extract -> store -> check disqualification -> check transfer intent
 *   -> update state -> find the earliest unanswered item -> ask only that.
 */

import { MAX_LOAN_AMOUNT, OCCUPATION, OUTCOMES, PHASES, UNKNOWN } from './constants.js';
import { analyzeUtterance } from './extract.js';
import { canHandoff, findDisqualification, RULES } from './rules.js';
import { ack, describeFact, lines, questionFor } from './responses.js';
import { answerFromContext } from './knowledge.js';
import { cloneState, createInitialState, firstMissingItem, isKnown } from './state.js';
import { convertNumberWords, normalizeText } from './text.js';

const REQUIRED_CONFIG = ['company_name', 'customer_name', 'agent_name', 'agent_gender', 'language_to_speak'];
const SUPPORTED_GENDERS = ['female', 'male'];
const SUPPORTED_LANGUAGES = ['english', 'hindi'];

export class ConfigError extends Error {}

export function validateConfig(config) {
  const errors = [];
  for (const key of REQUIRED_CONFIG) {
    if (typeof config?.[key] !== 'string' || config[key].trim() === '') errors.push(`${key} is required`);
  }
  if (config?.agent_gender && !SUPPORTED_GENDERS.includes(config.agent_gender.toLowerCase())) {
    errors.push(`agent_gender must be one of: ${SUPPORTED_GENDERS.join(', ')}`);
  }
  if (config?.language_to_speak && !SUPPORTED_LANGUAGES.includes(config.language_to_speak.toLowerCase())) {
    errors.push(`language_to_speak must be one of: English, Hindi`);
  }
  return errors;
}

export function createSession(config) {
  const errors = validateConfig(config);
  if (errors.length) throw new ConfigError(errors.join('; '));
  return {
    config: { additional_context_from_rag: '', ...config },
    state: createInitialState(),
    transcript: [],
  };
}

/** The agent's first line. */
export function startCall(session) {
  const reply = lines.opening(session.config);
  return {
    session: { ...session, transcript: [...session.transcript, { role: 'agent', text: reply }] },
    reply,
    events: [{ type: 'call_started' }],
  };
}

/**
 * Processes one customer utterance and returns the next session, the agent reply
 * and the list of state events produced by this turn.
 */
export function processTurn(session, utterance) {
  if (typeof utterance !== 'string' || utterance.trim() === '') {
    throw new TypeError('utterance must be a non-empty string');
  }
  if (session.state.phase === PHASES.ENDED) {
    return { session, reply: null, events: [{ type: 'call_already_ended' }], analysis: null };
  }

  const state = cloneState(session.state);
  state.turn += 1;
  const analysis = analyzeUtterance(utterance, { awaiting: state.awaiting, phase: state.phase });
  const ctx = { state, config: session.config, analysis, events: [], utterance };

  const reply = route(ctx);

  return {
    session: {
      ...session,
      state,
      transcript: [
        ...session.transcript,
        { role: 'customer', text: utterance },
        ...(reply ? [{ role: 'agent', text: reply }] : []),
      ],
    },
    reply,
    events: ctx.events,
    analysis,
  };
}

// ---------------------------------------------------------------------------

function route(ctx) {
  switch (ctx.state.phase) {
    case PHASES.VERIFICATION:
      return handleVerification(ctx);
    case PHASES.CALLBACK:
      return handleCallback(ctx);
    case PHASES.AVAILABILITY:
      return handleAvailability(ctx);
    case PHASES.LOAN_CHECK:
    case PHASES.QUALIFICATION:
      return handleQualification(ctx);
    default:
      throw new Error(`Unhandled phase "${ctx.state.phase}"`);
  }
}

function endCall(ctx, outcome, reply, extra = {}) {
  const { state, events } = ctx;
  state.phase = PHASES.ENDED;
  state.awaiting = null;
  state.pending_confirmation = null;
  state.outcome = outcome;
  events.push({ type: 'call_ended', outcome, ...extra });
  return reply;
}

function handleVerification(ctx) {
  const { state, config, analysis, events } = ctx;
  const { intents } = analysis;

  if (intents.whoIsCalling && !intents.affirm) return lines.identify(config);

  if (intents.wrongPerson || (intents.deny && !intents.affirm && !intents.busy)) {
    state.customer_verified = false;
    events.push({ type: 'verification_failed' });
    return endCall(ctx, OUTCOMES.WRONG_PERSON, lines.wrongPerson(config));
  }

  const confirmsIdentity = intents.affirm || /\b(?:this is|i am|i'm|it's me|that's me|speaking)\b/.test(analysis.clean);

  if (intents.busy) {
    if (confirmsIdentity) setVerified(ctx);
    return startCallback(ctx);
  }

  if (!confirmsIdentity) return lines.reVerify(config);

  setVerified(ctx);
  state.phase = PHASES.AVAILABILITY;
  state.awaiting = 'availability';

  // A customer who already volunteers details or intent is clearly available.
  if (hasSubstance(analysis)) {
    state.customer_available = true;
    state.phase = PHASES.LOAN_CHECK;
    state.awaiting = 'existing_loan';
    return handleQualification(ctx);
  }
  return lines.availability(config);
}

function setVerified(ctx) {
  ctx.state.customer_verified = true;
  ctx.events.push({ type: 'customer_verified' });
}

function hasSubstance(analysis) {
  const { intents } = analysis;
  return (
    Object.keys(analysis.facts).length > 0 ||
    intents.existingLoan ||
    intents.emiReduction ||
    intents.notInterested
  );
}

function startCallback(ctx) {
  ctx.state.phase = PHASES.CALLBACK;
  ctx.state.awaiting = 'callback_time';
  ctx.state.customer_available = false;
  ctx.events.push({ type: 'customer_busy' });
  const time = extractTimePhrase(ctx.utterance);
  if (time) return confirmCallback(ctx, time);
  return lines.askCallbackTime();
}

function handleCallback(ctx) {
  const time = extractTimePhrase(ctx.utterance);
  if (time) return confirmCallback(ctx, time);
  ctx.state.callback_attempts = (ctx.state.callback_attempts ?? 0) + 1;
  if (ctx.state.callback_attempts >= 2 || ctx.analysis.intents.deny) {
    ctx.state.callback_time = 'not specified';
    return endCall(ctx, OUTCOMES.CALLBACK_SCHEDULED, lines.callbackUnspecified());
  }
  return lines.reAskCallbackTime();
}

function confirmCallback(ctx, time) {
  ctx.state.callback_time = time;
  ctx.events.push({ type: 'callback_time_captured', value: time });
  return endCall(ctx, OUTCOMES.CALLBACK_SCHEDULED, lines.callbackConfirmed(time));
}

const TIME_TOKEN = /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|o'?clock|baje)?|morning|afternoon|evening|night|tonight|today|tomorrow|day after tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|next week|in (?:an?|\d+) (?:hour|hours|minutes?|mins?)|(?:after|before|around|at) (?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|lunch|work|office)|later today|lunch ?time|kal|shaam|subah)\b/g;

/** Returns the span covering every time expression in the utterance, e.g. "tomorrow after 6 pm". */
export function extractTimePhrase(utterance) {
  const text = convertNumberWords(normalizeText(utterance));
  const matches = [...text.matchAll(TIME_TOKEN)];
  if (!matches.length) return null;
  const first = matches[0];
  const last = matches[matches.length - 1];
  return text.slice(first.index, last.index + last[0].length).trim();
}

function handleAvailability(ctx) {
  const { state, config, analysis } = ctx;
  const { intents } = analysis;

  if (intents.notInterested) return endCall(ctx, OUTCOMES.NOT_INTERESTED, lines.notInterested(config));
  if (intents.busy || (intents.deny && !hasSubstance(analysis))) return startCallback(ctx);

  if (intents.affirm || intents.question || hasSubstance(analysis)) {
    state.customer_available = true;
    ctx.events.push({ type: 'customer_available' });
    state.phase = PHASES.LOAN_CHECK;
    state.awaiting = 'existing_loan';
    if (hasSubstance(analysis) || (intents.question && !intents.affirm)) return handleQualification(ctx, { offerFirst: true });
    return `${lines.offerIntro(config)} ${lines.existingLoanQuestion()}`;
  }
  return lines.reAvailability();
}

// ---------------------------------------------------------------------------
// Main qualification pipeline (also handles the existing-loan check)
// ---------------------------------------------------------------------------

function handleQualification(ctx, { offerFirst = false } = {}) {
  const { state, config, analysis } = ctx;
  const { intents } = analysis;
  const prefix = offerFirst ? `${lines.offerIntro(config)} ` : '';

  // 1–2. Extract and store every fact in the utterance.
  const captured = storeFacts(ctx);

  // 3. Disqualifying information ends the call immediately.
  const failure = findDisqualification(state);
  if (failure) {
    state.disqualified = true;
    state.disqualification_reason = failure.reason;
    return endCall(ctx, OUTCOMES.DISQUALIFIED, lines.disqualified(config, failure.field), { field: failure.field });
  }

  // 4. Existing-loan / EMI-reduction intent switches to the transfer branch.
  const transfer = detectTransfer(ctx);
  if (transfer) {
    state.transfer_required = true;
    return endCall(ctx, OUTCOMES.TRANSFER_TO_SPECIALIST, lines.transfer(config, transfer), { reason: transfer });
  }

  if (intents.notInterested) return endCall(ctx, OUTCOMES.NOT_INTERESTED, lines.notInterested(config));

  // Pending confirmations (loan cap, bare amounts, occupation outside criteria).
  if (state.pending_confirmation) {
    const result = resolvePending(ctx, captured);
    if (result.reply) return result.reply;
  }

  // Loan amount above the cap: offer ₹75 lakh instead of rejecting.
  if (state.pending_confirmation?.kind === 'loan_cap') {
    return prefix + lines.loanCap(state.requested_loan_amount);
  }

  // Ambiguous statements are clarified, never assumed.
  const unclear = analysis.ambiguous.find((field) => !captured.some((c) => c.field === field));
  if (unclear) {
    state.awaiting = clarificationTarget(unclear);
    ctx.events.push({ type: 'clarification_requested', field: unclear });
    const lead = captured.length ? `${acknowledge(ctx, captured)} ` : '';
    return prefix + lead + lines.clarify[unclear];
  }

  if (analysis.confirm && !captured.some((c) => c.field === analysis.confirm.field)) {
    state.pending_confirmation = { kind: 'amount_unit', field: analysis.confirm.field, value: analysis.confirm.value };
    state.awaiting = 'amount_confirmation';
    return lines.confirmAmount(analysis.confirm.value);
  }

  if (intents.occupationOutsideCriteria && !isKnown(state.occupation)) {
    state.pending_confirmation = { kind: 'occupation_other', field: 'occupation' };
    state.awaiting = 'occupation_clarification';
    return lines.occupationOutside();
  }

  // Existing-loan check before the checklist.
  if (state.phase === PHASES.LOAN_CHECK) {
    if (intents.freshLoan || (intents.deny && !intents.affirm)) {
      state.existing_property_loan = false;
      ctx.events.push({ type: 'fresh_loan_confirmed' });
      state.phase = PHASES.QUALIFICATION;
    } else if (captured.length === 0) {
      const answer = diversionAnswer(ctx);
      if (answer) return `${prefix}${answer} ${lines.reAskExistingLoan()}`;
      return prefix + (offerFirst ? lines.existingLoanQuestion() : lines.reAskExistingLoan());
    } else {
      // Details volunteered instead of a yes/no: keep them, then confirm the loan question once.
      if (!state.loan_check_reasked) {
        state.loan_check_reasked = true;
        return `${prefix}${acknowledge(ctx, captured)} ${lines.reAskExistingLoan()}`;
      }
      state.phase = PHASES.QUALIFICATION;
    }
  }

  // 5–7. Handoff gate, otherwise ask the earliest unanswered item.
  if (canHandoff(state)) {
    ctx.events.push({ type: 'handoff_gate_passed' });
    return endCall(ctx, OUTCOMES.QUALIFIED_HANDOFF, lines.handoff(config));
  }

  const next = firstMissingItem(state);
  const question = questionFor(next.id, state);
  const repeated = state.awaiting === next.id && captured.length === 0;
  state.awaiting = next.id;
  ctx.events.push({ type: 'next_question', item: next.id });

  // With facts captured, only explicit interruptions get a reply before the next question.
  const diversion = captured.length === 0 || intents.askPermission || intents.hold || intents.interestQuestion
    ? diversionAnswer(ctx)
    : null;
  const lead = captured.length ? `${acknowledge(ctx, captured)} ` : '';
  if (diversion === lines.goAhead() || diversion === lines.hold()) return `${lead}${diversion}`;
  if (diversion === lines.presence()) return `${diversion} ${question}`;
  if (diversion) return `${prefix}${lead}${diversion} Coming back to the details — ${continuation(question)}`;
  if (captured.length) return `${prefix}${lead}${question}`;
  if (repeated) return `${lines.notCaught()} ${question}`;
  return prefix + question;
}

function storeFacts(ctx) {
  const { state, analysis, events } = ctx;
  const captured = [];
  const awaitingCap = state.pending_confirmation?.kind === 'loan_cap';

  for (const [field, value] of Object.entries(analysis.facts)) {
    if (field === 'loan_amount' && value > MAX_LOAN_AMOUNT) {
      state.requested_loan_amount = value;
      state.loan_amount = UNKNOWN;
      state.pending_confirmation = { kind: 'loan_cap', field: 'loan_amount', value: MAX_LOAN_AMOUNT };
      state.awaiting = 'loan_cap';
      events.push({ type: 'loan_cap_exceeded', value });
      continue;
    }
    if (field === 'loan_amount' && awaitingCap) {
      state.pending_confirmation = null;
      events.push({ type: 'loan_cap_resolved', value });
    }

    const previous = state[field];
    if (previous === value) continue;
    state[field] = value;
    const corrected = isKnown(previous);
    events.push({ type: corrected ? 'fact_corrected' : 'fact_captured', field, value, previous: corrected ? previous : undefined });
    captured.push({ field, value, corrected });
  }
  return captured;
}

function detectTransfer(ctx) {
  const { state, analysis, events } = ctx;
  const { intents } = analysis;
  const answeredYesToLoanCheck =
    state.phase === PHASES.LOAN_CHECK && intents.affirm && !intents.freshLoan && Object.keys(analysis.facts).length === 0 && !intents.question;

  if (intents.emiReduction) {
    state.emi_reduction_request = true;
    events.push({ type: 'emi_reduction_detected' });
    return 'emi';
  }
  if (intents.existingLoan || answeredYesToLoanCheck) {
    state.existing_property_loan = true;
    events.push({ type: 'existing_loan_detected' });
    return 'existing_loan';
  }
  return null;
}

function resolvePending(ctx, captured) {
  const { state, config, analysis, events } = ctx;
  const { intents } = analysis;
  const pending = state.pending_confirmation;

  if (pending.kind === 'loan_cap') {
    if (captured.some((c) => c.field === 'loan_amount')) return {};
    if (intents.affirm && !intents.deny) {
      state.loan_amount = MAX_LOAN_AMOUNT;
      state.pending_confirmation = null;
      events.push({ type: 'loan_cap_accepted', value: MAX_LOAN_AMOUNT });
      captured.push({ field: 'loan_amount', value: MAX_LOAN_AMOUNT, corrected: false });
      return {};
    }
    if (intents.deny) {
      events.push({ type: 'loan_cap_declined' });
      return { reply: endCall(ctx, OUTCOMES.LOAN_CAP_DECLINED, lines.loanCapDeclined(config)) };
    }
    const diversion = diversionAnswer(ctx);
    if (diversion) return { reply: `${diversion} So, would you like to proceed with ₹75 lakh?` };
    return {};
  }

  if (pending.kind === 'amount_unit') {
    if (captured.some((c) => c.field === pending.field)) {
      state.pending_confirmation = null;
      return {};
    }
    state.pending_confirmation = null;
    if (intents.affirm) {
      // Re-run storage so the cap rule applies to confirmed amounts too.
      analysis.facts = { [pending.field]: pending.value };
      captured.push(...storeFacts(ctx));
      return {};
    }
    state.awaiting = pending.field;
    return { reply: questionFor(pending.field, state) };
  }

  if (pending.kind === 'occupation_other') {
    if (isKnown(state.occupation)) {
      state.pending_confirmation = null;
      return {};
    }
    if (intents.deny || intents.neither || intents.occupationOutsideCriteria) {
      state.occupation = OCCUPATION.OTHER;
      state.pending_confirmation = null;
      state.disqualified = true;
      state.disqualification_reason = RULES.occupation.failReason;
      events.push({ type: 'fact_captured', field: 'occupation', value: OCCUPATION.OTHER });
      return { reply: endCall(ctx, OUTCOMES.DISQUALIFIED, lines.disqualified(config, 'occupation'), { field: 'occupation' }) };
    }
    return { reply: lines.occupationOutside() };
  }
  return {};
}

function clarificationTarget(field) {
  if (field === 'occupation' || field === 'income_mode') return 'occupation_income';
  return field;
}

function diversionAnswer(ctx) {
  const { intents } = ctx.analysis;
  const rag = ctx.config.additional_context_from_rag;
  if (intents.presenceCheck) return lines.presence();
  if (intents.askPermission && !intents.interestQuestion) return lines.goAhead();
  if (intents.hold && !intents.question) return lines.hold();
  if (intents.interestQuestion) return answerFromContext(ctx.analysis.clean, rag, { topic: 'interest' }) ?? lines.interestFallback();
  if (intents.eligibilityCheck) return lines.eligibilityPending();
  if (intents.question) {
    const fromContext = answerFromContext(ctx.analysis.clean, rag);
    if (fromContext) return fromContext;
    return /\b(?:documents?|papers?|paperwork)\b/.test(ctx.analysis.clean) ? lines.documentsListFallback() : lines.unknownAnswer();
  }
  return null;
}

function acknowledge(ctx, captured) {
  const corrected = captured.some((c) => c.corrected);
  const parts = captured.map((c) => describeFact(c.field, c.value));
  const lead = corrected ? 'Thanks for the correction' : ack(ctx.state.turn);
  return `${lead} — ${joinNatural(parts)}.`;
}

function joinNatural(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function continuation(question) {
  const text = question.replace(/^And /, '');
  return text.charAt(0).toLowerCase() + text.slice(1);
}
