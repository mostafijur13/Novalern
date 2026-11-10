// Checks the video-lesson pipeline: Groq script generation + Giphy sticker lookup.
// Run:  node scripts/test-lesson.mjs

import Groq from "groq-sdk";
import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const groqKey = get("VITE_GROQ_API_KEY");
const giphyKey = get("VITE_GIPHY_API_KEY");
if (!groqKey) throw new Error("VITE_GROQ_API_KEY missing in .env");

const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          narration: { type: "string" },
          caption: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          sticker: { type: "string" },
        },
        required: ["narration", "caption", "bullets", "sticker"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "scenes"],
  additionalProperties: false,
};

const groq = new Groq({ apiKey: groqKey });
let t = Date.now();
const res = await groq.chat.completions.create({
  model: "openai/gpt-oss-120b",
  messages: [
    {
      role: "system",
      content:
        "You teach through short narrated video clips. Return scenes: narration (1-2 spoken sentences), caption (max 8 words), bullets (0-3 short lines), sticker (1-3 words). For a short problem use 4-8 scenes, ending with a recap and a self-check question.",
    },
    { role: "user", content: "Help me solve: 2x + 5 = 17" },
  ],
  max_completion_tokens: 4000,
  reasoning_effort: "low",
  temperature: 0.6,
  response_format: { type: "json_schema", json_schema: { name: "lesson_script", strict: true, schema } },
});
const script = JSON.parse(res.choices[0].message.content);
console.log(`1. script OK (${Date.now() - t} ms) title="${script.title}" scenes=${script.scenes.length}`);
script.scenes.slice(0, 3).forEach((s, i) => console.log(`   [${i + 1}] ${s.caption} | sticker: ${s.sticker} | ${s.narration.slice(0, 70)}...`));

if (giphyKey) {
  t = Date.now();
  const term = script.scenes[0].sticker;
  const url = `https://api.giphy.com/v1/stickers/search?api_key=${giphyKey}&q=${encodeURIComponent(term)}&limit=5&rating=g`;
  const g = await fetch(url);
  const json = await g.json();
  if (!g.ok) throw new Error(`Giphy ${g.status}: ${JSON.stringify(json.meta)}`);
  console.log(`2. giphy OK (${Date.now() - t} ms) "${term}" -> ${json.data.length} stickers, first: ${json.data[0]?.images?.fixed_height?.url}`);
} else {
  console.log("2. giphy skipped (no VITE_GIPHY_API_KEY)");
}
console.log("\nAll good.");
