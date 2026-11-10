// Checks the new scene schema (imageQuery + effect) on Groq and picture lookups on Wikipedia/Commons.
// Run:  node scripts/test-visuals.mjs
import Groq from "groq-sdk";
import { readFileSync } from "node:fs";
const env = readFileSync(".env", "utf8");
const key = env.match(/^VITE_GROQ_API_KEY=(.+)$/m)?.[1]?.trim();

const schema = { type: "object", properties: { title: { type: "string" }, scenes: { type: "array", items: { type: "object", properties: {
  narration: { type: "string" }, caption: { type: "string" }, bullets: { type: "array", items: { type: "string" } },
  sticker: { type: "string" }, imageQuery: { type: "string" }, effect: { type: "string", enum: ["fade", "slide", "zoom", "bounce"] } },
  required: ["narration", "caption", "bullets", "sticker", "imageQuery", "effect"], additionalProperties: false } } },
  required: ["title", "scenes"], additionalProperties: false };

const groq = new Groq({ apiKey: key });
const res = await groq.chat.completions.create({
  model: "openai/gpt-oss-120b",
  messages: [
    { role: "system", content: "Teach via narrated video scenes. imageQuery = precise 2-5 word search for a real photo/diagram of what the scene shows. sticker = mood word. effect rotates fade/slide/zoom/bounce. 5 scenes." },
    { role: "user", content: "Explain photosynthesis" },
  ],
  max_completion_tokens: 3000, reasoning_effort: "low",
  response_format: { type: "json_schema", json_schema: { name: "lesson_script", strict: true, schema } },
});
const script = JSON.parse(res.choices[0].message.content);
console.log("1. script OK:", script.title, "|", script.scenes.map((s) => `${s.effect}:${s.imageQuery}`).join(" | "));

async function wiki(q) {
  const u = new URL("https://en.wikipedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", generator: "search", gsrsearch: q, gsrlimit: "5", prop: "pageimages", piprop: "thumbnail", pithumbsize: "900", format: "json", origin: "*" });
  const j = await (await fetch(u)).json();
  const p = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index).find((p) => p.thumbnail?.source);
  return p ? `${p.title} -> ${p.thumbnail.source.slice(0, 80)}...` : null;
}
async function commons(q) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", generator: "search", gsrsearch: `filetype:bitmap ${q}`, gsrnamespace: "6", gsrlimit: "5", prop: "imageinfo", iiprop: "url", iiurlwidth: "900", format: "json", origin: "*" });
  const j = await (await fetch(u)).json();
  const p = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index).find((p) => p.imageinfo?.[0]?.thumburl);
  return p ? p.imageinfo[0].thumburl.slice(0, 90) + "..." : null;
}
for (const s of script.scenes.filter((s) => s.imageQuery).slice(0, 3)) {
  console.log(`2. "${s.imageQuery}" wikipedia:`, await wiki(s.imageQuery));
  console.log(`   "${s.imageQuery}" commons:`, await commons(s.imageQuery));
}
