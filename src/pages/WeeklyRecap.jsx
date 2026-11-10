import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ExamList from "../components/ExamList";
import ExamSetup from "../components/ExamSetup";
import Spinner from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { subscribeExams, subscribeLessons, toDate } from "../lib/db";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function WeeklyRecap() {
  const { user } = useAuth();
  const [lessons, setLessons] = useState(null);
  const [exams, setExams] = useState([]);
  const [topic, setTopic] = useState(null);

  useEffect(() => {
    const u1 = subscribeLessons(user.uid, setLessons, 50);
    const u2 = subscribeExams(user.uid, setExams, 30);
    return () => {
      u1();
      u2();
    };
  }, [user.uid]);

  const topics = useMemo(() => {
    if (!lessons) return [];
    const since = Date.now() - WEEK_MS;
    const groups = new Map();
    for (const l of lessons) {
      const d = toDate(l.updatedAt || l.createdAt);
      if (d && d.getTime() < since) continue;
      const key = l.topic || "General";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
    return Array.from(groups, ([name, items]) => ({ name, lessons: items }));
  }, [lessons]);

  if (lessons === null) return <Spinner label="Loading..." />;

  const weeklyExams = exams.filter((e) => e.kind === "weekly");
  const chosen = topics.find((t) => t.name === topic);

  return (
    <div className="stack">
      <section>
        <h1 className="greet" style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.5rem)" }}>Weekly recap<span className="dot">.</span></h1>
        <p className="greet-sub" style={{ marginBottom: 0 }}>Pick a topic from the last seven days and take a recap exam on it.</p>
      </section>

      {topics.length === 0 ? (
        <div className="empty">
          <h3>Nothing studied this week</h3>
          <p className="muted">Lessons from the last 7 days appear here, grouped by topic.</p>
          <Link to="/learn" className="btn primary">Learn with AI</Link>
        </div>
      ) : (
        <div className="grid-2">
          <div className="stack" style={{ gap: 20 }}>
            <section>
              <div className="sec"><h2>This week's topics</h2></div>
              <div className="row" style={{ padding: "12px 0" }}>
                {topics.map((t) => (
                  <button key={t.name} className={"btn sm " + (topic === t.name ? "" : "ghost")} onClick={() => setTopic(t.name)}>
                    {t.name} ({t.lessons.length})
                  </button>
                ))}
              </div>
            </section>
            {chosen ? (
              <ExamSetup key={chosen.name} lessons={chosen.lessons} kind="weekly" topic={chosen.name} initialSelected={chosen.lessons.map((l) => l.id)} />
            ) : (
              <p className="muted">Choose a topic above to build your recap exam.</p>
            )}
          </div>
          <section>
            <div className="sec"><h2>Previous recaps</h2></div>
            <ExamList exams={weeklyExams} emptyText="Your weekly recap exams will be listed here." />
          </section>
        </div>
      )}
    </div>
  );
}
