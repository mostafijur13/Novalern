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

const SLOGANS = [
  ["Type it. Say it. Upload it.", "Then watch it as a lesson."],
  ["Your notes, as a short video.", "Ask anything or drop a page below."],
  ["One question in.", "One video lesson out."],
  ["Stuck on a problem?", "Paste it, snap it, or say it."],
];

const LOADING_STEPS = ["Reading your question", "Planning the lesson", "Writing the scenes", "Finding pictures and a voice"];

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
  const [slogan] = useState(() => SLOGANS[Math.floor(Math.random() * SLOGANS.length)]);

  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const stopRecRef = useRef(null);
  const inputBeforeRecRef = useRef("");

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
    if (messages.length || sending) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

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
        setFiles((prev) => [...prev, ...[]]);
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

  async function send() {
    const text = input.trim();
    if ((!text && files.length === 0) || sending) return;
    if (recording) stopRecRef.current?.();

    setError("");
    setSending(true);
    const userMsg = { role: "user", text: text || "(sent attachments)", attachments: files.map((f) => ({ name: f.name, type: f.mediaType })) };
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
        const title = script.title || text.slice(0, 60) || "New lesson";
        const id = await createLesson(user.uid, { messages: next, title });
        setLesson({ id, title, topic: "General", messages: next });
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
      <div style={{ padding: "60px 0", display: "grid", placeItems: "center" }}>
        <Spinner label="Opening lesson..." />
      </div>
    );
  }

  const canSend = !sending && (input.trim() || files.length > 0);
  const empty = messages.length === 0 && !sending;

  return (
    <div className="chat">
      {lesson && (
        <div className="chat-header">
          <div>
            <h1 style={{ fontSize: "1.5rem", marginBottom: 2 }}>{lesson.title}</h1>
            <span className="muted small">{lesson.topic}</span>
          </div>
          <div className="row">
            <Link to="/daily" state={{ lessonId: lesson.id }} className="btn sm ghost">Take exam</Link>
            <Link to="/learn" className="btn sm">New lesson</Link>
          </div>
        </div>
      )}

      <ErrorBanner message={error} onClose={() => setError("")} />

      {empty ? (
        <div className="slogan">
          <h2>{slogan[0]}</h2>
          <p>{slogan[1]}</p>
        </div>
      ) : (
        <div className="chat-scroll">
          {messages.map((m, i) =>
            m.role === "assistant" ? (
              <div key={i} className="turn assistant">
                <div className="turn-meta">Novalern</div>
                {m.script ? (
                  <LessonPlayer script={m.script} autoplay={i === autoplayIndex} />
                ) : (
                  <div className="msg assistant"><ReactMarkdown>{m.text}</ReactMarkdown></div>
                )}
              </div>
            ) : (
              <div key={i} className="turn user">
                <div className="turn-meta">You</div>
                <div className="msg user">
                  {m.attachments?.length > 0 && (
                    <div className="msg-files">
                      {m.attachments.map((a, j) => (
                        <span key={j} className="chip">{a.name}</span>
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
              <div className="turn-meta">Novalern</div>
              <div className="preparing">
                <span className="typing"><i /><i /><i /></span>
                <div>
                  <strong>Preparing your video lesson</strong>
                  <div className="muted small">{LOADING_STEPS[loadingStep]}…</div>
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

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
          aria-label="Your question"
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
            <span className="muted small hide-mobile">PNG, JPG or PDF up to 6 MB</span>
          </div>
          <button className="btn primary" onClick={send} disabled={!canSend}>
            {sending ? "Working…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </svg>
  );
}
