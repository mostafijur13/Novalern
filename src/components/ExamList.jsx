import { Link } from "react-router-dom";
import { formatDate } from "../lib/db";
import { EXAM_MODES } from "../lib/ai";

/** Open list of exams with date and score, no boxes. */
export default function ExamList({ exams, emptyText = "No exams yet." }) {
  if (!exams.length) return <p className="muted" style={{ padding: "14px 0" }}>{emptyText}</p>;
  return (
    <ul className="exam-list">
      {exams.map((e) => {
        const done = e.status === "completed";
        const pct = done && e.total ? Math.round((e.score / e.total) * 100) : null;
        return (
          <li key={e.id}>
            <Link to={`/exam/${e.id}`} className="exam-item">
              <div className="lesson-item-main">
                <strong>{e.title || "Exam"}</strong>
                <span className="muted small">
                  {formatDate(e.createdAt)} · {EXAM_MODES[e.mode]?.label || e.mode}
                  {e.difficulty ? ` · ${e.difficulty}` : ""}
                  {e.kind === "weekly" ? " · weekly" : ""}
                </span>
              </div>
              {done ? (
                <span className={"score-pill " + (pct >= 70 ? "good" : pct >= 40 ? "mid" : "low")}>{pct}%</span>
              ) : (
                <span className="muted small">In progress</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
