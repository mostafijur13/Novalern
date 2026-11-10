// Random sticker lookup on the Giphy Stickers API, used as visuals for lesson scenes.

const API_KEY = import.meta.env.VITE_GIPHY_API_KEY;
export const stickersEnabled = Boolean(API_KEY);

const cache = new Map(); // keyword -> array of sticker objects
const FALLBACKS = ["lightbulb", "sparkle", "thinking", "books"];

/**
 * Returns { url, title } for a random G-rated sticker matching the keyword,
 * or null when stickers are disabled or nothing was found.
 */
export async function randomSticker(keyword) {
  if (!stickersEnabled) return null;
  const term = (keyword || "").trim().toLowerCase();
  const list = (await search(term)) ?? (await search(FALLBACKS[hash(term) % FALLBACKS.length]));
  if (!list?.length) return null;
  const pick = list[Math.floor(Math.random() * list.length)];
  return pick;
}

async function search(term) {
  if (!term) return null;
  if (cache.has(term)) return cache.get(term);
  try {
    const url = new URL("https://api.giphy.com/v1/stickers/search");
    url.search = new URLSearchParams({ api_key: API_KEY, q: term, limit: "15", rating: "g", lang: "en" });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Giphy ${res.status}`);
    const json = await res.json();
    const list = (json.data || [])
      .map((g) => {
        const img = g.images?.fixed_height || g.images?.downsized || g.images?.original;
        return img?.url ? { url: img.url, title: g.title || term } : null;
      })
      .filter(Boolean);
    cache.set(term, list.length ? list : null);
    return cache.get(term);
  } catch (err) {
    console.warn("Sticker lookup failed", err);
    return null;
  }
}

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
