// Finds a real picture or diagram for a lesson scene.
//
// Providers, in order:
//   1. Google Custom Search (image search) when VITE_GOOGLE_CSE_KEY + VITE_GOOGLE_CSE_CX are set.
//   2. Wikimedia Commons file search (no key, CORS enabled) - precise for diagrams and photos.
//   3. Wikipedia page images (no key) - lead image of the matching article.
//
// Each result is { candidates: [url, ...], credit } so the player can fall back if a URL
// fails to load (hotlink protection on some sites).

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_CSE_KEY;
const GOOGLE_CX = import.meta.env.VITE_GOOGLE_CSE_CX;
export const googleImagesEnabled = Boolean(GOOGLE_KEY && GOOGLE_CX);

const cache = new Map();

export function findImage(query) {
  const q = (query || "").replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim();
  if (!q) return Promise.resolve(null);
  if (cache.has(q)) return cache.get(q);
  const job = (async () => {
    // Commons file search matches the query words against the picture itself (good for diagrams);
    // Wikipedia returns the lead image of the best-matching article (good for things and places).
    const found = (googleImagesEnabled && (await googleImage(q))) || (await commonsImage(q)) || (await wikipediaImage(q));
    return found || null;
  })().catch((err) => {
    console.warn("Image lookup failed", err);
    return null;
  });
  cache.set(q, job);
  return job;
}

async function googleImage(q) {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.search = new URLSearchParams({
    key: GOOGLE_KEY,
    cx: GOOGLE_CX,
    q,
    searchType: "image",
    num: "5",
    safe: "active",
    imgSize: "large",
  });
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Google image search ${res.status}; falling back to Wikipedia.`);
    return null;
  }
  const json = await res.json();
  const items = json.items || [];
  if (!items.length) return null;
  const candidates = items.flatMap((it) => [it.link, it.image?.thumbnailLink].filter(Boolean));
  return { candidates, credit: items[0].displayLink || "Google Images" };
}

async function wikipediaImage(q) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: q,
    gsrlimit: "5",
    prop: "pageimages",
    piprop: "thumbnail|original",
    pithumbsize: "900",
    format: "json",
    origin: "*",
  });
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const pages = Object.values(json.query?.pages || {}).sort((a, b) => a.index - b.index);
  const page = pages.find((p) => p.thumbnail?.source);
  if (!page) return null;
  return {
    candidates: [page.thumbnail.source, page.original?.source].filter(Boolean),
    credit: `Wikipedia: ${page.title}`,
  };
}

async function commonsImage(q) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${q}`,
    gsrnamespace: "6",
    gsrlimit: "5",
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: "900",
    format: "json",
    origin: "*",
  });
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const pages = Object.values(json.query?.pages || {}).sort((a, b) => a.index - b.index);
  const page = pages.find((p) => p.imageinfo?.[0]?.thumburl);
  if (!page) return null;
  return {
    candidates: [page.imageinfo[0].thumburl, page.imageinfo[0].url].filter(Boolean),
    credit: "Wikimedia Commons",
  };
}
