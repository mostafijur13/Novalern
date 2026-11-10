// POST /api/model - proxies chat completions to Groq for signed-in users.
// The Groq key lives in the GROQ_API_KEY environment variable on Vercel.

import { groqFetch, sendError, verifyUser } from "./_lib.js";

const ALLOWED_MODELS = new Set(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
const MAX_OUTPUT_TOKENS = 16000;

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Use POST.");

  const uid = await verifyUser(req);
  if (!uid) return sendError(res, 401, "Sign in to use the AI tutor.");

  const params = req.body || {};
  if (!ALLOWED_MODELS.has(params.model)) return sendError(res, 400, "Unsupported model.");
  if (!Array.isArray(params.messages) || params.messages.length === 0) {
    return sendError(res, 400, "messages is required.");
  }

  try {
    const upstream = await groqFetch("/chat/completions", {
      model: params.model,
      messages: params.messages,
      max_completion_tokens: Math.min(params.max_completion_tokens || 4000, MAX_OUTPUT_TOKENS),
      reasoning_effort: params.reasoning_effort || "low",
      temperature: params.temperature ?? 0.6,
      ...(params.response_format ? { response_format: params.response_format } : {}),
    });
    const text = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", "application/json");
    const retry = upstream.headers.get("retry-after");
    if (retry) res.setHeader("Retry-After", retry);
    res.send(text);
  } catch (err) {
    sendError(res, 500, err.message || "AI request failed.");
  }
}
