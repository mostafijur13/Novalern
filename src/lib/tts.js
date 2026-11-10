// Natural-sounding narration via Groq text-to-speech (Orpheus), with caching and
// graceful degradation: whenever TTS is unavailable (terms not accepted, rate limit,
// network), callers fall back to the browser's built-in voice.

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { aiMode } from "./ai";

export const TTS_MODEL = "canopylabs/orpheus-v1-english";
export const VOICES = ["hannah", "autumn", "diana", "austin", "daniel", "troy"];
const MAX_CHARS = 200; // API limit per request
const PREF_KEY = "novalern.naturalVoice";
const VOICE_KEY = "novalern.voice";

const directKey = import.meta.env.VITE_GROQ_API_KEY;

let disabledReason = null; // "terms" | "key" | null
let cooldownUntil = 0;
const cache = new Map(); // text -> Promise<string[] | null>
let queue = Promise.resolve(); // one request at a time, to respect the rate limit

// ---------- user preferences ----------

export function naturalVoiceEnabled() {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setNaturalVoiceEnabled(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}
export function getVoice() {
  try {
    const v = localStorage.getItem(VOICE_KEY);
    return VOICES.includes(v) ? v : VOICES[0];
  } catch {
    return VOICES[0];
  }
}
export function setVoice(v) {
  try {
    localStorage.setItem(VOICE_KEY, v);
  } catch {
    /* ignore */
  }
  cache.clear();
}

/** Why TTS is currently off, for the Profile page. */
export function ttsStatus() {
  if (disabledReason === "terms") {
    return "Groq needs a one-time terms acceptance for the voice model. Open https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english, accept, then reload.";
  }
  if (disabledReason === "key") return "The Groq key was rejected for text-to-speech.";
  if (Date.now() < cooldownUntil) return "Rate limited; using the browser voice for a moment.";
  return null;
}

// ---------- audio fetching ----------

/**
 * Returns object URLs for WAV chunks of the narration, or null when TTS should
 * not be used right now. Results are cached per text.
 */
export function getNarrationAudio(text) {
  const clean = (text || "").trim();
  if (!clean || !naturalVoiceEnabled() || disabledReason || Date.now() < cooldownUntil) return Promise.resolve(null);
  const key = `${getVoice()}|${clean}`;
  if (cache.has(key)) return cache.get(key);

  const job = queue.then(async () => {
    const urls = [];
    for (const chunk of splitChunks(clean)) {
      const blob = await fetchChunk(chunk);
      if (!blob) {
        urls.forEach((u) => URL.revokeObjectURL(u));
        return null;
      }
      urls.push(URL.createObjectURL(blob));
    }
    return urls;
  });
  queue = job.catch(() => {});
  const stored = job.then((urls) => {
    if (!urls && !disabledReason) cache.delete(key); // transient failure: allow retry later
    return urls;
  });
  cache.set(key, stored);
  return stored;
}

/** Warm the cache for upcoming scenes (sequential, so it never bursts the rate limit). */
export function prefetchNarration(texts) {
  for (const t of texts) getNarrationAudio(t).catch(() => {});
}

async function fetchChunk(input) {
  try {
    if (aiMode === "direct") {
      const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${directKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: TTS_MODEL, voice: getVoice(), input, response_format: "wav" }),
      });
      if (res.ok) return await res.blob();
      await handleHttpError(res.status, await res.text(), res.headers.get("retry-after"));
      return null;
    }
    const fn = httpsCallable(functions, "speech", { timeout: 60_000 });
    const { data } = await fn({ input, voice: getVoice() });
    if (data?.error) {
      await handleHttpError(data.status, data.error, data.retryAfter);
      return null;
    }
    const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: "audio/wav" });
  } catch (err) {
    console.warn("TTS request failed; using browser voice.", err);
    return null;
  }
}

async function handleHttpError(status, bodyText, retryAfter) {
  if (status === 429) {
    const secs = Number(retryAfter) || 20;
    cooldownUntil = Date.now() + secs * 1000;
    console.warn(`TTS rate limited; browser voice for ${secs}s.`);
    return;
  }
  if (status === 400 && /terms/i.test(bodyText || "")) {
    disabledReason = "terms";
    console.warn(ttsStatus());
    return;
  }
  if (status === 401 || status === 403) {
    disabledReason = "key";
    return;
  }
  console.warn(`TTS error ${status}: ${bodyText}`);
}

/** Split text into chunks of at most MAX_CHARS, preferring sentence boundaries. */
export function splitChunks(text) {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (let s of sentences) {
    s = s.trim();
    if (!s) continue;
    if (s.length > MAX_CHARS) {
      push();
      // Hard-split an over-long sentence at word boundaries.
      let piece = "";
      for (const word of s.split(/\s+/)) {
        if ((piece + " " + word).trim().length > MAX_CHARS) {
          chunks.push(piece.trim());
          piece = word;
        } else piece = (piece + " " + word).trim();
      }
      if (piece) chunks.push(piece);
      continue;
    }
    if ((current + " " + s).trim().length > MAX_CHARS) push();
    current = (current + " " + s).trim();
  }
  push();
  return chunks;
}
