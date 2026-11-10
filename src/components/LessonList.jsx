import { Link } from "react-router-dom";
import { formatDateTime } from "../lib/db";

/** "History" / "Last lessons" list used on Home and exam pages. */
export default function LessonList({ lessons, emptyText = "No lessons yet.", max }) {
  const items = max ? lessons.slice(0, max) : lessons;
  if (!items.length) return <p className="muted">{emptyText}</p>;
  return (
    <ul className="lesson-list">
      {items.map((l) => (
        <li key={l.id}>
          <Link to={`/learn/${l.id}`} className="lesson-item">
            <div className="lesson-item-main">
              <strong>{l.title}</strong>
              <span className="muted small">{formatDateTime(l.updatedAt || l.createdAt)}</span>
            </div>
            <span className="chip">{l.topic || "General"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
