// Speech helpers: browser speech recognition + narration.
// Narration prefers Groq TTS (see tts.js) and falls back to the browser's Web Speech voice.

import { getNarrationAudio } from "./tts";

const SpeechRecognitionImpl =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const speechRecognitionSupported = Boolean(SpeechRecognitionImpl);
export const speechSynthesisSupported =
  typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Starts continuous voice-to-text.
 * onText(finalText, interimText) is called as the transcript grows.
 * Returns a stop() function, or null when unsupported.
 */
export function startRecognition({ lang = "en-US", onText, onEnd, onError }) {
  if (!SpeechRecognitionImpl) return null;
  const recognizer = new SpeechRecognitionImpl();
  recognizer.lang = lang;
  recognizer.continuous = true;
  recognizer.interimResults = true;

  let finalText = "";
  recognizer.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += chunk + " ";
      else interim += chunk;
    }
    onText?.(finalText.trim(), interim.trim());
  };
  recognizer.onerror = (event) => onError?.(event.error);
  recognizer.onend = () => onEnd?.(finalText.trim());
  recognizer.start();

  return () => {
    try {
      recognizer.stop();
    } catch {
      /* already stopped */
    }
  };
}

let preferredVoice = null;
function pickVoice(lang) {
  if (!speechSynthesisSupported) return null;
  if (preferredVoice) return preferredVoice;
  const voices = window.speechSynthesis.getVoices();
  const sameLang = voices.filter((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  preferredVoice =
    sameLang.find((v) => /natural|neural|online/i.test(v.name)) ||
    sameLang.find((v) => /google/i.test(v.name)) ||
    sameLang[0] ||
    null;
  return preferredVoice;
}
if (speechSynthesisSupported) {
  window.speechSynthesis.onvoiceschanged = () => {
    preferredVoice = null;
  };
}

export function speak(text, { lang = "en-US" } = {}) {
  speakAsync(text, { lang }).catch(() => {});
}

/**
 * Speaks text and resolves when it finishes (or is cancelled / unsupported).
 */
export function speakAsync(text, { lang = "en-US", rate = 1 } = {}) {
  return new Promise((resolve) => {
    if (!speechSynthesisSupported || !text) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (speechSynthesisSupported) window.speechSynthesis.cancel();
}

// ---------- narration (TTS with browser fallback) ----------

let narrationToken = 0;
let currentAudio = null;

/**
 * Narrates text and resolves when done. Uses natural TTS audio when available,
 * otherwise the browser voice. Returns "tts" | "browser" | "cancelled".
 */
export async function narrate(text, { lang = "en-US" } = {}) {
  const token = ++narrationToken;
  let urls = null;
  try {
    urls = await getNarrationAudio(text);
  } catch {
    urls = null;
  }
  if (token !== narrationToken) return "cancelled";

  if (urls?.length) {
    for (const url of urls) {
      if (token !== narrationToken) return "cancelled";
      await playUrl(url);
    }
    return token === narrationToken ? "tts" : "cancelled";
  }
  await speakAsync(text, { lang });
  return token === narrationToken ? "browser" : "cancelled";
}

function playUrl(url) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve()); // autoplay blocked: just move on
  });
}

export function stopNarration() {
  narrationToken++;
  stopSpeaking();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}
