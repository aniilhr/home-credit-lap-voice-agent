/**
 * Rule guard: checks each live agent turn against the business rules,
 * using the tracked state and the deterministic rule engine.
 * Every check returns pass / warn / fail, or n/a when it does not apply yet.
 */

import { MAX_LOAN_AMOUNT, OUTCOMES, UNKNOWN } from '../engine/constants.js';
import { canHandoff, findDisqualification, isTransferCase } from '../engine/rules.js';
import { completedItemCount } from '../engine/state.js';

// "You meet the preliminary criteria" — and not "you don't meet the criteria".
const QUALIFIED_LANGUAGE = /\byou (?:meet|satisfy|have met) (?:all )?(?:the )?(?:preliminary |basic |eligibility )?(?:criteria|requirements)\b/i;
const RATE_FIGURE = /\b\d+(?:\.\d+)?\s*(?:%|percent|per ?cent)|\bper annum\b|\bp\.a\.?(?=\s|$)/i;
const MARKUP = /(?:\*\*|__|`|^#{1,6}\s|^\s*[-*•]\s)/m;
const EMOJI = /\p{Extended_Pictographic}/u;

const check = (id, label, status, detail = '') => ({ id, label, status, detail });

/**
 * @param {{ state: object, reply: string, endCall: {outcome: string}|null, ragProvided: boolean }} input
 */
export function auditTurn({ state, reply, endCall, ragProvided }) {
  const checks = [];
  const ended = Boolean(endCall);
  const declaresQualified = endCall?.outcome === OUTCOMES.QUALIFIED_HANDOFF || QUALIFIED_LANGUAGE.test(reply);

  // Handoff gate
  if (declaresQualified) {
    checks.push(
      canHandoff(state)
        ? check('handoff_gate', 'Handoff gate', 'pass', 'All 7 items answered and passing before handoff.')
        : check('handoff_gate', 'Handoff gate', 'fail', `Qualification stated with ${completedItemCount(state)} of 7 items answered and passing.`),
    );
  } else if (canHandoff(state)) {
    checks.push(check('handoff_gate', 'Handoff gate', 'warn', 'All 7 items are answered and passing — the agent should hand off now.'));
  } else {
    checks.push(check('handoff_gate', 'Handoff gate', 'n/a', `${completedItemCount(state)} of 7 items answered.`));
  }

  // Immediate disqualification
  const failure = findDisqualification(state);
  if (!failure) {
    checks.push(check('disqualification', 'Immediate disqualification', 'n/a', 'No failing answer so far.'));
  } else if (!ended) {
    checks.push(check('disqualification', 'Immediate disqualification', 'fail', `Call continued after a failing answer (${failure.field}).`));
  } else if (endCall.outcome !== OUTCOMES.DISQUALIFIED) {
    checks.push(check('disqualification', 'Immediate disqualification', 'warn', `Call ended, but not as a disqualification (${failure.field} failed).`));
  } else {
    checks.push(check('disqualification', 'Immediate disqualification', 'pass', `Ended on the failing answer (${failure.field}).`));
  }

  // Transfer routing (disqualification takes precedence, as in the brief)
  if (!isTransferCase(state) || failure) {
    checks.push(check('transfer', 'Transfer routing', 'n/a', 'No existing loan or EMI-reduction request.'));
  } else if (!ended) {
    checks.push(check('transfer', 'Transfer routing', 'fail', 'Existing loan / EMI reduction mentioned but the fresh-loan flow continued.'));
  } else if (endCall.outcome !== OUTCOMES.TRANSFER_TO_SPECIALIST) {
    checks.push(check('transfer', 'Transfer routing', 'warn', 'Call ended, but not as a transfer.'));
  } else {
    checks.push(check('transfer', 'Transfer routing', 'pass', 'Routed to the loan-transfer specialist.'));
  }

  // ₹75 lakh limit
  const overCap = state.requested_loan_amount !== UNKNOWN && state.requested_loan_amount > MAX_LOAN_AMOUNT;
  if (state.loan_amount !== UNKNOWN && state.loan_amount > MAX_LOAN_AMOUNT) {
    checks.push(check('loan_cap', '₹75 lakh limit', 'fail', 'A loan amount above ₹75 lakh was accepted.'));
  } else if (overCap && state.loan_amount === UNKNOWN && !ended && !/\b75\b/.test(reply)) {
    checks.push(check('loan_cap', '₹75 lakh limit', 'warn', 'Amount above ₹75 lakh requested; reply does not offer ₹75 lakh.'));
  } else if (overCap) {
    checks.push(check('loan_cap', '₹75 lakh limit', 'pass', 'Amount above the limit handled with the ₹75 lakh option.'));
  } else {
    checks.push(check('loan_cap', '₹75 lakh limit', 'n/a', 'No amount above the limit requested.'));
  }

  // No invented interest rates
  checks.push(
    RATE_FIGURE.test(reply) && !ragProvided
      ? check('no_invented_rates', 'No invented rates', 'fail', 'Reply quotes a rate or percentage that was not provided.')
      : check('no_invented_rates', 'No invented rates', 'pass'),
  );

  // Spoken style
  const questions = (reply.match(/\?/g) ?? []).length;
  const styleIssues = [
    questions > 2 ? `${questions} questions in one turn` : null,
    MARKUP.test(reply) ? 'markdown in a spoken reply' : null,
    EMOJI.test(reply) ? 'emoji in a spoken reply' : null,
  ].filter(Boolean);
  checks.push(
    styleIssues.length
      ? check('voice_style', 'Voice style', 'warn', styleIssues.join('; '))
      : check('voice_style', 'Voice style', 'pass'),
  );

  return checks;
}
