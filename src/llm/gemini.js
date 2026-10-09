/**
 * Thin client for the Gemini API `generateContent` REST endpoint.
 * Uses the global fetch (Node 20+), so there are no dependencies.
 */

export class LlmError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, retryable?: boolean }} details
   */
  constructor(message, { status = 502, code = 'llm_error', retryable = false } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

/** Converts a Gemini HTTP error into an LlmError with a readable message. */
async function errorFromResponse(response) {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message ?? '';
  } catch {
    // Non-JSON error body; the status code is enough.
  }
  const { status } = response;
  if (status === 400) return new LlmError(`Gemini rejected the request: ${detail || 'bad request'}`, { status: 400, code: 'bad_request' });
  if (status === 401 || status === 403) {
    return new LlmError('Gemini rejected the API key. Check GEMINI_API_KEY in .env.', { status: 401, code: 'auth' });
  }
  if (status === 404) {
    return new LlmError(`Gemini model not found. Check GEMINI_MODEL in .env. ${detail}`.trim(), { status: 400, code: 'model_not_found' });
  }
  if (status === 429) return new LlmError('Gemini rate limit or quota reached. Wait a moment and retry.', { status: 429, code: 'rate_limited', retryable: true });
  return new LlmError(`Gemini returned HTTP ${status}. ${detail}`.trim(), { status: 502, code: 'upstream', retryable: status >= 500 });
}

export function createGeminiClient(settings, { fetchImpl = globalThis.fetch, retryDelayMs = 800 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available; Node.js 20+ is required');

  async function request(path, { method = 'GET', body } = {}) {
    if (!settings.configured) {
      throw new LlmError('Gemini is not configured. Add GEMINI_API_KEY to .env and restart the server.', {
        status: 503,
        code: 'not_configured',
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${settings.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new LlmError(`Gemini did not respond within ${settings.timeoutMs} ms.`, { status: 504, code: 'timeout', retryable: true });
      }
      throw new LlmError(`Could not reach Gemini: ${error.message}`, { status: 502, code: 'network', retryable: true });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw await errorFromResponse(response);
    return response.json();
  }

  /**
   * Calls generateContent and normalises the first candidate.
   * @returns {Promise<{ text: string, functionCalls: {name: string, args: object}[], finishReason: string, usage: object|null }>}
   */
  async function generate({ system, contents, tools, generationConfig }) {
    const body = {
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      ...(tools ? { tools } : {}),
      generationConfig: {
        temperature: settings.temperature,
        ...(settings.thinking ? { thinkingConfig: settings.thinking } : {}),
        ...generationConfig,
      },
    };
    const path = `/models/${encodeURIComponent(settings.model)}:generateContent`;
    let data;
    try {
      data = await request(path, { method: 'POST', body });
    } catch (error) {
      // One retry for rate limits, timeouts and server errors.
      if (!(error instanceof LlmError) || !error.retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      data = await request(path, { method: 'POST', body });
    }

    if (data?.promptFeedback?.blockReason) {
      throw new LlmError(`Gemini blocked the request (${data.promptFeedback.blockReason}).`, { status: 422, code: 'blocked' });
    }
    const candidate = data?.candidates?.[0];
    if (!candidate) throw new LlmError('Gemini returned no candidates.', { code: 'empty' });

    const parts = candidate.content?.parts ?? [];
    const text = parts
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('')
      .trim();
    const functionCalls = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args ?? {} }));
    const finishReason = candidate.finishReason ?? 'STOP';

    if (!text && !functionCalls.length) {
      const reason = finishReason === 'STOP' ? 'an empty response' : `finish reason ${finishReason}`;
      throw new LlmError(`Gemini returned ${reason}.`, { code: 'empty' });
    }
    return { text, functionCalls, finishReason, usage: data.usageMetadata ?? null };
  }

  /** Lists models that support generateContent. */
  async function listModels() {
    const data = await request('/models?pageSize=200');
    return (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), displayName: m.displayName ?? m.name }));
  }

  return { generate, listModels, settings: { provider: settings.provider, model: settings.model, configured: settings.configured } };
}
