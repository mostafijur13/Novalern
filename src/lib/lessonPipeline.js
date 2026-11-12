// Video-lesson pipeline: question -> teacher plan -> storyboard -> chosen pictures -> direction.
//
//   1. Teacher   (AI)    Expands the student's question/material into a clear lesson plan.
//   2. Director  (AI)    Turns the plan into scenes. Each scene picks a TEMPLATE and writes
//                        narration, on-screen text and a precise visual brief with search queries.
//   3. Pictures  (search + AI)  Fetches real candidates for every scene, then one AI call reads
//                        their titles/descriptions and picks the right one or rejects them all.
//                        A scene with no good picture becomes a text scene, never a random photo.
//   4. Direction (code)  Layout, motion, transitions, colours, stickers and sounds are chosen by
//                        fixed rules per template (see direct()), so text and picture never collide.

import { callModel as callModelOnce, filesToParts } from "./ai";

// Models occasionally return JSON that fails the schema. That is worth one quiet retry
// rather than failing the whole lesson.
async function callModel(args) {
  try {
    return await callModelOnce(args);
  } catch (err) {
    const msg = String(err?.message || err);
    if (/json_validate_failed|Failed to (generate|validate) JSON|unreadable answer/i.test(msg)) {
      console.warn("Malformed JSON from the model; retrying once.");
      return callModelOnce(args);
    }
    throw err;
  }
}
import { fetchAsDataUrl, searchCandidates } from "./images";

export const TEMPLATES = ["title", "concept", "picture", "steps", "definition", "compare", "example", "quiz", "recap"];

// ---------------------------------------------------------------- 1. Teacher

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Lesson title, max 7 words" },
    topic: { type: "string", description: "Subject area, e.g. Biology, Algebra, History" },
    level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
    goal: { type: "string", description: "One sentence: what the student will be able to do after this lesson" },
    explanation: { type: "string", description: "The full, clear teaching explanation in plain language, 180-400 words, step by step" },
    keyIdeas: {
      type: "array",
      description: "3-6 key ideas in teaching order",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short name of the idea, max 5 words" },
          explain: { type: "string", description: "1-2 sentence explanation" },
          visual: { type: "string", description: "The concrete thing a picture of this idea would show (an object, organism, place, labelled diagram), or empty if no picture helps" },
        },
        required: ["name", "explain", "visual"],
        additionalProperties: false,
      },
    },
    example: { type: "string", description: "A worked example or a real-world example, 2-5 sentences. For a problem, the full worked solution with the final answer." },
    mistake: { type: "string", description: "One common mistake or misconception and the correction" },
    check: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" }, description: "Exactly 3 short answer options" },
        answer: { type: "string", description: "The correct option, copied exactly" },
      },
      required: ["question", "options", "answer"],
      additionalProperties: false,
    },
  },
  required: ["title", "topic", "level", "goal", "explanation", "keyIdeas", "example", "mistake", "check"],
  additionalProperties: false,
};

const TEACHER_SYSTEM = `You are an expert teacher preparing a short lesson for one student.
Read the student's request and any attached notes, photos or PDFs, and work out what they actually need to understand.
Infer their level from how they write and what they ask. Teach that level; do not dumb it down or show off.
Be correct and concrete. Prefer real examples and specific facts over vague statements. For a problem, solve it fully.
If the request is a follow-up, build on the earlier conversation instead of repeating it.
Write in the language the student writes in. Return only the requested JSON.`;

async function planLesson(history, userText, files) {
  const prior = history.filter((m) => m.text).map((m) => ({ role: m.role, content: m.text.slice(0, 4000) }));
  const { parts, hasImages } = filesToParts(files);
  const ask = userText.trim() || (files.length ? "Teach me what is in the attached file(s) so I understand it well." : "Teach me something useful.");
  return callModel({
    system: TEACHER_SYSTEM,
    messages: [...prior, { role: "user", content: [...parts, { type: "text", text: ask }] }],
    schema: PLAN_SCHEMA,
    schemaName: "lesson_plan",
    maxTokens: 3500,
    effort: "medium",
    vision: hasImages,
  });
}

