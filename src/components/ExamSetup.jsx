import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EXAM_MODES } from "../lib/ai";
import { startExam } from "../lib/examFlow";
import { speechRecognitionSupported } from "../lib/speech";
import { useAuth } from "../context/AuthContext";
import ErrorBanner from "./ErrorBanner";
import Spinner from "./Spinner";

const DIFFICULTIES = [
  { key: "easy", label: "Easy", hint: "Key facts and definitions" },
  { key: "medium", label: "Medium", hint: "Understanding and examples" },
  { key: "hard", label: "Hard", hint: "Apply it to new problems" },
];

/**
 * Pick lessons + exam mode + difficulty + length, then generate and open the exam.
 * Used by Daily Exam (choose from last lessons) and Weekly Recap (lessons of a topic).
 */
export default function ExamSetup({ lessons, kind, topic, initialSelected }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(() => new Set(initialSelected || lessons.slice(0, 1).map((l) => l.id)));
  const [mode, setMode] = useState("mcq");
  const [difficulty, setDifficulty] = useState("medium");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function start() {
    const chosen = lessons.filter((l) => selected.has(l.id));
    if (!chosen.length) {
      setError("Pick at least one lesson.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = await startExam({ uid: user.uid, lessons: chosen, mode, count, kind, topic, difficulty });
      navigate(`/exam/${id}`);
    } catch (err) {
      setError(err.message || "Could not create the exam.");
      setBusy(false);
    }
  }

  if (busy) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <Spinner label={`Writing your ${kind} exam...`} />
        <p className="muted small" style={{ marginTop: 12 }}>This takes a few seconds.</p>
      </div>
    );
  }

  const estMinutes = Math.max(2, Math.round(count * (mode === "mcq" ? 0.5 : 1.2)));

  return (
    <div className="card">
      <ErrorBanner message={error} onClose={() => setError("")} />

      <div className="step-title"><span className="step-num">1</span><h3>Which lessons?</h3></div>
      <ul className="check-list" style={{ marginBottom: 18 }}>
        {lessons.map((l) => (
          <li key={l.id}>
            <label className={"check-item" + (selected.has(l.id) ? " selected" : "")}>
              <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
              <div className="lesson-item-main" style={{ flex: 1 }}>
                <strong>{l.title}</strong>
                <span className="muted small">{l.topic}</span>
              </div>
            </label>
          </li>
        ))}
      </ul>

      <div className="step-title"><span className="step-num">2</span><h3>How do you want to answer?</h3></div>
      <div className="mode-grid" style={{ marginBottom: 18 }}>
        {Object.entries(EXAM_MODES).map(([key, m]) => {
          const disabled = key === "voice" && !speechRecognitionSupported;
          return (
            <button
              key={key}
              type="button"
              className={"mode-card" + (mode === key ? " selected" : "")}
              onClick={() => setMode(key)}
              disabled={disabled}
              title={disabled ? "Voice needs Chrome or Edge" : ""}
            >
              <strong>{m.label}</strong>
              <span className="muted small">{disabled ? "Not supported in this browser" : m.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="step-title"><span className="step-num">3</span><h3>How hard?</h3></div>
      <div className="mode-grid" style={{ marginBottom: 18 }}>
        {DIFFICULTIES.map((d) => (
          <button key={d.key} type="button" className={"mode-card" + (difficulty === d.key ? " selected" : "")} onClick={() => setDifficulty(d.key)}>
            <strong>{d.label}</strong>
            <span className="muted small">{d.hint}</span>
          </button>
        ))}
      </div>

      <div className="step-title"><span className="step-num">4</span><h3>How many questions?</h3></div>
      <div className="row" style={{ marginBottom: 22 }}>
        {[5, 10, 15].map((n) => (
          <button key={n} type="button" className={"btn sm " + (count === n ? "" : "ghost")} onClick={() => setCount(n)}>
            {n}
          </button>
        ))}
        <span className="muted small">about {estMinutes} min</span>
      </div>

      <button className="btn primary lg" onClick={start} disabled={!selected.size}>
        Start exam →
      </button>
    </div>
  );
}
