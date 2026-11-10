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

  // Group this week's lessons by topic.
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
      <div>
        <h1>Weekly recap</h1>
        <p className="muted">Select the topic of the week you want a recap exam on.</p>
      </div>

      {topics.length === 0 ? (
        <div className="empty">
          <h3>Nothing studied this week</h3>
          <p className="muted">Lessons from the last 7 days appear here, grouped by topic.</p>
          <Link to="/learn" className="btn primary">Learn with AI</Link>
        </div>
      ) : (
        <div className="grid-2">
          <div className="stack">
            <section className="card">
              <h2>This week's topics</h2>
              <div className="row">
                {topics.map((t) => (
                  <button
                    key={t.name}
                    className={"btn " + (topic === t.name ? "" : "ghost")}
                    onClick={() => setTopic(t.name)}
                  >
                    {t.name} <span className="chip" style={{ marginLeft: 4 }}>{t.lessons.length}</span>
                  </button>
                ))}
              </div>
            </section>

            {chosen ? (
              <ExamSetup
                key={chosen.name}
                lessons={chosen.lessons}
                kind="weekly"
                topic={chosen.name}
                initialSelected={chosen.lessons.map((l) => l.id)}
              />
            ) : (
              <p className="muted">Pick a topic above to build your recap exam.</p>
            )}
          </div>

          <section className="card" style={{ alignSelf: "start" }}>
            <h2>Previous recaps</h2>
            <ExamList exams={weeklyExams} emptyText="Your weekly recap exams will show up here." />
          </section>
        </div>
      )}
    </div>
  );
}
