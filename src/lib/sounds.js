// Sound effects for the lesson player.
//
// Two sources:
//   1. Freesound (https://freesound.org/apiv2) when VITE_FREESOUND_API_KEY is set: short, random
//      Creative-Commons sounds fetched once per category and picked at random each time.
//   2. Built-in synthesized effects (Web Audio API) that need no key and no network.
// Both honour the mute setting stored in localStorage.

const FREESOUND_KEY = import.meta.env.VITE_FREESOUND_API_KEY;
export const freesoundEnabled = Boolean(FREESOUND_KEY);

const MUTE_KEY = "novalern.sfxMuted";
const VOLUME = 0.35;

// What to search on Freesound for each effect, and a fallback synth.
const CATEGORIES = {
  whoosh: { query: "whoosh swoosh transition", maxDuration: 2 },
  pop: { query: "pop bubble cartoon", maxDuration: 1.5 },
  chime: { query: "chime success bell", maxDuration: 3 },
  ding: { query: "ding correct notification", maxDuration: 2 },
  buzz: { query: "wrong buzzer short", maxDuration: 2 },
};

const library = new Map(); // category -> Promise<string[]> preview URLs
let audioCtx = null;

export function sfxMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
export function setSfxMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Plays a named effect: "whoosh" | "pop" | "chime" | "ding" | "buzz". Never throws. */
export async function playSfx(name) {
  if (sfxMuted()) return;
  try {
    if (freesoundEnabled) {
      const urls = await loadCategory(name);
      if (urls?.length) {
        const url = urls[Math.floor(Math.random() * urls.length)];
        const audio = new Audio(url);
        audio.volume = VOLUME;
        await audio.play();
        return;
      }
    }
    synth(name);
  } catch {
    try {
      synth(name);
    } catch {
      /* no audio available */
    }
  }
}

/** Warm the Freesound cache for all categories (called when a lesson starts). */
export function preloadSfx() {
  if (!freesoundEnabled) return;
  Object.keys(CATEGORIES).forEach((c) => loadCategory(c).catch(() => {}));
}

async function loadCategory(name) {
  const cat = CATEGORIES[name];
  if (!cat) return null;
  if (library.has(name)) return library.get(name);
  const job = (async () => {
    const url = new URL("https://freesound.org/apiv2/search/text/");
    url.search = new URLSearchParams({
      query: cat.query,
      filter: `duration:[0.2 TO ${cat.maxDuration}]`,
      fields: "id,previews",
      page_size: "15",
      sort: "rating_desc",
      token: FREESOUND_KEY,
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Freesound ${res.status}`);
    const json = await res.json();
    return (json.results || []).map((r) => r.previews?.["preview-lq-mp3"] || r.previews?.["preview-hq-mp3"]).filter(Boolean);
  })().catch((err) => {
    console.warn("Freesound lookup failed; using built-in sounds.", err);
    library.delete(name);
    return null;
  });
  library.set(name, job);
  return job;
}

// ---------- built-in synthesized effects ----------

function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(ac, { freq, to = freq, type = "sine", start = 0, duration = 0.2, gain = VOLUME }) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), ac.currentTime + start + duration);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.05);
}

function noise(ac, { start = 0, duration = 0.4, from = 400, to = 4000, gain = VOLUME }) {
  const buffer = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, ac.currentTime + start);
  filter.frequency.exponentialRampToValueAtTime(to, ac.currentTime + start + duration);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + duration * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(ac.currentTime + start);
}

function synth(name) {
  const ac = ctx();
  switch (name) {
    case "whoosh":
      noise(ac, { duration: 0.45, from: 300, to: 3500 });
      break;
    case "pop":
      tone(ac, { freq: 600, to: 1200, duration: 0.09, gain: VOLUME * 0.8 });
      break;
    case "chime":
      tone(ac, { freq: 659, duration: 0.25 });
      tone(ac, { freq: 880, start: 0.12, duration: 0.3 });
      tone(ac, { freq: 1318, start: 0.26, duration: 0.45 });
      break;
    case "ding":
      tone(ac, { freq: 988, type: "triangle", duration: 0.35 });
      tone(ac, { freq: 1319, type: "triangle", start: 0.08, duration: 0.4 });
      break;
    case "buzz":
      tone(ac, { freq: 180, to: 120, type: "sawtooth", duration: 0.3, gain: VOLUME * 0.6 });
      break;
    default:
      tone(ac, { freq: 700, duration: 0.1 });
  }
}
