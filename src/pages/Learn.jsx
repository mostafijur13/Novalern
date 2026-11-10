import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useNavigate, useParams } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import Spinner from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { generateLessonScript, scriptToText, summarizeLesson } from "../lib/ai";
import LessonPlayer from "../components/LessonPlayer";
import { createLesson, getLesson, updateLesson } from "../lib/db";
import { ACCEPT_ATTR, formatBytes, readUpload } from "../lib/files";
import { speechRecognitionSupported, startRecognition } from "../lib/speech";

const SUGGESTIONS = [
  "Explain photosynthesis like I'm in grade 8",
  "Help me solve: 2x + 5 = 17",
  "Summarize the causes of World War I",
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
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [autoplayIndex, setAutoplayIndex] = useState(-1);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const stopRecRef = useRef(null);
  const inputBeforeRecRef = useRef("");

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
        // First exchange: create the lesson, then label it in the background.
        const id = await createLesson(user.uid, { messages: next, title: text.slice(0, 60) || "New lesson" });
        const created = { id, title: text.slice(0, 60) || "New lesson", topic: "General", messages: next };
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

  return (
    <div className="chat">
      <div className="chat-header">
        <div>
          <h1 style={{ fontSize: "1.25rem" }}>{lesson ? lesson.title : "Learn with AI"}</h1>
          <span className="muted small">
            {lesson ? lesson.topic : "Upload your problem or your class lesson to understand it better."}
          </span>
        </div>
        <div className="row">
          {lesson && (
            <Link to="/daily" state={{ lessonId: lesson.id }} className="btn sm ghost">Take exam on this</Link>
          )}
          {lesson && (
            <Link to="/learn" className="btn sm">+ New lesson</Link>
          )}
        </div>
      </div>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !sending && (
          <div className="welcome">
            <img src="/icon.png" alt="" width="56" style={{ borderRadius: 14, marginBottom: 12 }} />
            <h2>What are we learning today?</h2>
            <p>Type a question, tap the mic to speak, or upload a PNG / PDF of your class lesson. Novalern turns it into a short narrated video lesson.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="btn sm ghost" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "assistant" && m.script ? (
            <div key={i} className="msg-video">
              <LessonPlayer script={m.script} autoplay={i === autoplayIndex} />
            </div>
          ) : (
            <div key={i} className={`msg ${m.role}`}>
              {m.attachments?.length > 0 && (
                <div className="msg-files">
                  {m.attachments.map((a, j) => (
                    <span key={j} className="chip">📎 {a.name}</span>
                  ))}
                </div>
              )}
              {m.role === "assistant" ? <ReactMarkdown>{m.text}</ReactMarkdown> : m.text}
            </div>
          )
        )}

        {sending && (
          <div className="msg assistant">
            <span className="typing"><i /><i /><i /></span>
            <span className="muted small" style={{ marginLeft: 8 }}>Writing your video lesson...</span>
          </div>
        )}
      </div>

      <div className="composer">
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={recording ? "Listening..." : "Ask anything, or describe what you uploaded..."}
          rows={2}
          disabled={sending}
        />
        {interim && <div className="interim small">{interim}</div>}
        <div className="composer-bar">
          <div className="row">
            <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={onPickFiles} />
            <button className="icon-btn" title="Upload PNG, JPG or PDF" onClick={() => fileInputRef.current?.click()} disabled={sending}>
              <ClipIcon />
            </button>
            <button
              className={"icon-btn" + (recording ? " recording" : "")}
              title={speechRecognitionSupported ? (recording ? "Stop listening" : "Speak your question") : "Voice input not supported in this browser"}
              onClick={toggleRecording}
              disabled={sending || !speechRecognitionSupported}
            >
              <MicIcon />
            </button>
            <span className="muted small">PNG, JPG, PDF up to 6 MB (up to 3 images per message)</span>
          </div>
          <button className="btn primary" onClick={() => send()} disabled={sending || (!input.trim() && files.length === 0)}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </svg>
  );
}
