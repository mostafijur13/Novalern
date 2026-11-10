import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import LessonList from "../components/LessonList";
import { useAuth } from "../context/AuthContext";
import { subscribeLessons } from "../lib/db";

export default function Home() {
  const { user } = useAuth();
  const [lessons, setLessons] = useState([]);

  useEffect(() => subscribeLessons(user.uid, setLessons, 50), [user.uid]);

  const firstName = (user.displayName || user.email || "there").split(" ")[0].split("@")[0];

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <h1>Hi {firstName}, ready to learn?</h1>
          <p>Upload your class notes or a problem you are stuck on. Novalern turns it into a short video lesson, then quizzes you so it sticks.</p>
        </div>
        <Link to="/learn" className="btn primary lg">
          Learn with AI →
        </Link>
      </section>

      <section className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2>History</h2>
          <Link to="/learn" className="btn sm ghost">+ New lesson</Link>
        </div>
        <LessonList lessons={lessons} emptyText="Nothing here yet. Start your first lesson with the AI tutor." />
      </section>
    </div>
  );
}
