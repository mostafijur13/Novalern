// Shared helpers for the Vercel serverless API (api/model.js, api/speech.js).

const GROQ_BASE = "https://api.groq.com/openai/v1";

export function groqKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set in the Vercel project environment variables.");
  return key;
}

/**
 * Verifies the Firebase ID token sent as "Authorization: Bearer <token>".
 * Uses the Identity Toolkit lookup endpoint, so no service account is needed.
 * Returns the uid, or null when the token is missing/invalid.
 */
export async function verifyUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  if (!apiKey) throw new Error("VITE_FIREBASE_API_KEY is not set on the server.");
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.users?.[0]?.localId || null;
  } catch {
    return null;
  }
}

export async function groqFetch(path, body) {
  return fetch(`${GROQ_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function sendError(res, status, message) {
  res.status(status).json({ error: { message } });
}
