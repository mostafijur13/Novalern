// All AI calls for Novalern, on Groq (https://console.groq.com).
//
// Three transports, picked automatically:
//   "direct"   - VITE_GROQ_API_KEY is set: the browser calls Groq (local development only).
//   "vercel"   - default in production: POST /api/model (Vercel serverless function; key stays on the server).
//   "firebase" - VITE_AI_BACKEND=firebase: Firebase Cloud Function "model" (see /functions).
//
// Models:
//   TEXT_MODEL   - fast reasoning model for chat, exams and grading (no image input).
//   VISION_MODEL - used automatically when the message contains images (max 3 images).

import Groq from "groq-sdk";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";

export const TEXT_MODEL = "openai/gpt-oss-120b";
export const VISION_MODEL = "qwen/qwen3.8-27b";
export const MAX_IMAGES = 3;

const directKey = import.meta.env.VITE_GROQ_API_KEY;
export const aiMode = directKey
  ? "direct"
  : import.meta.env.VITE_AI_BACKEND === "firebase"
    ? "firebase"
    : "vercel";

/** Calls a Vercel API route with the signed-in user's Firebase ID token. */
export async function apiFetch(path, body) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again.");
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

let directClient = null;
function getDirectClient() {
  if (!directClient) {
    directClient = new Groq({ apiKey: directKey, dangerouslyAllowBrowser: true });
  }
  return directClient;
}

/**
 * Low-level call. `messages` are OpenAI-style chat messages (without the system message).
 * When `schema` is given, the reply is parsed as JSON matching that schema.
 */
async function callModel({ system, messages, schema, schemaName = "result", maxTokens = 4000, effort = "low", vision = false }) {
  const body = {
    model: vision ? VISION_MODEL : TEXT_MODEL,
    messages: [{ role: "system", content: system }, ...messages],
    max_completion_tokens: maxTokens,
    reasoning_effort: effort,
    temperature: 0.6,
  };
  if (schema) {
    body.response_format = { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } };
  }

  let response;
  if (aiMode === "direct") {
    try {
      response = await getDirectClient().chat.completions.create(body);
    } catch (err) {
      throw friendlyError(err);
    }
  } else if (aiMode === "vercel") {
    let res;
    try {
      res = await apiFetch("/api/model", body);
    } catch (err) {
      throw new Error("Could not reach the AI server. Check your connection and try again.");
    }
    if (!res.ok) {
      let message = `AI server error ${res.status}`;
      try {
        const json = await res.json();
        message = json?.error?.message || message;
      } catch {
        /* non-JSON body */
      }
      if (res.status === 401) throw new Error("Please sign in again.");
      if (res.status === 429) throw new Error("The AI is busy (rate limit). Please wait a moment and try again.");
      if (res.status === 404) throw new Error("The /api/model route was not found. Deploy the api/ folder (see README).");
      throw new Error(message);
    }
    response = await res.json();
  } else {
    try {
      const fn = httpsCallable(functions, "model", { timeout: 300_000 });
      const result = await fn(body);
      response = result.data;
    } catch (err) {
      throw new Error(
        err?.code === "functions/internal" || err?.code === "functions/not-found"
          ? "The Firebase Cloud Function is not deployed. Run `firebase deploy --only functions` or use the Vercel API (see README)."
          : err?.message || "AI request failed."
      );
    }
  }

  const choice = response.choices?.[0];
  if (!choice) throw new Error("The AI returned an empty answer. Please try again.");
  if (choice.finish_reason === "length") {
    throw new Error("The answer was too long and got cut off. Try a narrower question.");
  }
  if (choice.finish_reason === "content_filter") {
    throw new Error("The AI declined to answer this request. Try rephrasing it.");
  }

  const text = contentToText(choice.message?.content);
  if (!schema) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The AI returned an unreadable answer. Please try again.");
  }
}

function contentToText(content) {
  if (typeof content === "string") {
    // Some models may inline reasoning in <think> tags; strip it.
    return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }
  if (Array.isArray(content)) {
    return content
      .filter((p) => p?.type === "text")
      .map((p) => p.text)
      .join("")
      .trim();
  }
  return "";
}

function friendlyError(err) {
  const status = err?.status;
  if (status === 401 || status === 403) return new Error("Your Groq API key was rejected. Check VITE_GROQ_API_KEY.");
  if (status === 429) return new Error("The AI is busy (rate limit). Please wait a moment and try again.");
  if (status === 413) return new Error("That request is too large. Try a smaller file or fewer pages.");
  if (err instanceof Groq.APIError) return new Error(`AI error ${status ?? ""}: ${err.message}`);
  if (err?.message?.includes("Failed to fetch") || err?.message?.includes("Connection error")) {
    return new Error("Could not reach Groq from the browser. Check your internet connection, or deploy the Cloud Function (see README).");
  }
  return err;
}

// ---------- content helpers ----------

/**
 * Turn uploaded files (see files.js) into chat content parts.
 * Returns { parts, hasImages }.
 */
