// Runs src/lib/stickers.js and src/lib/images.js in Node (shimming import.meta.env) to check they return visuals.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const env = readFileSync(".env", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() || "";
const shim = (src) => src.replace(/import\.meta\.env\.(\w+)/g, (_, k) => JSON.stringify(get(k)));
mkdirSync("scripts/.tmp", { recursive: true });
writeFileSync("scripts/.tmp/stickers.mjs", shim(readFileSync("src/lib/stickers.js", "utf8")));
writeFileSync("scripts/.tmp/images.mjs", shim(readFileSync("src/lib/images.js", "utf8")));
const { randomSticker, stickersEnabled } = await import("./.tmp/stickers.mjs");
const { findImage, googleImagesEnabled } = await import("./.tmp/images.mjs");
console.log("stickersEnabled:", stickersEnabled, "| googleImagesEnabled:", googleImagesEnabled);
for (const term of ["light bulb", "celebration", "thinking"]) {
  const s = await randomSticker(term);
  console.log(`sticker "${term}":`, s ? s.url.slice(0, 70) + "..." : "NULL");
}
for (const q of ["chloroplast diagram", "Eiffel Tower", "right triangle hypotenuse"]) {
  const img = await findImage(q);
  console.log(`image "${q}":`, img ? `${img.credit} | ${img.candidates[0].slice(0, 70)}...` : "NULL");
}
// Raw Giphy status (rate limit?)
const r = await fetch(`https://api.giphy.com/v1/stickers/search?api_key=${get("VITE_GIPHY_API_KEY")}&q=happy&limit=1&rating=g`);
console.log("giphy raw status:", r.status, JSON.stringify((await r.json()).meta));
