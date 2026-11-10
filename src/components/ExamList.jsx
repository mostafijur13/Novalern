import { Link } from "react-router-dom";
import { formatDate } from "../lib/db";
import { EXAM_MODES } from "../lib/ai";

/** "Previous exams" list with date and score. */
export default function ExamList({ exams, emptyText = "No exams yet." }) {
  if (!exams.length) return <p className="muted">{emptyText}</p>;
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
                  {e.kind === "weekly" ? " · weekly" : ""}
                </span>
              </div>
              {done ? (
                <span className={"score-pill " + (pct >= 70 ? "good" : pct >= 40 ? "mid" : "low")}>
                  {pct}%
                </span>
              ) : (
                <span className="chip">In progress</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
