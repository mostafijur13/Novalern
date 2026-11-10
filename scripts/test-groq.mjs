// Smoke test for the Groq integration using the same request shapes as src/lib/ai.js.
// Run:  node scripts/test-groq.mjs   (reads VITE_GROQ_API_KEY from .env, or GROQ_API_KEY from the environment)

import Groq from "groq-sdk";
import { existsSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

/** Builds a valid solid-red RGB PNG without any image library. */
function makeRedPng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeData = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeData));
    return Buffer.concat([len, typeData, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, Buffer.from([255, 0, 0]))]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let apiKey = process.env.GROQ_API_KEY;
if (!apiKey && existsSync(".env")) {
  apiKey = readFileSync(".env", "utf8").match(/^VITE_GROQ_API_KEY=(.+)$/m)?.[1]?.trim();
}
if (!apiKey) {
  console.error("No key found. Set VITE_GROQ_API_KEY in .env or GROQ_API_KEY in the environment.");
  process.exit(1);
}

const groq = new Groq({ apiKey });

// 1. Plain chat on the text model
let t = Date.now();
const chat = await groq.chat.completions.create({
  model: "openai/gpt-oss-120b",
  messages: [
    { role: "system", content: "You are a tutor. Answer in one short sentence." },
    { role: "user", content: "What is photosynthesis?" },
  ],
  max_completion_tokens: 500,
  reasoning_effort: "low",
  temperature: 0.6,
});
console.log(`1. chat OK (${Date.now() - t} ms) finish=${chat.choices[0].finish_reason}`);
console.log("   ", String(chat.choices[0].message.content).slice(0, 160));

// 2. Structured output (exam shape)
t = Date.now();
const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["id", "question", "options", "answer", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "questions"],
  additionalProperties: false,
};
const exam = await groq.chat.completions.create({
  model: "openai/gpt-oss-120b",
  messages: [
    { role: "system", content: "You write exams. Return only JSON." },
    { role: "user", content: "Create a 2-question multiple choice exam (4 options each) about photosynthesis. ids 1..2." },
  ],
  max_completion_tokens: 2000,
  reasoning_effort: "low",
  response_format: { type: "json_schema", json_schema: { name: "exam", strict: true, schema } },
});
const parsed = JSON.parse(exam.choices[0].message.content);
console.log(`2. structured output OK (${Date.now() - t} ms) title="${parsed.title}" questions=${parsed.questions.length}`);
console.log("   ", parsed.questions[0].question, parsed.questions[0].options);

// 3. Image input on the vision model (a generated 32x32 solid red PNG)
t = Date.now();
const png = makeRedPng(32, 32).toString("base64");
const img = await groq.chat.completions.create({
  model: "qwen/qwen3.8-27b",
  messages: [
    { role: "system", content: "You are a tutor." },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${png}` } },
        { type: "text", text: "What color is this image? Answer with one word." },
      ],
    },
  ],
  max_completion_tokens: 300,
  reasoning_effort: "low",
});
console.log(`3. vision OK (${Date.now() - t} ms) finish=${img.choices[0].finish_reason}`);
console.log("   ", String(img.choices[0].message.content).slice(0, 80));

console.log("\nAll good. The app's AI layer will work with this key.");
