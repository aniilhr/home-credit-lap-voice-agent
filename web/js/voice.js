/**
 * Browser voice layer: speech-to-text for the customer (Web Speech API)
 * and text-to-speech for the agent. Both are feature-detected; the console
 * works without them.
 */

const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

export const voiceSupport = {
  recognition: Boolean(Recognition),
  synthesis: 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function',
};

export const speechLang = (language) => (String(language).toLowerCase() === 'hindi' ? 'hi-IN' : 'en-IN');

/**
 * Listens for one utterance.
 * @param {{ lang: string, onInterim?: (text: string) => void, onFinal: (text: string) => void, onEnd?: () => void, onError?: (message: string) => void }} handlers
 * @returns {{ stop: () => void }}
 */
export function listenOnce({ lang, onInterim, onFinal, onEnd, onError }) {
  if (!Recognition) throw new Error('Speech recognition is not supported in this browser');
  const recognizer = new Recognition();
  recognizer.lang = lang;
  recognizer.interimResults = true;
  recognizer.continuous = false;
  recognizer.maxAlternatives = 1;

  recognizer.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) onFinal(result[0].transcript.trim());
      else interim += result[0].transcript;
    }
    if (interim) onInterim?.(interim);
  };
  recognizer.onerror = (event) => {
    const messages = {
      'not-allowed': 'Microphone access was blocked. Allow it in the browser to speak.',
      'no-speech': 'No speech detected. Try again.',
      network: 'Speech recognition needs a network connection in this browser.',
    };
    if (event.error !== 'aborted') onError?.(messages[event.error] ?? `Speech recognition error: ${event.error}`);
  };
  recognizer.onend = () => onEnd?.();
  recognizer.start();
  return { stop: () => recognizer.abort() };
}

const FEMALE_HINT = /female|woman|zira|heera|veena|kalpana|swara|neerja|aditi|raveena|samantha|victoria|karen|moira|tessa|lekha/i;
const MALE_HINT = /\bmale\b|\bman\b|ravi|hemant|madhur|prabhat|david|daniel|alex|rishi|fred|arthur/i;

function pickVoice(lang, gender) {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.split('-')[0];
  const matching = voices.filter((v) => v.lang === lang).concat(voices.filter((v) => v.lang.startsWith(base) && v.lang !== lang));
  if (!matching.length) return null;
  const hint = gender === 'male' ? MALE_HINT : FEMALE_HINT;
  const avoid = gender === 'male' ? FEMALE_HINT : MALE_HINT;
  return matching.find((v) => hint.test(v.name)) ?? matching.find((v) => !avoid.test(v.name)) ?? matching[0];
}

/** Speaks text; resolves when finished or cancelled. */
export function speak(text, { lang, gender }) {
  if (!voiceSupport.synthesis || !text) return Promise.resolve();
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text.replace(/₹\s?([\d.,]+(?:\s*(?:lakh|crore))?)/gi, '$1 rupees'));
    utterance.lang = lang;
    const voice = pickVoice(lang, gender);
    if (voice) utterance.voice = voice;
    utterance.rate = 1.02;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (voiceSupport.synthesis) window.speechSynthesis.cancel();
}

// Some browsers load voices asynchronously.
if (voiceSupport.synthesis) window.speechSynthesis.getVoices();
