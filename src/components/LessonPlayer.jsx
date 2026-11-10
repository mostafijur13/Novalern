import { useCallback, useEffect, useRef, useState } from "react";
import { randomSticker, stickersEnabled } from "../lib/stickers";
import { narrate, speechSynthesisSupported, stopNarration } from "../lib/speech";
import { prefetchNarration } from "../lib/tts";

/**
 * Plays a lesson script like a video: one scene at a time, narrated with speech
 * synthesis, with a sticker and on-screen text. Auto-advances when narration ends.
 */
export default function LessonPlayer({ script, autoplay = false }) {
  const scenes = script.scenes;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [stickers, setStickers] = useState({});
  const [showTranscript, setShowTranscript] = useState(false);
  const runId = useRef(0);
  const scene = scenes[index];
  const atEnd = index >= scenes.length - 1;

  // Prefetch stickers for every scene once.
  useEffect(() => {
    if (!stickersEnabled) return;
    let cancelled = false;
    scenes.forEach((s, i) => {
      randomSticker(s.sticker).then((st) => {
        if (!cancelled && st) setStickers((prev) => ({ ...prev, [i]: st }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [scenes]);

  // Narrate the current scene while playing, then advance.
  useEffect(() => {
    if (!playing) {
      stopNarration();
      return;
    }
    const id = ++runId.current;
    const started = Date.now();
    // Warm up audio for the next scenes while this one plays.
    prefetchNarration(scenes.slice(index + 1, index + 3).map((s) => s.narration));
    narrate(scene.narration).then((how) => {
      if (runId.current !== id) return;
      const minDuration = how === "browser" && !speechSynthesisSupported ? 3500 + (scene.narration?.length || 0) * 40 : 1200;
      const wait = Math.max(0, minDuration - (Date.now() - started));
      setTimeout(() => {
        if (runId.current !== id) return;
        if (index < scenes.length - 1) setIndex(index + 1);
        else setPlaying(false);
      }, wait);
    });
    return () => {
      runId.current++;
      stopNarration();
    };
  }, [index, playing, scene, scenes]);

  useEffect(() => () => stopNarration(), []);

  const go = useCallback(
    (next) => {
      stopNarration();
      setIndex(Math.min(scenes.length - 1, Math.max(0, next)));
    },
    [scenes.length]
  );

  function togglePlay() {
    if (!playing && atEnd) {
      setIndex(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }

  const sticker = stickers[index];

  return (
    <div className="player">
      <div className="stage" onClick={togglePlay} role="button" aria-label={playing ? "Pause" : "Play"}>
        <div className="stage-badge">{script.title}</div>
        <div className="stage-body" key={index}>
          <div className="stage-text">
            <div className="stage-caption">{scene.caption}</div>
            {scene.bullets?.length > 0 && (
              <ul className="stage-bullets">
                {scene.bullets.map((b, i) => (
                  <li key={i} style={{ animationDelay: `${0.25 + i * 0.25}s` }}>{b}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="stage-sticker">
            {sticker ? <img src={sticker.url} alt={sticker.title} /> : <span className="stage-sticker-placeholder">✦</span>}
          </div>
        </div>
        {!playing && (
          <div className="stage-overlay">
            <span className="play-big">{atEnd ? "↻" : "▶"}</span>
            <span>{atEnd ? "Replay lesson" : index === 0 ? "Play lesson" : "Resume"}</span>
          </div>
        )}
        <div className="stage-progress">
          {scenes.map((_, i) => (
            <span key={i} className={i < index ? "done" : i === index ? (playing ? "active" : "current") : ""} />
          ))}
        </div>
      </div>

      <div className="player-controls">
        <div className="row">
          <button className="icon-btn" onClick={() => go(index - 1)} disabled={index === 0} title="Previous scene">‹</button>
          <button className="btn sm" onClick={togglePlay}>
            {playing ? "❚❚ Pause" : atEnd ? "↻ Replay" : "▶ Play"}
          </button>
          <button className="icon-btn" onClick={() => go(index + 1)} disabled={atEnd} title="Next scene">›</button>
          <span className="muted small">Scene {index + 1} / {scenes.length}</span>
        </div>
        <button className="link-btn small" onClick={() => setShowTranscript((s) => !s)}>
          {showTranscript ? "Hide transcript" : "Show transcript"}
        </button>
      </div>

      {!speechSynthesisSupported && (
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          Voice narration is not supported in this browser; scenes advance on a timer.
        </p>
      )}

      {showTranscript && (
        <ol className="transcript">
          {scenes.map((s, i) => (
            <li key={i} className={i === index ? "current" : ""} onClick={() => go(i)}>
              <strong>{s.caption}</strong> {s.narration}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
