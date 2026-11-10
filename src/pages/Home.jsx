import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ExamList from "../components/ExamList";
import LessonList from "../components/LessonList";
import { useAuth } from "../context/AuthContext";
import { subscribeExams, subscribeLessons } from "../lib/db";

export default function Home() {
  const { user } = useAuth();
  const [lessons, setLessons] = useState([]);
  const [exams, setExams] = useState([]);

  useEffect(() => {
    const u1 = subscribeLessons(user.uid, setLessons, 20);
    const u2 = subscribeExams(user.uid, setExams, 20);
    return () => {
      u1();
      u2();
    };
  }, [user.uid]);

  const completed = exams.filter((e) => e.status === "completed" && e.total);
  const avg = completed.length
    ? Math.round((completed.reduce((s, e) => s + e.score / e.total, 0) / completed.length) * 100)
    : null;
  const firstName = (user.displayName || user.email || "there").split(" ")[0].split("@")[0];

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <h1>Hi {firstName}, ready to learn?</h1>
          <p>Upload your class notes or a problem you are stuck on. Novalern explains it, then quizzes you every day so it sticks.</p>
        </div>
        <Link to="/learn" className="btn primary lg">
          Learn with AI →
        </Link>
      </section>

      <div className="stats">
        <div className="stat"><strong>{lessons.length}</strong><span>lessons learned</span></div>
        <div className="stat"><strong>{completed.length}</strong><span>exams completed</span></div>
        <div className="stat"><strong>{avg === null ? "–" : `${avg}%`}</strong><span>average score</span></div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <h2>History</h2>
            <Link to="/learn" className="btn sm ghost">+ New lesson</Link>
          </div>
          <LessonList
            lessons={lessons}
            max={8}
            emptyText="Nothing here yet. Start your first lesson with the AI tutor."
          />
        </section>

        <div className="stack">
          <section className="card">
            <h2>Daily exam</h2>
            <p className="muted">
              {lessons.length
                ? "Test yourself on what you learned recently."
                : "Learn a lesson first, then a daily exam unlocks."}
            </p>
            <Link to="/daily" className={"btn " + (lessons.length ? "" : "ghost")}>Go to daily exam</Link>
          </section>
          <section className="card">
            <h2>Recent exams</h2>
            <ExamList exams={exams.slice(0, 4)} emptyText="No exams taken yet." />
          </section>
        </div>
      </div>
    </div>
  );
}
