/** Client for the console's local API (scripts/serve.js). */

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', retryable = false } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the local server. Is `npm start` running?', { retryable: true });
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response (e.g. the page was opened without the API server).
  }
  if (!response.ok) {
    throw new ApiError(body?.error ?? `Request failed (HTTP ${response.status})`, {
      status: response.status,
      code: body?.code ?? '',
      retryable: body?.retryable ?? response.status >= 500,
    });
  }
  return body;
}

let statusPromise = null;

/** LLM status, fetched once per page load. Resolves to { configured: false } if the API is unreachable. */
export function getLlmStatus() {
  statusPromise ??= request('/api/status')
    .then((body) => body.llm)
    .catch(() => ({ provider: 'gemini', configured: false, model: null, unreachable: true }));
  return statusPromise;
}

/**
 * Runs one live agent turn.
 * @param {{ config: object, transcript: {role: string, text: string}[] }} payload
 */
export function liveTurn(payload, { signal } = {}) {
  return request('/api/llm/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
}
