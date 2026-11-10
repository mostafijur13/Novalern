import { Link } from "react-router-dom";
import { formatDateTime } from "../lib/db";

/** Open list of lessons: no boxes, a hairline between rows. */
export default function LessonList({ lessons, emptyText = "No lessons yet.", max }) {
  const items = max ? lessons.slice(0, max) : lessons;
  if (!items.length) return <p className="muted" style={{ padding: "14px 0" }}>{emptyText}</p>;
  return (
    <ul className="lesson-list">
      {items.map((l) => (
        <li key={l.id}>
          <Link to={`/learn/${l.id}`} className="lesson-item">
            <div className="lesson-item-main">
              <strong>{l.title}</strong>
              <span className="muted small">
                {l.topic || "General"} · {formatDateTime(l.updatedAt || l.createdAt)}
              </span>
            </div>
            <Chevron />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--muted)", flex: "none" }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
