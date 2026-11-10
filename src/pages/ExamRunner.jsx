import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import Spinner from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { EXAM_MODES } from "../lib/ai";
import { formatDate, getExam } from "../lib/db";
import { submitExam } from "../lib/examFlow";
import { speak, startRecognition, stopSpeaking } from "../lib/speech";

export default function ExamRunner() {
  const { user } = useAuth();
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  // Elapsed-time clock while the exam is in progress.
  useEffect(() => {
    if (!exam || exam.status === "completed") return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [exam]);

  useEffect(() => {
    getExam(user.uid, examId).then((doc) => {
      if (!doc) {
        setError("Exam not found.");
        return;
      }
      setExam(doc);
      setAnswers(doc.answers || {});
    });
    return () => stopSpeaking();
  }, [examId, user.uid]);

  if (error && !exam) {
    return (
      <div>
        <ErrorBanner message={error} />
        <Link to="/daily" className="btn ghost">Back to exams</Link>
      </div>
    );
  }
  if (!exam) return <Spinner label="Loading exam..." />;

  const done = exam.status === "completed";
  const answered = exam.questions.filter((q) => (answers[q.id] || "").trim()).length;

  async function onSubmit() {
    const unanswered = exam.questions.length - answered;
    if (unanswered > 0 && !window.confirm(`${unanswered} question(s) are blank. Submit anyway?`)) return;
    setSubmitting(true);
    setError("");
    try {
      const update = await submitExam({ uid: user.uid, exam, answers, durationSec: elapsed });
      setExam({ ...exam, ...update });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message || "Could not grade the exam.");
    } finally {
      setSubmitting(false);
    }
  }

  const resultsById = new Map((exam.results || []).map((r) => [r.id, r]));
  const pct = done && exam.total ? Math.round((exam.score / exam.total) * 100) : null;

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="spread">
        <div>
          <h1>{exam.title}</h1>
          <span className="muted small">
            {exam.kind === "weekly" ? "Weekly recap" : "Daily exam"} · {EXAM_MODES[exam.mode]?.label}
            {exam.difficulty ? ` · ${exam.difficulty}` : ""} · {formatDate(exam.createdAt)} · {exam.lessonTitles?.join(", ")}
          </span>
        </div>
        <Link to={exam.kind === "weekly" ? "/weekly" : "/daily"} className="btn sm ghost">← Back</Link>
      </div>

      <ErrorBanner message={error} onClose={() => setError("")} />

      {done && (
        <section className="card result-hero">
          <div className="big">{pct}%</div>
          <p>
            <strong>{exam.score} / {exam.total}</strong> points
          </p>
          <p className="muted">{exam.overallFeedback}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link to="/learn" className="btn ghost">Learn more</Link>
            <Link to={exam.kind === "weekly" ? "/weekly" : "/daily"} className="btn primary">New exam</Link>
          </div>
        </section>
      )}

      {exam.questions.map((q, idx) => (
        <Question
          key={q.id}
          index={idx}
          question={q}
          mode={exam.mode}
          value={answers[q.id] || ""}
          onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
          done={done}
          result={resultsById.get(q.id)}
        />
      ))}

      {!done && (
        <div className="card spread">
          <span className="muted">
            {answered} of {exam.questions.length} answered ·{" "}
            <span className="exam-timer">{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</span>
          </span>
          <button className="btn primary lg" onClick={onSubmit} disabled={submitting}>
            {submitting ? (exam.mode === "mcq" ? "Checking..." : "Grading with AI...") : "Submit exam"}
          </button>
        </div>
      )}
    </div>
  );
}

function Question({ index, question, mode, value, onChange, done, result }) {
  const grade = result ? (result.score >= 1 ? "good" : result.score > 0 ? "mid" : "low") : null;

  return (
    <div className="question">
      <div className="q-num">Question {index + 1}</div>
      <div className="q-text">{question.question}</div>

      {mode === "mcq" ? (
        <div className="options">
          {question.options.map((opt) => {
            let cls = "option";
            if (done) {
              if (opt === question.answer) cls += " correct";
              else if (opt === value) cls += " wrong";
            } else if (opt === value) cls += " selected";
            return (
              <label key={opt} className={cls}>
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  value={opt}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                  disabled={done}
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <>
          {mode === "voice" && !done && <VoiceControls question={question.question} onTranscript={onChange} />}
          <textarea
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={mode === "voice" ? "Your spoken answer appears here. You can edit it." : "Type your answer..."}
            disabled={done}
          />
        </>
      )}

      {done && (
        <div className={`feedback ${grade}`}>
          <strong>{result?.score >= 1 ? "Correct" : result?.score > 0 ? "Partly correct" : "Not quite"}.</strong>{" "}
          {result?.feedback}
          {mode !== "mcq" && (
            <div style={{ marginTop: 6 }}>
              <em>Model answer:</em> {question.answer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VoiceControls({ question, onTranscript }) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const stopRef = useRef(null);

  useEffect(() => () => stopRef.current?.(), []);

  function toggle() {
    if (recording) {
      stopRef.current?.();
      return;
    }
    stopSpeaking();
    const stop = startRecognition({
      onText: (finalText, interimText) => {
        onTranscript(finalText);
        setInterim(interimText);
      },
      onEnd: () => {
        setRecording(false);
        setInterim("");
        stopRef.current = null;
      },
    });
    if (!stop) return;
    stopRef.current = stop;
    setRecording(true);
  }

  return (
    <div className="voice-row">
      <button type="button" className="btn sm ghost" onClick={() => speak(question)}>🔊 Hear question</button>
      <button type="button" className={"btn sm " + (recording ? "danger" : "")} onClick={toggle}>
        {recording ? "■ Stop" : "🎤 Answer by voice"}
      </button>
      {interim && <span className="interim small">{interim}</span>}
    </div>
  );
}