export function filesToParts(files) {
  const parts = [];
  let images = 0;
  for (const file of files) {
    if (file.kind === "image") {
      if (images < MAX_IMAGES) {
        parts.push({ type: "image_url", image_url: { url: file.dataUrl } });
        images++;
      }
    } else if (file.kind === "pdf-text") {
      parts.push({ type: "text", text: `Contents of the uploaded PDF "${file.name}":\n\n${file.text}` });
    } else if (file.kind === "pdf-images") {
      const pages = file.pages.slice(0, Math.max(0, MAX_IMAGES - images));
      if (pages.length) {
        parts.push({ type: "text", text: `The next ${pages.length} image(s) are pages of the uploaded PDF "${file.name}".` });
        for (const url of pages) parts.push({ type: "image_url", image_url: { url } });
        images += pages.length;
      }
    }
  }
  return { parts, hasImages: images > 0 };
}

/** Lesson text we hand to the exam generator / grader. */
export function lessonToText(lesson, maxChars = 12000) {
  const lines = [`# ${lesson.title} (topic: ${lesson.topic})`];
  if (lesson.summary) lines.push(`Summary: ${lesson.summary}`);
  for (const m of lesson.messages || []) {
    const who = m.role === "user" ? "Student" : "Tutor";
    const files = (m.attachments || []).map((a) => a.name).join(", ");
    lines.push(`${who}: ${m.text}${files ? ` [attached: ${files}]` : ""}`);
  }
  const text = lines.join("\n");
  return text.length > maxChars ? text.slice(0, maxChars) + "\n...[truncated]" : text;
}

// ---------- 1. Learn with AI (tutor chat) ----------

const TUTOR_SYSTEM = `You are Novalern, a patient and encouraging study tutor for students.
The student uploads class notes, textbook pages, homework problems (as images or PDFs) or types questions.
Your job:
- Explain the material clearly, step by step, at the student's level.
- When given a problem, guide them through the solution and show the final answer.
- When given a lesson or notes, teach the key ideas, give a short example, and finish with 2-3 quick self-check questions.
- Use Markdown: short headings, bullet points, bold key terms. Keep answers focused.
Reply in the language the student writes in.`;

/**
 * @param {Array<{role:'user'|'assistant', text:string}>} history previous turns (text only)
 * @param {string} userText
 * @param {Array} files uploaded files for this turn (from files.js)
 * @returns {Promise<string>} assistant reply (markdown)
 */
export async function chatWithTutor(history, userText, files = []) {
  const prior = history.filter((m) => m.text).map((m) => ({ role: m.role, content: m.text }));
  const { parts, hasImages } = filesToParts(files);

  const content = [
    ...parts,
    {
      type: "text",
      text:
        userText.trim() ||
        (files.length ? "Please explain what is in the attached file(s) so I understand it better." : "Hello"),
    },
  ];

  return callModel({
    system: TUTOR_SYSTEM,
    messages: [...prior, { role: "user", content }],
    maxTokens: 6000,
    effort: "low",
    vision: hasImages,
  });
}

// ---------- 1b. Learn with AI as a narrated video script ----------

const SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short title for this lesson clip, max 8 words" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          narration: {
            type: "string",
            description: "What the narrator says in this scene: 1-2 conversational spoken sentences, at most 200 characters, no markdown.",
          },
          caption: { type: "string", description: "Big on-screen headline, max 8 words" },
          bullets: {
            type: "array",
            description: "0-3 short on-screen lines (max 10 words each). Empty array if none.",
            items: { type: "string" },
          },
          sticker: {
            type: "string",
            description: "1-3 plain English words for a fun sticker that matches the scene, e.g. 'light bulb', 'plant growing', 'thumbs up', 'question mark'.",
          },
        },
        required: ["narration", "caption", "bullets", "sticker"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "scenes"],
  additionalProperties: false,
};

const VIDEO_SYSTEM = `You are Novalern, a friendly study tutor who teaches through short narrated video clips.
The student uploads class notes, textbook pages, homework problems (as images or PDFs) or types questions.
Turn your answer into a sequence of scenes that will be played like a video: each scene is spoken aloud
by a narrator while a headline, a few bullet lines and a sticker appear on screen.

Rules:
- For a new lesson or uploaded material: 10-16 scenes. For a follow-up question or a short problem: 4-8 scenes.
- Scene 1 is a hook that says what we are about to learn. The last two scenes are a quick recap and one self-check question for the student.
- Teach step by step at the student's level. For problems, work through the solution and state the final answer clearly.
- narration: natural spoken language, 1-2 sentences and at most 200 characters, no markdown, no bullet symbols. Spell out formulas in words when spoken (e.g. "x squared plus two x").
- caption: max 8 words. bullets: the key facts or formula of the scene, max 3 lines.
- sticker: a concrete, cheerful visual idea in 1-3 words.
- Reply in the language the student writes in.`;

/**
 * Same inputs as chatWithTutor, but returns a scene script:
 * { title, scenes: [{ narration, caption, bullets, sticker }] }
 */
