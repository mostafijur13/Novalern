// POST /api/speech - proxies text-to-speech to Groq for signed-in users.
// Returns audio/wav on success, or a JSON error with the upstream status.

import { groqFetch, sendError, verifyUser } from "./_lib.js";

const TTS_MODEL = "canopylabs/orpheus-v1-english";
const VOICES = new Set(["hannah", "autumn", "diana", "austin", "daniel", "troy"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Use POST.");

  const uid = await verifyUser(req);
  if (!uid) return sendError(res, 401, "Sign in to use narration.");

  const input = String(req.body?.input || "").slice(0, 200);
  const voice = VOICES.has(req.body?.voice) ? req.body.voice : "hannah";
  if (!input.trim()) return sendError(res, 400, "input is required.");

  try {
    const upstream = await groqFetch("/audio/speech", { model: TTS_MODEL, voice, input, response_format: "wav" });
    if (!upstream.ok) {
      const retry = upstream.headers.get("retry-after");
      if (retry) res.setHeader("Retry-After", retry);
      res.status(upstream.status).setHeader("Content-Type", "application/json");
      return res.send(await upstream.text());
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    res.status(200).setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(audio);
  } catch (err) {
    sendError(res, 500, err.message || "Speech request failed.");
  }
}
