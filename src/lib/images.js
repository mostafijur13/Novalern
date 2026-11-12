// Picture search for lesson scenes.
//
// searchCandidates(query) returns real pictures WITH their titles and descriptions, so an
// AI "picture editor" can judge which one actually shows what the scene teaches (see
// lessonPipeline.js). Sources, all free:
//   - Google Custom Search (image search) when VITE_GOOGLE_CSE_KEY + VITE_GOOGLE_CSE_CX are set
//   - Wikimedia Commons file search (no key) - diagrams, photos, illustrations
//   - Wikipedia page images (no key) - the lead picture of the best-matching article
//
// findImage(query) is the old "first hit wins" lookup, kept for lessons saved before the
// pipeline existed.

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_CSE_KEY;
const GOOGLE_CX = import.meta.env.VITE_GOOGLE_CSE_CX;
export const googleImagesEnabled = Boolean(GOOGLE_KEY && GOOGLE_CX);

const cache = new Map();

// Wikimedia rate-limits bursts ("You are making too many requests"), which used to leave whole
// lessons without candidates. All Wikimedia calls go through this small queue: at most 4 at a
// time, and a rate-limited call waits and retries.
const MAX_CONCURRENT = 4;
let active = 0;
const waiting = [];
async function wikiFetch(url, attempt = 0) {
  if (active >= MAX_CONCURRENT) await new Promise((r) => waiting.push(r));
  active++;
  try {
    // Wikimedia asks browser clients to identify themselves with Api-User-Agent; anonymous
    // clients are throttled much harder. (Browsers forbid setting User-Agent itself.)
    const res = await fetch(url, { headers: { "Api-User-Agent": "Novalern/1.0 (https://novalern-sigma.vercel.app; student study app)" } });
    const text = await res.text();
    if (res.status === 429 || text.startsWith("You are making too many requests")) {
      if (attempt >= 3) return null;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return wikiFetch(url, attempt + 1);
    }
    return res.ok ? JSON.parse(text) : null;
  } catch {
    return null;
  } finally {
    active--;
    waiting.shift()?.();
  }
}

// Filler words that never appear in file names and make strict search miss.
const FILLER = /\b(photos?|photographs?|pictures?|images?|illustrations?|close-?up|high quality|historic(al)?|vintage|real|actual|showing|of a|of an|of the)\b/gi;
const clean = (q) =>
  (q || "")
    .replace(/[‐-―]/g, "-")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
const stripHtml = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Candidates: { url, thumb, title, description, source, width, height }.
 * sources picks which providers to ask (default all), to keep request volume down.
 */
export function searchCandidates(query, sources = ["google", "commons", "wikipedia"]) {
  const q = clean(query);
  if (!q) return Promise.resolve([]);
  const key = `c|${sources.join(",")}|${q}`;
  if (cache.has(key)) return cache.get(key);
  const job = Promise.all([
    googleImagesEnabled && sources.includes("google") ? googleCandidates(q).catch(() => []) : [],
    sources.includes("commons") ? commonsCandidates(q).catch(() => []) : [],
    sources.includes("wikipedia") ? wikipediaCandidates(q).catch(() => []) : [],
  ]).then((lists) => lists.flat());
  cache.set(key, job);
  return job;
}

async function googleCandidates(q) {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.search = new URLSearchParams({ key: GOOGLE_KEY, cx: GOOGLE_CX, q, searchType: "image", num: "5", safe: "active", imgSize: "large" });
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.items || []).map((it) => ({
    url: it.link,
    thumb: it.image?.thumbnailLink || it.link,
    title: it.title || "",
    description: it.snippet || "",
    source: it.displayLink || "Google Images",
    width: it.image?.width || 0,
    height: it.image?.height || 0,
  }));
}

async function commonsCandidates(q) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap|drawing ${q}`,
    gsrnamespace: "6",
    gsrlimit: "8",
    // Human-filed categories ("Rain", "Cumulus clouds") describe a picture far better than
    // its file name, and cost nothing to fetch.
    prop: "imageinfo|categories",
    clshow: "!hidden",
    cllimit: "max",
    iiprop: "url|size|extmetadata",
    iiextmetadatafilter: "ImageDescription|ObjectName",
    iiurlwidth: "1000",
    format: "json",
    origin: "*",
  });
  const json = await wikiFetch(url);
  if (!json) return [];
  return Object.values(json.query?.pages || {})
    .sort((a, b) => a.index - b.index)
    .map((p) => {
      const info = p.imageinfo?.[0];
      if (!info?.thumburl) return null;
      const meta = info.extmetadata || {};
      return {
        url: info.thumburl,
        thumb: info.thumburl,
        title: (p.title || "").replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
        description: stripHtml(meta.ImageDescription?.value || meta.ObjectName?.value).slice(0, 160),
        categories: (p.categories || [])
          .map((c) => c.title.replace(/^Category:/, ""))
          .filter((c) => !/^(CC-|GFDL|Files |Media |Pages |Self-published|Uploaded|Taken with|Photographs taken|Images from|PD-)/i.test(c))
          .slice(0, 6),
        source: "Wikimedia Commons",
        width: info.width || 0,
        height: info.height || 0,
      };
    })
    .filter(Boolean);
}

async function wikipediaCandidates(q) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: q,
    gsrlimit: "4",
    prop: "pageimages|description",
    piprop: "thumbnail",
    pithumbsize: "1000",
    format: "json",
    origin: "*",
  });
  const json = await wikiFetch(url);
  if (!json) return [];
  return Object.values(json.query?.pages || {})
    .sort((a, b) => a.index - b.index)
    .filter((p) => p.thumbnail?.source)
    .map((p) => ({
      url: p.thumbnail.source,
      thumb: p.thumbnail.source,
      title: `Lead image of the Wikipedia article "${p.title}"`,
      description: p.description || "",
      source: `Wikipedia: ${p.title}`,
      width: p.thumbnail.width || 0,
      height: p.thumbnail.height || 0,
    }));
}

/**
 * Downloads a picture and returns it as a small JPEG data URL. The vision model cannot fetch
 * Wikimedia files itself (Wikimedia refuses its downloader), so the browser sends the pixels.
 * Wikimedia's file server allows cross-origin reads; other hosts may not, and then this throws.
 */
export async function fetchAsDataUrl(url, maxSide = 512) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  const blob = await res.blob();
  if (typeof document !== "undefined" && typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // transparent diagrams read better on white
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }
  // Outside a browser (test scripts): send the file as is.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
}

/** Legacy: first matching picture, used only for lessons saved before the pipeline. */
export function findImage(query) {
  const q = clean(query);
  if (!q) return Promise.resolve(null);
  const key = `f|${q}`;
  if (cache.has(key)) return cache.get(key);
  const job = searchCandidates(q).then((list) => {
    const first = list[0];
    return first ? { url: first.url, credit: first.source } : null;
  });
  cache.set(key, job);
  return job;
}
