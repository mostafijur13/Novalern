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

  // Today's status and the day streak (consecutive days with a completed exam).
  const { doneToday, todayBest, streak } = useMemo(() => {
    const days = new Set();
    let best = null;
    const today = dayKey(new Date());
    for (const e of exams) {
      if (e.status !== "completed") continue;
      const d = toDate(e.completedAt || e.createdAt);
      if (!d) continue;
      const k = dayKey(d);
      days.add(k);
      if (k === today && e.total) {
        const pct = Math.round((e.score / e.total) * 100);
        best = best === null ? pct : Math.max(best, pct);
      }
    }
    let count = 0;
    let cursor = new Date();
    if (!days.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY); // streak may still be alive from yesterday
    while (days.has(dayKey(cursor))) {
      count++;
      cursor = new Date(cursor.getTime() - DAY);
    }
    return { doneToday: days.has(today), todayBest: best, streak: count };
  }, [exams]);

  const completed = dailyExams.filter((e) => e.status === "completed" && e.total);
  const avg = completed.length
    ? Math.round((completed.reduce((s, e) => s + e.score / e.total, 0) / completed.length) * 100)
    : null;

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
      <section className="exam-hero">
        <div>
          <span className="eyebrow">{dateLabel}</span>
          <h1>Daily exam</h1>
          <p>
            {lessons.length === 0
              ? "Learn a lesson first and your daily exam unlocks."
              : doneToday
                ? `Done for today${todayBest !== null ? ` with a best of ${todayBest}%` : ""}. Another round never hurts.`
                : "A few minutes now is what makes yesterday's lesson stay with you."}
          </p>
        </div>
        <div className="exam-hero-stats">
          <div className="hero-stat">
            <strong>{streak}</strong>
            <span>day streak {streak > 0 ? "🔥" : ""}</span>
          </div>
          <div className="hero-stat">
            <strong>{avg === null ? "–" : `${avg}%`}</strong>
            <span>average</span>
          </div>
          <div className="hero-stat">
            <strong>{doneToday ? "✓" : "–"}</strong>
            <span>today</span>
          </div>
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
          <div className="stack">
            <section className="card quick-card">
              <div>
                <h3 style={{ marginBottom: 2 }}>Quick quiz</h3>
                <span className="muted small">5 multiple-choice questions on your latest lesson: <strong>{lessons[0].title}</strong></span>
              </div>
              <button className="btn primary" onClick={quickStart} disabled={quickBusy}>
                {quickBusy ? "Writing…" : "Start now →"}
              </button>
            </section>

            <div>
              <h2 style={{ marginBottom: 10 }}>Build your own</h2>
              <ExamSetup lessons={lessons} kind="daily" initialSelected={preselected} />
            </div>
          </div>

          <section className="card" style={{ alignSelf: "start" }}>
            <div className="spread" style={{ marginBottom: 10 }}>
              <h2>Previous exams</h2>
              <span className="chip">{completed.length} done</span>
            </div>
            <ExamList exams={dailyExams} emptyText="Your past daily exams will show up here." />
          </section>
        </div>
      )}
    </div>
  );
}
