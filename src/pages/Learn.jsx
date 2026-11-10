import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useNavigate, useParams } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import LessonPlayer from "../components/LessonPlayer";
import Spinner from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { generateLessonScript, scriptToText, summarizeLesson } from "../lib/ai";
import { createLesson, getLesson, updateLesson } from "../lib/db";
import { ACCEPT_ATTR, formatBytes, readUpload } from "../lib/files";
import { speechRecognitionSupported, startRecognition } from "../lib/speech";

const SUGGESTIONS = [
  "Explain photosynthesis like I'm in grade 8",
  "Help me solve: 2x + 5 = 17",
  "Summarize the causes of World War I",
  "What is Newton's second law, with an example?",
];

const LOADING_STEPS = [
  "Reading your question",
  "Planning the lesson",
  "Writing the scenes",
  "Finding pictures and a voice",
];

export default function Learn() {
  const { user } = useAuth();
  const { lessonId } = useParams();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingLesson, setLoadingLesson] = useState(Boolean(lessonId));
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [autoplayIndex, setAutoplayIndex] = useState(-1);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const stopRecRef = useRef(null);
  const inputBeforeRecRef = useRef("");

  const firstName = (user.displayName || user.email || "there").split(" ")[0].split("@")[0];
  const initial = firstName[0]?.toUpperCase() || "?";

  // Load an existing lesson, or reset for a new one.
  useEffect(() => {
    let cancelled = false;
    if (!lessonId) {
      setLesson(null);
      setMessages([]);
      setLoadingLesson(false);
      return;
    }
    setLoadingLesson(true);
    getLesson(user.uid, lessonId).then((doc) => {
      if (cancelled) return;
      if (!doc) {
        setError("That lesson could not be found.");
        navigate("/learn", { replace: true });
        return;
      }
      setLesson(doc);
      setMessages(doc.messages || []);
      setLoadingLesson(false);
    });
    return () => {
      cancelled = true;
    };
  }, [lessonId, user.uid, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Cycle the "preparing your lesson" steps while waiting.
  useEffect(() => {
    if (!sending) return;
    setLoadingStep(0);
    const t = setInterval(() => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1800);
    return () => clearInterval(t);
  }, [sending]);

  useEffect(() => () => stopRecRef.current?.(), []);

  async function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of picked) {
      try {
        const read = await readUpload(f);
        setFiles((prev) => [...prev, read]);
      } catch (err) {
        setError(err.message);
      }
    }
  }

  function toggleRecording() {
    if (recording) {
      stopRecRef.current?.();
      return;
    }
    inputBeforeRecRef.current = input ? input.trimEnd() + " " : "";
    const stop = startRecognition({
      onText: (finalText, interimText) => {
        setInput(inputBeforeRecRef.current + finalText);
        setInterim(interimText);
      },
      onEnd: () => {
        setRecording(false);
        setInterim("");
        stopRecRef.current = null;
      },
      onError: (code) => {
        if (code !== "no-speech" && code !== "aborted") setError(`Microphone error: ${code}`);
      },
    });
    if (!stop) {
      setError("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    stopRecRef.current = stop;
    setRecording(true);
  }

  async function send(textOverride) {
    const text = (textOverride ?? input).trim();
    if ((!text && files.length === 0) || sending) return;
    if (recording) stopRecRef.current?.();

    setError("");
    setSending(true);
    const userMsg = {
      role: "user",
      text: text || "(sent attachments)",
      attachments: files.map((f) => ({ name: f.name, type: f.mediaType })),
    };
    const history = messages;
    const outgoingFiles = files;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setFiles([]);

    try {
      const script = await generateLessonScript(history, text, outgoingFiles);
      const assistantMsg = { role: "assistant", text: scriptToText(script), script, attachments: [] };
      const next = [...history, userMsg, assistantMsg];
      setMessages(next);
      setAutoplayIndex(next.length - 1);

      if (!lesson) {
        const id = await createLesson(user.uid, { messages: next, title: script.title || text.slice(0, 60) || "New lesson" });
        const created = { id, title: script.title || text.slice(0, 60) || "New lesson", topic: "General", messages: next };
        setLesson(created);
        navigate(`/learn/${id}`, { replace: true });
        summarizeLesson(next)
          .then((meta) => {
            updateLesson(user.uid, id, meta);
            setLesson((l) => (l ? { ...l, ...meta } : l));
          })
          .catch((err) => console.warn("Could not label lesson", err));
      } else {
        await updateLesson(user.uid, lesson.id, { messages: next });
      }
    } catch (err) {
      setError(err.message || "The AI could not answer. Please try again.");
      setMessages(history);
      setInput(text);
      setFiles(outgoingFiles);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (loadingLesson) {
    return (
      <div className="fullscreen-center" style={{ minHeight: 300 }}>
        <Spinner label="Opening lesson..." />
      </div>
    );
  }

  const canSend = !sending && (input.trim() || files.length > 0);

  return (
    <div className="chat">
      <div className="chat-header">
        <div className="row" style={{ gap: 12 }}>
          <img src="/icon.png" alt="" className="tutor-avatar" />
          <div>
            <h1 style={{ fontSize: "1.2rem", marginBottom: 2 }}>{lesson ? lesson.title : "Learn with AI"}</h1>
            <span className="muted small">
              {lesson ? (
                <span className="chip">{lesson.topic}</span>
              ) : (
                "Your personal tutor. Ask, speak, or upload your lesson."
              )}
            </span>
          </div>
        </div>
        {lesson && (
          <div className="row">
            <Link to="/daily" state={{ lessonId: lesson.id }} className="btn sm ghost">Take exam on this</Link>
            <Link to="/learn" className="btn sm">+ New lesson</Link>
          </div>
        )}
      </div>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !sending && (
          <div className="welcome">
            <h2>Hi {firstName}. What are we learning today?</h2>
            <p>Pick a way to start, or just type below. You'll get a short video lesson back in a few seconds.</p>
            <div className="start-grid">
              <button className="start-card" onClick={() => textareaRef.current?.focus()}>
                <span className="start-ico">⌨️</span>
                <strong>Type a question</strong>
                <span className="muted small">Any subject, any level</span>
              </button>
              <button className="start-card" onClick={toggleRecording} disabled={!speechRecognitionSupported}>
                <span className="start-ico">🎤</span>
                <strong>Say it out loud</strong>
                <span className="muted small">{speechRecognitionSupported ? "Tap and start talking" : "Needs Chrome or Edge"}</span>
              </button>
              <button className="start-card" onClick={() => fileInputRef.current?.click()}>
                <span className="start-ico">📄</span>
                <strong>Upload notes</strong>
                <span className="muted small">Photo or PDF of a page</span>
              </button>
            </div>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip-btn" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <div key={i} className="turn assistant">
              <div className="turn-meta">
                <img src="/icon.png" alt="" className="turn-avatar" />
                <span>Novalern</span>
              </div>
              {m.script ? (
                <LessonPlayer script={m.script} autoplay={i === autoplayIndex} />
              ) : (
                <div className="msg assistant"><ReactMarkdown>{m.text}</ReactMarkdown></div>
              )}
            </div>
          ) : (
            <div key={i} className="turn user">
              <div className="turn-meta">
                <span>You</span>
                <span className="turn-avatar initial">{initial}</span>
              </div>
              <div className="msg user">
                {m.attachments?.length > 0 && (
                  <div className="msg-files">
                    {m.attachments.map((a, j) => (
                      <span key={j} className="chip">📎 {a.name}</span>
                    ))}
                  </div>
                )}
                {m.text}
              </div>
            </div>
          )
        )}

        {sending && (
          <div className="turn assistant">
            <div className="turn-meta">
              <img src="/icon.png" alt="" className="turn-avatar" />
              <span>Novalern</span>
            </div>
            <div className="preparing">
              <span className="typing"><i /><i /><i /></span>
              <div>
                <strong>Preparing your video lesson</strong>
                <div className="muted small">{LOADING_STEPS[loadingStep]}…</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={"composer" + (recording ? " listening" : "")}>
        {files.length > 0 && (
          <div className="attachments">
            {files.map((f, i) => (
              <div key={i} className="attachment">
                {f.previewUrl ? <img src={f.previewUrl} alt="" /> : <span className="file-ico">PDF</span>}
                <span>
                  {f.name}
                  <br />
                  <span className="muted">{formatBytes(f.size)}</span>
                </span>
                <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove">×</button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={recording ? "Listening… speak now" : lesson ? "Ask a follow-up question…" : "Ask anything, or describe what you uploaded…"}
          rows={2}
          disabled={sending}
        />
        {interim && <div className="interim small">{interim}</div>}
        <div className="composer-bar">
          <div className="row">
            <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={onPickFiles} />
            <button className="tool-btn" onClick={() => fileInputRef.current?.click()} disabled={sending}>
              <ClipIcon /> Upload
            </button>
            <button
              className={"tool-btn" + (recording ? " recording" : "")}
              onClick={toggleRecording}
              disabled={sending || !speechRecognitionSupported}
              title={speechRecognitionSupported ? "" : "Voice input needs Chrome or Edge"}
            >
              <MicIcon /> {recording ? "Stop" : "Speak"}
            </button>
            <span className="muted small hide-mobile">PNG, JPG or PDF · up to 6 MB</span>
          </div>
          <button className="btn primary send-btn" onClick={() => send()} disabled={!canSend}>
            {sending ? "Working…" : "Send"} <span aria-hidden="true">↑</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </svg>
  );
}
