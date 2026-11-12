// Cloud Function that proxies Groq requests for signed-in Novalern users.
// The API key lives in a Firebase secret, so it never reaches the browser.
//
// Setup:
//   firebase functions:secrets:set GROQ_API_KEY
//   firebase deploy --only functions

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const Groq = require("groq-sdk");

const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

const ALLOWED_MODELS = new Set(["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]);
const MAX_OUTPUT_TOKENS = 16000;
const TTS_MODEL = "canopylabs/orpheus-v1-english";
const TTS_VOICES = new Set(["hannah", "autumn", "diana", "austin", "daniel", "troy"]);

// Text-to-speech proxy. Returns { audio: <base64 wav> } or { error, status, retryAfter }
// so the client can fall back to the browser voice without throwing.
exports.speech = onCall({ secrets: [GROQ_API_KEY], timeoutSeconds: 60, memory: "256MiB" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to use narration.");
  }
  const input = String(request.data?.input || "").slice(0, 200);
  const voice = TTS_VOICES.has(request.data?.voice) ? request.data.voice : "hannah";
  if (!input.trim()) throw new HttpsError("invalid-argument", "input is required.");

  const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY.value()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: TTS_MODEL, voice, input, response_format: "wav" }),
  });
  if (!res.ok) {
    return { error: await res.text(), status: res.status, retryAfter: res.headers.get("retry-after") };
  }
  return { audio: Buffer.from(await res.arrayBuffer()).toString("base64") };
});

exports.model = onCall(
  { secrets: [GROQ_API_KEY], timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to use the AI tutor.");
    }

    const params = request.data || {};
    if (!ALLOWED_MODELS.has(params.model)) {
      throw new HttpsError("invalid-argument", "Unsupported model.");
    }
    if (!Array.isArray(params.messages) || params.messages.length === 0) {
      throw new HttpsError("invalid-argument", "messages is required.");
    }

    const client = new Groq({ apiKey: GROQ_API_KEY.value() });

    try {
      return await client.chat.completions.create({
        model: params.model,
        messages: params.messages,
        max_completion_tokens: Math.min(params.max_completion_tokens || 4000, MAX_OUTPUT_TOKENS),
        reasoning_effort: params.reasoning_effort || "low",
        temperature: params.temperature ?? 0.6,
        ...(params.response_format ? { response_format: params.response_format } : {}),
      });
    } catch (err) {
      if (err instanceof Groq.APIError) {
        if (err.status === 429) {
          throw new HttpsError("resource-exhausted", "The AI is busy (rate limit). Try again in a moment.");
        }
        if (err.status === 401 || err.status === 403) {
          throw new HttpsError("failed-precondition", "The Groq API key is not configured on the server.");
        }
        throw new HttpsError("internal", `AI error ${err.status}: ${err.message}`);
      }
      throw err;
    }
  }
);
