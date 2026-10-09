import { existsSync, readFileSync } from 'node:fs';

/**
 * Minimal .env loader (KEY=VALUE per line, # comments, optional quotes).
 * Values already present in the process environment win, so a real
 * environment variable always overrides the file.
 */
export function loadEnvFile(path, target = process.env) {
  if (!existsSync(path)) return {};
  const loaded = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, '');
    if (target[key] === undefined) {
      target[key] = value;
      loaded[key] = value;
    }
  }
  return loaded;
}

function numberFrom(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** Reads the LLM settings from the environment. */
export function llmSettings(env = process.env) {
  const apiKey = (env.GEMINI_API_KEY ?? '').trim();
  return {
    provider: 'gemini',
    apiKey,
    configured: apiKey.length > 0,
    model: (env.GEMINI_MODEL ?? '').trim() || 'gemini-flash-latest',
    baseUrl: (env.GEMINI_BASE_URL ?? '').trim() || 'https://generativelanguage.googleapis.com/v1beta',
    temperature: numberFrom(env.GEMINI_TEMPERATURE, 0.4, { min: 0, max: 2 }),
    timeoutMs: numberFrom(env.GEMINI_TIMEOUT_MS, 30_000, { min: 1_000, max: 120_000 }),
    thinking: thinkingConfig(env.GEMINI_THINKING),
  };
}

/**
 * Optional reasoning control. Newer models take a level ("low", "high"),
 * older 2.5-series models take a token budget (e.g. "0" to switch it off).
 * Unset means the model's default.
 */
function thinkingConfig(value) {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return { thinkingBudget: Number(raw) };
  if (['minimal', 'low', 'medium', 'high'].includes(raw)) return { thinkingLevel: raw };
  return null;
}
