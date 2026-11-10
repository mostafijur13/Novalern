// Local check of the Vercel API handlers (api/model.js, api/speech.js) without deploying.
// Run:  node scripts/test-api.mjs
// Uses the keys in .env: VITE_GROQ_API_KEY -> GROQ_API_KEY, VITE_FIREBASE_API_KEY.

import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
process.env.GROQ_API_KEY = get("VITE_GROQ_API_KEY");
process.env.VITE_FIREBASE_API_KEY = get("VITE_FIREBASE_API_KEY");

const { default: model } = await import("../api/model.js");
const { default: speech } = await import("../api/speech.js");
const { groqFetch } = await import("../api/_lib.js");

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.setHeader = (k, v) => ((r.headers[k] = v), r);
  r.json = (o) => ((r.body = o), r);
  r.send = (b) => ((r.body = b), r);
  return r;
}

// 1. No token -> 401
let res = mockRes();
await model({ method: "POST", headers: {}, body: { model: "openai/gpt-oss-120b", messages: [{ role: "user", content: "hi" }] } }, res);
console.log("1. model without token ->", res.statusCode, JSON.stringify(res.body));

// 2. Bad token -> 401
res = mockRes();
await speech({ method: "POST", headers: { authorization: "Bearer not-a-real-token" }, body: { input: "hello" } }, res);
console.log("2. speech with bad token ->", res.statusCode, JSON.stringify(res.body));

// 3. Upstream call with the server key works (what the handlers do after auth)
const up = await groqFetch("/chat/completions", {
  model: "openai/gpt-oss-120b",
  messages: [{ role: "user", content: "Say OK." }],
  max_completion_tokens: 20,
  reasoning_effort: "low",
});
const json = await up.json();
console.log("3. groq via server key ->", up.status, JSON.stringify(json.choices?.[0]?.message?.content));

console.log(res.statusCode === 401 && up.status === 200 ? "\nAll good." : "\nSomething is off.");
