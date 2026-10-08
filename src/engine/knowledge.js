/**
 * Answers customer questions strictly from `additional_context_from_rag`.
 * Returns null when the context does not contain a relevant sentence, so the
 * caller falls back to "the senior loan expert will share the details"
 * instead of inventing product information.
 */

const STOP_WORDS = new Set([
  'what', 'where', 'when', 'which', 'would', 'could', 'should', 'there', 'their', 'about', 'with',
  'this', 'that', 'have', 'from', 'your', 'yours', 'will', 'does', 'tell', 'know', 'want', 'like',
  'much', 'many', 'some', 'they', 'them', 'then', 'than', 'also', 'just', 'please', 'okay', 'sorry',
  'loan', 'offer',
]);

function keywords(text) {
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
      .map((w) => w.replace(/(?:es|s)$/, '')),
  )];
}

export function splitSentences(context) {
  return String(context ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•\s]+/, '').trim())
    .filter((s) => s.length > 0);
}

/**
 * @param {string} question normalised customer question
 * @param {string} context the RAG context supplied for this call
 * @param {{ topic?: 'interest' }} options
 */
export function answerFromContext(question, context, { topic } = {}) {
  const sentences = splitSentences(context);
  if (!sentences.length) return null;

  if (topic === 'interest') {
    return sentences.find((s) => /\binterest|\brate of interest|\broi\b/i.test(s)) ?? null;
  }

  const wanted = keywords(question);
  if (!wanted.length) return null;

  let best = null;
  for (const sentence of sentences) {
    const have = new Set(keywords(sentence));
    const score = wanted.filter((w) => have.has(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { sentence, score };
  }
  const needed = wanted.length === 1 ? 1 : 2;
  return best && best.score >= needed ? best.sentence : null;
}
