import { useCallback, useEffect, useRef, useState } from "react";
import { randomSticker, stickersEnabled } from "../lib/stickers";
import { findImage } from "../lib/images";
import { narrate, speechSynthesisSupported, stopNarration } from "../lib/speech";
import { prefetchNarration } from "../lib/tts";

const EFFECTS = ["fade", "slide", "zoom", "bounce"];

/**
 * Plays a lesson script like a video: one scene at a time, narrated, with a real
 * picture (slow zoom), a sticker badge, animated captions and auto-advance.
 */
export default function LessonPlayer({ script, autoplay = false }) {
  const scenes = script.scenes;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [stickers, setStickers] = useState({});
  const [images, setImages] = useState({});
  const [showTranscript, setShowTranscript] = useState(false);
  const runId = useRef(0);
  const scene = scenes[index];
  const atEnd = index >= scenes.length - 1;

  // Prefetch visuals for every scene once.
  useEffect(() => {
    let cancelled = false;
    scenes.forEach((s, i) => {
      if (stickersEnabled) {
        randomSticker(s.sticker).then((st) => {
          if (!cancelled && st) setStickers((prev) => ({ ...prev, [i]: st }));
        });
      }
      findImage(s.imageQuery || "").then((img) => {
        if (!cancelled && img) setImages((prev) => ({ ...prev, [i]: img }));
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
    prefetchNarration(scenes.slice(index + 1, index + 3).map((s) => s.narration));
    narrate(scene.narration).then((how) => {
      if (runId.current !== id) return;
      const minDuration = how === "browser" && !speechSynthesisSupported ? 3500 + (scene.narration?.length || 0) * 40 : 1500;
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
  const image = images[index];
  const effect = EFFECTS.includes(scene.effect) ? scene.effect : EFFECTS[index % EFFECTS.length];

  return (
    <div className="player">
      <div className={`stage fx-${effect} ${image ? "has-image" : ""}`} onClick={togglePlay} role="button" aria-label={playing ? "Pause" : "Play"}>
        <div className="stage-bg">
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
        </div>

        <div className="stage-badge">{script.title}</div>

        <div className="stage-body" key={index}>
          <div className="stage-text">
            <div className="stage-caption">{scene.caption}</div>
            {scene.bullets?.length > 0 && (
              <ul className="stage-bullets">
                {scene.bullets.map((b, i) => (
                  <li key={i} style={{ animationDelay: `${0.35 + i * 0.3}s` }}>{b}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="stage-visual">
            {image ? (
              <SceneImage key={`img-${index}`} image={image} alt={scene.imageQuery} />
            ) : sticker ? null : (
              <span className="stage-sticker-placeholder">✦</span>
            )}
            {sticker && (
              <div className={"stage-sticker" + (image ? " badge" : " solo")}>
                <img src={sticker.url} alt={sticker.title} />
              </div>
            )}
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
        <div className="row">
          {image?.credit && <span className="muted small">Image: {image.credit}</span>}
          <button className="link-btn small" onClick={() => setShowTranscript((s) => !s)}>
            {showTranscript ? "Hide transcript" : "Show transcript"}
          </button>
        </div>
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

/** Shows the first candidate URL that loads; hides itself if none do. */
function SceneImage({ image, alt }) {
  const [i, setI] = useState(0);
  const src = image.candidates[i];
  if (!src) return null;
  return (
    <img
      className="stage-image"
      src={src}
      alt={alt || ""}
      referrerPolicy="no-referrer"
      onError={() => setI((n) => n + 1)}
    />
  );
}
