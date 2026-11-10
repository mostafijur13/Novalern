import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import ExamList from "../components/ExamList";
import ExamSetup from "../components/ExamSetup";
import Spinner from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { subscribeExams, subscribeLessons, toDate } from "../lib/db";
import { startExam } from "../lib/examFlow";

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function DailyExam() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const preselected = location.state?.lessonId ? [location.state.lessonId] : undefined;
  const [lessons, setLessons] = useState(null);
  const [exams, setExams] = useState([]);
  const [quickBusy, setQuickBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const u1 = subscribeLessons(user.uid, setLessons, 15);
    const u2 = subscribeExams(user.uid, setExams, 60);
    return () => {
      u1();
      u2();
    };
  }, [user.uid]);

  const dailyExams = useMemo(() => exams.filter((e) => e.kind !== "weekly"), [exams]);

  const { doneToday, streak } = useMemo(() => {
    const days = new Set();
    const today = dayKey(new Date());
    for (const e of exams) {
      if (e.status !== "completed") continue;
      const d = toDate(e.completedAt || e.createdAt);
      if (d) days.add(dayKey(d));
    }
    let count = 0;
    let cursor = new Date();
    if (!days.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY);
    while (days.has(dayKey(cursor))) {
      count++;
      cursor = new Date(cursor.getTime() - DAY);
    }
    return { doneToday: days.has(today), streak: count };
  }, [exams]);

  const completed = dailyExams.filter((e) => e.status === "completed" && e.total);
  const avg = completed.length ? Math.round((completed.reduce((s, e) => s + e.score / e.total, 0) / completed.length) * 100) : null;

  async function quickStart() {
    if (!lessons?.length) return;
    setQuickBusy(true);
    setError("");
    try {
      const id = await startExam({ uid: user.uid, lessons: [lessons[0]], mode: "mcq", count: 5, kind: "daily", difficulty: "medium" });
      navigate(`/exam/${id}`);
    } catch (err) {
      setError(err.message || "Could not create the exam.");
      setQuickBusy(false);
    }
  }

  if (lessons === null) return <Spinner label="Loading..." />;

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="stack">
      <section>
        <h1 className="greet" style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.5rem)" }}>Daily exam<span className="dot">.</span></h1>
        <p className="greet-sub" style={{ marginBottom: 14 }}>
          {dateLabel}.{" "}
          {lessons.length === 0 ? "Learn a lesson first and your daily exam unlocks." : doneToday ? "Done for today. Another round never hurts." : "A few minutes now keeps yesterday's lesson with you."}
        </p>
        <div className="stats">
          <div className="stat"><strong>{streak}</strong><span>day streak</span></div>
          <div className="stat"><strong>{avg === null ? "–" : `${avg}%`}</strong><span>average score</span></div>
          <div className="stat"><strong>{completed.length}</strong><span>exams done</span></div>
        </div>
      </section>

      <ErrorBanner message={error} onClose={() => setError("")} />

      {lessons.length === 0 ? (
        <div className="empty">
          <h3>No lessons yet</h3>
          <p className="muted">Daily exams are built from your lessons. Learn something with the AI tutor first.</p>
          <Link to="/learn" className="btn primary">Learn with AI</Link>
        </div>
      ) : (
        <div className="grid-2">
          <div>
            <div className="sec"><h2>Start</h2></div>
            <div className="quick">
              <div>
                <strong>Quick quiz</strong>
                <div className="muted small">5 multiple-choice questions on {lessons[0].title}</div>
              </div>
              <button className="btn primary" onClick={quickStart} disabled={quickBusy}>
                {quickBusy ? "Writing…" : "Start now"}
              </button>
            </div>
            <ExamSetup lessons={lessons} kind="daily" initialSelected={preselected} />
          </div>

          <section>
            <div className="sec"><h2>Previous exams</h2></div>
            <ExamList exams={dailyExams} emptyText="Your past daily exams will be listed here." />
          </section>
        </div>
      )}
    </div>
  );
}
