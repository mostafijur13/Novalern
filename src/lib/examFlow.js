// Shared "start an exam" flow used by Daily Exam and Weekly Recap.

import { generateExam, gradeAnswers } from "./ai";
import { createExam, updateExam } from "./db";

/**
 * Generates questions from the given lessons and stores a new exam.
 * @returns {Promise<string>} the new exam id
 */
export async function startExam({ uid, lessons, mode, count, kind, topic, difficulty = "medium" }) {
  const exam = await generateExam(lessons, mode, count, kind, difficulty);
  return createExam(uid, {
    kind,
    mode,
    difficulty,
    topic: topic || lessons.map((l) => l.topic).filter(Boolean)[0] || "General",
    title: exam.title,
    lessonIds: lessons.map((l) => l.id),
    lessonTitles: lessons.map((l) => l.title),
    questions: exam.questions,
  });
}

/**
 * Grades the answers, saves the result, and returns the updated fields.
 */
export async function submitExam({ uid, exam, answers, durationSec = null }) {
  const { questions, mode } = exam;
  let results;
  let overallFeedback = "";

  if (mode === "mcq") {
    results = questions.map((q) => {
      const correct = (answers[q.id] || "") === q.answer;
      return {
        id: q.id,
        score: correct ? 1 : 0,
        feedback: correct ? "Correct." : `Correct answer: ${q.answer}. ${q.explanation}`,
      };
    });
    const score = results.reduce((s, r) => s + r.score, 0);
    overallFeedback =
      score === questions.length
        ? "Perfect score. You have this material down."
        : score >= questions.length / 2
          ? "Good work. Review the explanations for the ones you missed."
          : "Keep going. Revisit the lesson and try the exam again tomorrow.";
  } else {
    const graded = await gradeAnswers(questions, answers);
    const byId = new Map(graded.results.map((r) => [r.id, r]));
    results = questions.map((q) => {
      const r = byId.get(q.id);
      return { id: q.id, score: r?.score ?? 0, feedback: r?.feedback || "" };
    });
    overallFeedback = graded.overall_feedback;
  }

  const score = results.reduce((s, r) => s + r.score, 0);
  const update = {
    status: "completed",
    answers,
    results,
    overallFeedback,
    score,
    total: questions.length,
    durationSec,
    completedAt: new Date(),
  };
  await updateExam(uid, exam.id, update);
  return update;
}