// ---------------------------------------------------------------- 2. Director

const SCENE_SCHEMA = {
  type: "object",
  properties: {
    template: { type: "string", enum: TEMPLATES },
    narration: { type: "string", description: "What the narrator says, 1-2 spoken sentences, max 200 characters, no markdown" },
    heading: { type: "string", description: "On-screen headline, max 7 words. Never empty." },
    lines: {
      type: "array",
      items: { type: "string" },
      description: "On-screen lines, max 4, each max 10 words. steps: one step per line. compare: 'left :: right' per line. quiz: exactly 3 options. recap: the takeaways. Others: 0-3 key facts.",
    },
    highlight: { type: "string", description: "definition: the term's one-line meaning. example: the final answer or result. quiz: the correct option copied exactly. Otherwise a key term or formula to show big, or empty." },
    visual: {
      type: "object",
      properties: {
        need: { type: "string", enum: ["photo", "diagram", "none"] },
        subject: { type: "string", description: "Exactly what the picture must show to help this scene, as specific as possible (e.g. 'labelled cross-section of a leaf showing stomata'). Empty if need is none." },
        queries: {
          type: "array",
          items: { type: "string" },
          description: "3 image search queries in English, plain noun phrases of the subject (no words like photo, image, historic). First two: specific, 2-5 words. LAST one: the plain encyclopedia name of the thing, 1-3 words, like a Wikipedia article title (e.g. 'Polio vaccine', 'Chloroplast', 'Mount St. Helens'). Empty if need is none.",
        },
      },
      required: ["need", "subject", "queries"],
      additionalProperties: false,
    },
    sticker: { type: "string", description: "Only for title, quiz and recap scenes: a 1-2 word cheerful reaction (e.g. 'lets go', 'thinking', 'high five'). Empty string for every other scene." },
  },
  required: ["template", "narration", "heading", "lines", "highlight", "visual", "sticker"],
  additionalProperties: false,
};

const STORYBOARD_SCHEMA = {
  type: "object",
  properties: { scenes: { type: "array", items: SCENE_SCHEMA } },
  required: ["scenes"],
  additionalProperties: false,
};

const DIRECTOR_SYSTEM = `You storyboard short narrated explainer videos for students, like a good YouTube teacher.
You receive a lesson plan. Turn it into scenes. Every scene picks ONE template:

- title: the hook. Heading = lesson title. Narration says why this matters. Usually a photo of the subject.
- concept: one key idea. Heading = the idea, lines = 1-3 key facts, with a photo or diagram when one truly helps.
- picture: the picture IS the explanation (a labelled diagram, a specific organism, place, artwork, machine). Use only when a real picture clearly exists for it. Lines = 0-2 short labels.
- steps: a process or a worked solution. One step per line (max 4), in order.
- definition: introduce a term. Heading = the term, highlight = its meaning in one line.
- compare: two things side by side. Each line is 'left :: right'.
- example: a real-world or worked example. Lines = the setup, highlight = the result or answer.
- quiz: a question to the student. Heading = the full question including any numbers it needs. Lines = exactly 3 short options with no letters or numbering. Highlight = the correct option copied exactly.
- recap: the takeaways, 2-4 lines.

Rules:
- New lesson: 8-12 scenes. Follow-up question or a single short problem: 4-7 scenes.
- Order: title, then the key ideas in teaching order (vary templates: never the same template more than twice in a row), the example, the common mistake, then recap and quiz last.
- Narration is what a friendly teacher SAYS; on-screen text is what they WRITE on the board. Never put the narration on screen. Keep screen text short.
- Never number or letter the lines yourself and never use emoji in lines; the video draws numbers and bullets.
- Spell out symbols in narration ("x squared"), but write them as symbols on screen ("x²").
- visual.need = "none" for steps, definition, compare, quiz and recap unless a picture is essential. Use "diagram" for processes and structures, "photo" for real things and places.
- visual.subject and visual.queries must be precise and concrete (the specific object, organism, place, structure or labelled diagram), never abstract words like "learning", "success" or "concept".
- Only ask for a picture that already exists in an encyclopedia or textbook: a real photo, or a standard published diagram (e.g. "herd immunity diagram", "Calvin cycle diagram"). Never ask for invented illustrations (icons, shields over people, characters, metaphors). If no such picture exists, set need to "none"; the scene works as text.
- Do not invent facts that are not in the plan.`;

