import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { aiMode } from "../lib/ai";
import { subscribeExams, subscribeLessons } from "../lib/db";
import { speechRecognitionSupported } from "../lib/speech";
import { VOICES, getVoice, naturalVoiceEnabled, setNaturalVoiceEnabled, setVoice, ttsStatus } from "../lib/tts";

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [exams, setExams] = useState([]);
  const [naturalVoice, setNaturalVoice] = useState(naturalVoiceEnabled());
  const [voice, setVoiceState] = useState(getVoice());
  const voiceIssue = ttsStatus();

  useEffect(() => {
    const u1 = subscribeLessons(user.uid, setLessons, 200);
    const u2 = subscribeExams(user.uid, setExams, 200);
    return () => {
      u1();
      u2();
    };
  }, [user.uid]);

  const completed = exams.filter((e) => e.status === "completed" && e.total);
  const avg = completed.length
    ? Math.round((completed.reduce((s, e) => s + e.score / e.total, 0) / completed.length) * 100)
    : null;
  const best = completed.length
    ? Math.round(Math.max(...completed.map((e) => e.score / e.total)) * 100)
    : null;
  const initial = (user.displayName || user.email || "?").trim()[0].toUpperCase();

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Profile</h1>
      <section className="card row" style={{ gap: 16 }}>
        <div className="avatar-btn" style={{ width: 64, height: 64, fontSize: "1.5rem" }}>
          {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>{initial}</span>}
        </div>
        <div>
          <h2 style={{ marginBottom: 2 }}>{user.displayName || "Learner"}</h2>
          <span className="muted">{user.email}</span>
        </div>
      </section>

      <div className="stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat"><strong>{lessons.length}</strong><span>lessons</span></div>
        <div className="stat"><strong>{completed.length}</strong><span>exams</span></div>
        <div className="stat"><strong>{avg === null ? "–" : `${avg}%`}</strong><span>average</span></div>
        <div className="stat"><strong>{best === null ? "–" : `${best}%`}</strong><span>best score</span></div>
      </div>

      <section className="card">
        <h2>Narration voice</h2>
        <label className="row" style={{ cursor: "pointer", marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={naturalVoice}
            onChange={(e) => {
              setNaturalVoice(e.target.checked);
              setNaturalVoiceEnabled(e.target.checked);
            }}
          />
          <span>Natural voice (Groq text-to-speech). Falls back to the browser voice when unavailable.</span>
        </label>
        <div className="row">
          <span className="muted small">Voice:</span>
          {VOICES.map((v) => (
            <button
              key={v}
              className={"btn sm " + (voice === v ? "" : "ghost")}
              disabled={!naturalVoice}
              onClick={() => {
                setVoiceState(v);
                setVoice(v);
              }}
            >
              {v}
            </button>
          ))}
        </div>
        {voiceIssue && <p className="muted small" style={{ marginTop: 10 }}>{voiceIssue}</p>}
      </section>

      <section className="card">
        <h2>Device</h2>
        <p className="muted small">
          Voice input: {speechRecognitionSupported ? "supported" : "not supported in this browser (use Chrome or Edge)"}
          <br />
          AI connection: {aiMode === "direct" ? "direct (development key)" : "Cloud Function"}
        </p>
      </section>

      <button className="btn danger" onClick={onLogout}>Sign out</button>
    </div>
  );
}