export async function generateLessonScript(history, userText, files = []) {
  const prior = history.filter((m) => m.text).map((m) => ({ role: m.role, content: m.text }));
  const { parts, hasImages } = filesToParts(files);
  const content = [
    ...parts,
    {
      type: "text",
      text:
        userText.trim() ||
        (files.length ? "Please teach me what is in the attached file(s) so I understand it well." : "Hello"),
    },
  ];

  const script = await callModel({
    system: VIDEO_SYSTEM,
    messages: [...prior, { role: "user", content }],
    schema: SCRIPT_SCHEMA,
    schemaName: "lesson_script",
    maxTokens: 8000,
    effort: "low",
    vision: hasImages,
  });
  script.scenes = (script.scenes || []).filter((s) => s.narration || s.caption).slice(0, 20);
  if (!script.scenes.length) throw new Error("The AI could not build a lesson from that. Try adding more detail.");
  return script;
}

/** Plain-text transcript of a script, used for history, exams and the lesson summary. */
export function scriptToText(script) {
  return [script.title, ...script.scenes.map((s) => s.narration)].filter(Boolean).join("\n");
}

// ---------- 2. Title + summary for a lesson ----------

const LESSON_META_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short lesson title, max 8 words" },
    topic: { type: "string", description: "Subject area, e.g. Algebra, Biology, History" },
    summary: { type: "string", description: "3-5 sentence summary of what was taught" },
  },
  required: ["title", "topic", "summary"],
  additionalProperties: false,
};

export async function summarizeLesson(messages) {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.text}`)
    .join("\n\n")
    .slice(0, 20000);

  return callModel({
    system: "You label study sessions for a learning app. Return only the requested JSON.",
    messages: [{ role: "user", content: `Give a title, topic and summary for this tutoring session:\n\n${transcript}` }],
    schema: LESSON_META_SCHEMA,
    schemaName: "lesson_meta",
    maxTokens: 1500,
    effort: "low",
  });
}

// ---------- 3. Exam generation ----------

const EXAM_SCHEMA = {
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
          options: {
            type: "array",
            description: "Exactly 4 options for MCQ. Empty array for written/voice questions.",
            items: { type: "string" },
          },
          answer: {
            type: "string",
            description: "For MCQ: the exact text of the correct option. Otherwise: a model answer.",
          },
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

export const EXAM_MODES = {
  mcq: { label: "Multiple choice", hint: "Pick the right option" },
  written: { label: "Written", hint: "Type your answers" },
  voice: { label: "Voice", hint: "Hear the question, speak your answer" },
};

/**
 * @param {Array} lessons lesson docs
 * @param {'mcq'|'written'|'voice'} mode
 * @param {number} count
 * @param {'daily'|'weekly'} kind
 */
export async function generateExam(lessons, mode, count, kind) {
  const material = lessons.map(lessonToText).join("\n\n---\n\n");
  const modeInstruction =
    mode === "mcq"
      ? "Every question is multiple choice with exactly 4 options and exactly one correct option. 'answer' must match one option word-for-word."
      : "Every question is a short-answer question the student answers in 1-3 sentences (typed or spoken). 'options' must be an empty array. 'answer' is a concise model answer.";

  const exam = await callModel({
    system: `You write ${kind} review exams for a student based only on what they studied. Questions must be answerable from the material, varied in difficulty, and never trivial copies of the text. Return only the requested JSON.`,
    messages: [
      {
        role: "user",
        content: `Create a ${kind} exam with exactly ${count} questions. ${modeInstruction}\nNumber the ids 1..${count}.\n\nStudy material:\n\n${material}`,
      },
    ],
    schema: EXAM_SCHEMA,
    schemaName: "exam",
    maxTokens: 8000,
    effort: "medium",
  });
  exam.questions = exam.questions.slice(0, count).map((q, i) => ({ ...q, id: i + 1 }));
  return exam;
}

// ---------- 4. Grading written / voice answers ----------

const GRADE_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          score: { type: "number", description: "0, 0.5 or 1" },
          feedback: { type: "string", description: "One or two sentences for the student" },
        },
        required: ["id", "score", "feedback"],
        additionalProperties: false,
      },
    },
    overall_feedback: { type: "string" },
  },
  required: ["results", "overall_feedback"],
  additionalProperties: false,
};

export async function gradeAnswers(questions, answers) {
  const payload = questions.map((q) => ({
    id: q.id,
    question: q.question,
    model_answer: q.answer,
    student_answer: answers[q.id] || "",
  }));

  return callModel({
    system:
      "You grade short student answers fairly. Score 1 for correct, 0.5 for partially correct, 0 for wrong or blank. Spoken answers may contain transcription errors - judge the meaning, not spelling. Return only the requested JSON.",
    messages: [{ role: "user", content: JSON.stringify(payload, null, 2) }],
    schema: GRADE_SCHEMA,
    schemaName: "grades",
    maxTokens: 4000,
    effort: "low",
  });
}