async function storyboard(plan, isFollowUp) {
  const res = await callModel({
    system: DIRECTOR_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${isFollowUp ? "This is a FOLLOW-UP clip (4-7 scenes)." : "This is a NEW lesson (8-12 scenes)."}\n\nLesson plan:\n${JSON.stringify(plan, null, 1)}`,
      },
    ],
    schema: STORYBOARD_SCHEMA,
    schemaName: "storyboard",
    maxTokens: 5500,
    effort: "low",
  });
  return (res.scenes || [])
    .filter((s) => s.narration || s.heading)
    .slice(0, 14)
    .map(tidyScene);
}

// Leading numbering the templates already draw: "1.", "2)", "1️⃣", "A)", "B:", "-", "•".
const LEAD_MARK = /^\s*(?:\d+\s*[.):](?=\s)|\d️?⃣|[A-Da-d]\s*[).:](?=\s)|[-•*·](?=\s))\s*/u;
const unmark = (t) => (t || "").replace(LEAD_MARK, "").trim();
const same = (a, b) => unmark(a).toLowerCase() === unmark(b).toLowerCase();
function shorten(text, words) {
  const w = text.replace(/[.!?].*$/, "").split(/\s+/).filter(Boolean);
  const out = w.slice(0, words).join(" ") + (w.length > words ? "…" : "");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Fixes the things models get slightly wrong, in code, so templates always render cleanly. */
function tidyScene(s) {
  const template = TEMPLATES.includes(s.template) ? s.template : "concept";
  let heading = (s.heading || "").trim();
  let lines = (s.lines || []).map(unmark).filter(Boolean);
  let highlight = unmark(s.highlight);

  // Every scene needs a heading: borrow the first line, or the picture's subject.
  if (!heading) {
    if (lines.length > 1 && template !== "quiz") heading = lines.shift();
    else heading = shorten(s.visual?.subject || s.narration || "Key idea", 6);
  }

  if (template === "quiz") {
    // Options are the last three lines; anything before them is part of the question.
    if (lines.length > 3) {
      const extra = lines.slice(0, lines.length - 3);
      lines = lines.slice(-3);
      heading = `${heading.replace(/[?:.\s]+$/, "")}: ${extra.join(", ")}?`;
    }
    // The answer must be one of the options, exactly.
    const exact = lines.find((l) => same(l, highlight));
    const loose = lines.find((l) => highlight && (l.toLowerCase().includes(highlight.toLowerCase()) || highlight.toLowerCase().includes(l.toLowerCase())));
    highlight = exact || loose || "";
  }
  if (template === "compare") lines = lines.filter((l) => l.includes("::"));

  return {
    ...s,
    template: template === "compare" && !lines.length ? "concept" : template,
    heading,
    lines: lines.slice(0, 4),
    highlight,
    visual: s.visual || { need: "none", subject: "", queries: [] },
  };
}

// ---------------------------------------------------------------- 3. Picture editor

const PICK_SCHEMA = {
  type: "object",
  properties: {
    ranking: {
      type: "array",
      items: { type: "integer" },
      description: "Indexes of the candidates that clearly show the subject, best first. Empty if none does.",
    },
    focus: { type: "string", enum: ["center", "top", "bottom", "left", "right"], description: "Where the important part of the best picture probably is" },
  },
  required: ["ranking", "focus"],
  additionalProperties: false,
};

const EDITOR_SYSTEM = `You are the picture editor for an educational video. You get what one scene's picture must show and a numbered list of candidate images (title, description, categories, source, size).
Rank the candidates that clearly show that subject, best first. Categories are filed by people and are the most reliable clue to what is actually in the picture. Be strict:
- Leave out candidates that are only loosely related (a genome chart for "chloroplast diagram", a map for an organism, a portrait for a concept, a book cover, a logo, a flag, a stamp, a scanned book page).
- Prefer diagrams labelled in English. A file name ending in a language code like -ru, -es, -hy, -id, -de, -gl usually means labels in that language: rank it last or leave it out.
- "Lead image of the Wikipedia article X" fits only if article X is about this exact subject. An article about a different topic that merely shares a word (Fracking for "cracked rock", Soda geyser for "gas pressure in magma") does not fit.
- An analogy picture (soda bottle, balloon) fits only if the subject explicitly asks for that analogy.
- Prefer clear, large pictures over tiny icons and very wide or very tall strips.
- If none clearly fits, return an empty ranking. A scene without a picture is far better than a wrong one.
Return only the requested JSON.`;

// Scanned documents match text searches but are useless as visuals.
const DOCUMENT_SCAN = /\b(press release|telegram|letter (from|to)|memorandum|memo\b|statement by|remarks by|transcript|newspaper|page \d+|minutes of|report of|certificate|manuscript|typescript)\b/i;
const usable = (c) => {
  const ratio = c.width && c.height ? c.width / c.height : 1;
  return ratio > 0.4 && ratio < 3.2 && (!c.width || c.width >= 300) && !DOCUMENT_SCAN.test(c.title);
};

async function candidatesFor(scene) {
  const qs = scene.visual.queries.filter(Boolean);
  // Commons for the specific queries, Wikipedia (and Google if set) for the most general one.
  const lists = await Promise.all([
    ...qs.slice(0, 2).map((q) => searchCandidates(q, ["commons"])),
    searchCandidates(qs[qs.length - 1], ["google", "wikipedia"]),
  ]);
  const seen = new Set();
  return lists
    .flat()
    .filter((c) => c?.url && !seen.has(c.url) && seen.add(c.url) && usable(c))
    .slice(0, 9);
}

async function choosePictures(scenes, onProgress) {
  const wanted = scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.visual?.need && s.visual.need !== "none" && s.visual.queries?.length);
  if (!wanted.length) return;
  onProgress?.("Finding the right pictures");

  // Each scene: search, then a small AI ranking call. Scenes run in parallel.
  const results = await Promise.all(
    wanted.map(async ({ s }) => {
      const pool = await candidatesFor(s);
      if (!pool.length) return { pool, ranking: [], focus: "center" };
      // Kept compact: every token here counts against a tight per-minute limit.
      const list = pool
        .map((c, j) => `${j}. ${c.title.slice(0, 90)} | ${(c.description || "-").slice(0, 90)}${c.categories?.length ? ` | cat: ${c.categories.slice(0, 4).join(", ")}` : ""} | ${c.width}x${c.height}`)
        .join("\n");
      try {
        const res = await callModel({
          system: EDITOR_SYSTEM,
          messages: [{ role: "user", content: `The picture must show: "${s.visual.subject || s.heading}" (${s.visual.need}).\n\nCandidates:\n${list}` }],
          schema: PICK_SCHEMA,
          schemaName: "pick",
          maxTokens: 700,
          effort: "low",
          fast: true,
        });
        return { pool, ranking: res.ranking || [], focus: res.focus || "center" };
      } catch (err) {
        console.warn("Picture ranking failed for a scene; it will play without a picture.", String(err?.message || err).slice(0, 160));
        return { pool, ranking: [], focus: "center" };
      }
    })
  );

  // Text ranking reads names and categories, which can still mislead for photos. The vision
  // model LOOKS at the top photo pick for the scenes where the picture matters most. Its rate
  // limit is tight (about 4 images a minute), so the budget is 3 images per lesson, and a busy
  // model is skipped at once rather than waited for. Diagrams are trusted on their names.
  const LOOK_BUDGET = 3;
  const priority = (s) => (s.template === "title" ? 0 : s.template === "picture" ? 1 : 2);
  // Photos, plus any full-picture scene (there the picture IS the lesson, diagram or not).
  const toLook = wanted
    .map(({ s }, k) => ({ s, k }))
    .filter(({ s, k }) => (s.visual.need === "photo" || s.template === "picture") && results[k].ranking.length)
    .sort((a, b) => priority(a.s) - priority(b.s))
    .slice(0, LOOK_BUDGET);
  const verdicts = {};
  if (toLook.length) {
    onProgress?.("Checking the pictures");
    await Promise.all(
      toLook.map(async ({ s, k }) => {
        const top = results[k].pool[results[k].ranking[0]];
        if (top) verdicts[k] = await lookAtPicture(s, top);
      })
    );
  }
  const verified = wanted.map((_, k) => {
    const { pool, ranking, focus } = results[k];
    const ranked = ranking.map((j) => pool[j]).filter(Boolean);
    // A picture the vision model rejected is dropped; the next ranked one is unverified, so
    // it is only used for diagrams-like scenes, never as the replacement for a rejected photo.
    if (verdicts[k] === false) return { picks: [], focus };
    return { picks: ranked, focus };
  });

  // Assign in scene order, never reusing a picture: each scene takes its best unused pick.
  const used = new Set();
  wanted.forEach(({ s, i }, k) => {
    const { picks, focus } = verified[k];
    const c = picks.find((x) => x && !used.has(x.url));
    if (!c) return;
    used.add(c.url);
    scenes[i].image = { url: c.url, credit: c.source, title: c.title, focus, kind: s.visual.need, ratio: c.width && c.height ? c.width / c.height : null };
  });
}

/**
 * Shows one picture to the vision model and asks a plain yes/no question (the vision model is
 * unreliable with strict JSON). Returns true, false, or undefined when the check is unavailable.
 */
async function lookAtPicture(scene, candidate) {
  try {
    const pixels = await fetchAsDataUrl(candidate.thumb || candidate.url);
    const answer = await callModel({
      system:
        "You check pictures for an educational video. Decide whether the picture clearly and accurately shows the requested subject, so a student would immediately see what the narration is about. If the subject is absent, tiny, ambiguous, or a different topic, the answer is NO. Reply with exactly one word: YES or NO.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: pixels } },
            { type: "text", text: `Does this picture clearly show: "${scene.visual.subject || scene.heading}"? Reply YES or NO.` },
          ],
        },
      ],
      maxTokens: 400,
      effort: "low",
      vision: true,
      noRetry: true,
    });
    const word = String(answer).trim().toUpperCase().match(/\b(YES|NO)\b/g)?.pop();
    return word === "YES" ? true : word === "NO" ? false : undefined;
  } catch (err) {
    console.warn("Picture check unavailable; trusting the ranking.", err?.message || err);
    return undefined;
  }
}

// ---------------------------------------------------------------- 4. Direction (deterministic)

const TRANSITIONS = ["push", "fade", "wipe", "rise", "zoom"];
// Checked against Giphy: these return on-topic, readable stickers.
const STICKER_SEARCH = { title: "lets go", quiz: "thinking face emoji", recap: "party popper emoji" };
const MOTIONS = ["in", "out", "pan-left", "pan-right"];

/**
 * Decides layout, motion, colour, transition, sticker slot and sound for each scene by rule.
 * Exported so lessons saved earlier can be re-directed when played.
 */
export function direct(scenes) {
  let side = "right";
  let textRun = 0; // consecutive text-only scenes, used to vary their arrangement
  return scenes.map((s, i) => {
    let template = s.template;
    let lines = s.lines || [];
    const hasImage = Boolean(s.image?.url);
    // A picture scene with no good picture becomes a text scene. Its lines were labels for the
    // picture ("magma"), which read as nonsense on their own, so keep only real statements and
    // otherwise put the gist of the narration on screen.
    if (template === "picture" && !hasImage) {
      template = "concept";
      lines = lines.filter((l) => l.split(/\s+/).length >= 3);
      if (!lines.length && s.narration) lines = [shorten(s.narration, 12)];
    }

    let layout = "text";
    if (hasImage) {
      if (template === "picture") layout = "picture";
      else if (template === "title") layout = "hero";
      else {
        layout = `split-${side}`;
        side = side === "right" ? "left" : "right";
      }
    }

    // Text-only scenes in a row rotate arrangement so the video never looks like a slide deck.
    // Only templates with a plain heading + lines can take the column arrangement.
    let variant = "left";
    if (layout === "text" && template !== "quiz") {
      const canColumns = ["concept", "example", "steps"].includes(template) && (s.lines || []).length >= 2;
      variant = ["left", canColumns ? "columns" : "center", "center"][textRun % 3];
      textRun++;
    } else {
      textRun = 0;
    }

    // Colour chapters: intro, body, wrap-up; body alternates two tones.
    const last = scenes.length - 1;
    const theme = i === 0 ? "intro" : i >= last - 1 ? "outro" : i % 2 ? "body-a" : "body-b";

    const sfx = template === "quiz" ? "pop" : template === "recap" ? "chime" : i === 0 ? null : "whoosh";
    // Stickers are decoration only, so they come from fixed searches that reliably return
    // clean, readable emoji-style stickers, not from free-form AI words.
    const sticker = STICKER_SEARCH[template] || "";

    return {
      ...s,
      template,
      lines,
      layout,
      variant,
      theme,
      transition: i === 0 ? "fade" : TRANSITIONS[(i * 2) % TRANSITIONS.length],
      motion: MOTIONS[i % MOTIONS.length],
      sticker,
      sfx,
    };
  });
}

// ---------------------------------------------------------------- entry point

/**
 * @returns {Promise<{ title, topic, plan, scenes }>}
 * onProgress(label) is called as the pipeline moves through its stages.
 */
export async function generateLessonScript(history, userText, files = [], onProgress) {
  const isFollowUp = history.some((m) => m.role === "assistant");

  onProgress?.("Understanding your question");
  const plan = await planLesson(history, userText, files);

  onProgress?.("Storyboarding the video");
  const scenes = await storyboard(plan, isFollowUp);
  if (!scenes.length) throw new Error("The AI could not build a lesson from that. Try adding more detail.");

  await choosePictures(scenes, onProgress);

  onProgress?.("Putting it together");
  return { version: 2, title: plan.title, topic: plan.topic, plan, scenes: direct(scenes) };
}

// Exposed for scripts/test-pipeline.mjs only.
export const __test = { candidatesFor, lookAtPicture };

/** Text used for history, the lesson summary and exam generation: the full teaching plan. */
export function scriptToText(script) {
  const p = script.plan;
  if (!p) return [script.title, ...script.scenes.map((s) => s.narration)].filter(Boolean).join("\n");
  return [
    p.title,
    `Goal: ${p.goal}`,
    p.explanation,
    ...p.keyIdeas.map((k) => `${k.name}: ${k.explain}`),
    `Example: ${p.example}`,
    `Common mistake: ${p.mistake}`,
  ].join("\n");
}

/**
 * Brings a lesson saved before the pipeline (caption/bullets/imageQuery scenes) into the
 * current shape so the same player can show it. Pictures for those are found lazily.
 */
export function normalizeScript(script) {
  if (script.version === 2) return script;
  const scenes = (script.scenes || []).map((s, i, all) => ({
    template: i === 0 ? "title" : i === all.length - 1 ? "recap" : "concept",
    narration: s.narration || "",
    heading: s.caption || "",
    lines: s.bullets || [],
    highlight: "",
    visual: { need: s.imageQuery ? "photo" : "none", subject: s.imageQuery || "", queries: s.imageQuery ? [s.imageQuery] : [] },
    sticker: s.sticker || "",
    legacyQuery: s.imageQuery === undefined ? s.caption : s.imageQuery,
  }));
  return { ...script, version: 2, scenes: direct(scenes), legacy: true };
}
