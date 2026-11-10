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
      <section>
        <h1 className="greet">
          Hi, {firstName}<span className="dot">.</span>
        </h1>
        <p className="greet-sub">What are we learning today?</p>
        <Link to="/learn" className="cta">
          <div>
            <strong>Learn with AI</strong>
            <span>Type it, say it, or upload a page. Get a short video lesson back.</span>
          </div>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </section>

      <section>
        <div className="sec">
          <h2>History</h2>
          <Link to="/learn" className="link-btn small">New lesson</Link>
        </div>
        <LessonList lessons={lessons} emptyText="Nothing here yet. Your lessons will be listed here once you start one." />
      </section>
    </div>
  );
}
