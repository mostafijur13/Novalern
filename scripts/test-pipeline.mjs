// Runs the real lesson pipeline (src/lib/lessonPipeline.js) in Node against live Groq and
// Wikimedia, and prints what each stage produced.
// Run:  node scripts/test-pipeline.mjs "your question"

import { build } from "esbuild";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() || "";
const define = {};
for (const k of ["VITE_GROQ_API_KEY", "VITE_GOOGLE_CSE_KEY", "VITE_GOOGLE_CSE_CX", "VITE_AI_BACKEND"]) {
  define[`import.meta.env.${k}`] = JSON.stringify(get(k));
}

mkdirSync("scripts/.tmp", { recursive: true });
writeFileSync("scripts/.tmp/firebase-stub.js", "export const functions = null; export const auth = { currentUser: null };\n");
writeFileSync("scripts/.tmp/fb-functions-stub.js", "export const httpsCallable = () => { throw new Error('not in test'); };\n");

await build({
  entryPoints: ["src/lib/lessonPipeline.js"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "scripts/.tmp/pipeline.mjs",
  define,
  alias: { "firebase/functions": "./scripts/.tmp/fb-functions-stub.js" },
  plugins: [{
    name: "stub-firebase",
    setup(b) { b.onResolve({ filter: /^\.\/firebase$/ }, () => ({ path: process.cwd() + "/scripts/.tmp/firebase-stub.js" })); },
  }],
  logLevel: "error",
});

// Identify like a browser does. Node's default "node" user agent gets throttled by Wikimedia,
// which would make this test far worse than what a student's browser experiences.
const realFetch = globalThis.fetch;
let wikiCalls = 0;
let wikiThrottled = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (/wikimedia\.org|wikipedia\.org/.test(u)) {
    wikiCalls++;
    opts = { ...opts, headers: { ...(opts.headers || {}), "User-Agent": "Novalern/1.0 (https://novalern-sigma.vercel.app; pipeline test)" } };
    const res = await realFetch(url, opts);
    if (res.status === 429) wikiThrottled++;
    return res;
  }
  return realFetch(url, opts);
};
process.on("exit", () => console.log(`\nWikimedia calls: ${wikiCalls}, throttled (429): ${wikiThrottled}`));

const { generateLessonScript } = await import("./.tmp/pipeline.mjs");
const question = process.argv[2] || "Explain photosynthesis for a grade 9 student";
const t0 = Date.now();
const script = await generateLessonScript([], question, [], (s) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`));
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s. "${script.title}" (${script.topic}, ${script.plan.level})`);
console.log(`Goal: ${script.plan.goal}\n`);
for (const [i, s] of script.scenes.entries()) {
  console.log(`${String(i + 1).padStart(2)}. [${s.template} / ${s.layout} / ${s.transition} / ${s.theme}] ${s.heading}`);
  if (s.lines.length) console.log(`      lines: ${s.lines.join(" | ")}`);
  if (s.highlight) console.log(`      highlight: ${s.highlight}`);
  console.log(`      says: ${s.narration}`);
  if (s.visual.need !== "none") console.log(`      wants ${s.visual.need}: "${s.visual.subject}"  ->  ${s.image ? `${s.image.title} (${s.image.credit})` : "NO PICTURE (rejected or none found)"}`);
  if (s.sticker) console.log(`      sticker: ${s.sticker}`);
}
writeFileSync("scripts/.tmp/last-script.json", JSON.stringify(script, null, 2));
