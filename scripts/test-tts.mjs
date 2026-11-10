// Checks Groq text-to-speech with the key in .env and prints the rate-limit headers.
// Run:  node scripts/test-tts.mjs

import { readFileSync, writeFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const key = env.match(/^VITE_GROQ_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error("VITE_GROQ_API_KEY missing in .env");

const t = Date.now();
const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "canopylabs/orpheus-v1-english",
    voice: "hannah",
    input: "Welcome to Novalern! Today we are solving two x plus five equals seventeen, step by step.",
    response_format: "wav",
  }),
});
console.log("status:", res.status, `(${Date.now() - t} ms)`);
for (const [k, v] of res.headers) if (k.startsWith("x-ratelimit") || k === "retry-after") console.log(" ", k, "=", v);
if (!res.ok) {
  console.log(await res.text());
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync("scripts/tts-sample.wav", buf);
console.log("audio bytes:", buf.length, "-> scripts/tts-sample.wav");
