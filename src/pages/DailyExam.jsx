import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ExamList from "../components/ExamList";
import ExamSetup from "../components/ExamSetup";
import Spinner from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { subscribeExams, subscribeLessons } from "../lib/db";

export default function DailyExam() {
  const { user } = useAuth();
  const location = useLocation();
  const preselected = location.state?.lessonId ? [location.state.lessonId] : undefined;
  const [lessons, setLessons] = useState(null);
  const [exams, setExams] = useState([]);

  useEffect(() => {
    const u1 = subscribeLessons(user.uid, setLessons, 15);
    const u2 = subscribeExams(user.uid, setExams, 30);
    return () => {
      u1();
      u2();
    };
  }, [user.uid]);

  if (lessons === null) {
    return <Spinner label="Loading..." />;
  }

  const dailyExams = exams.filter((e) => e.kind !== "weekly");

  return (
    <div className="stack">
      <div>
        <h1>Daily exam</h1>
        <p className="muted">A short test on what you learned, so it sticks.</p>
      </div>

      {lessons.length === 0 ? (
        <div className="empty">
          <h3>No lessons yet</h3>
          <p className="muted">
            Daily exams are built from your lessons. Learn something with the AI tutor first.
          </p>
          <Link to="/learn" className="btn primary">Learn with AI</Link>
        </div>
      ) : (
        <div className="grid-2">
          <div>
            <h2 style={{ marginBottom: 10 }}>Start a new exam</h2>
            <ExamSetup lessons={lessons} kind="daily" initialSelected={preselected} />
          </div>
          <section className="card" style={{ alignSelf: "start" }}>
            <h2>Previous exams</h2>
            <ExamList exams={dailyExams} emptyText="Your past daily exams will show up here." />
          </section>
        </div>
      )}
    </div>
  );
}
