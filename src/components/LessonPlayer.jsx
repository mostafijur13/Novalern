import { useCallback, useEffect, useRef, useState } from "react";
import { randomSticker, stickersEnabled } from "../lib/stickers";
import { findImage } from "../lib/images";
import { narrate, speechSynthesisSupported, stopNarration } from "../lib/speech";
import { prefetchNarration } from "../lib/tts";
import { playSfx, preloadSfx, setSfxMuted, sfxMuted } from "../lib/sounds";

const EFFECTS = ["fade", "slide", "zoom", "bounce"];
const LAYOUTS = ["right", "left", "cover", "top", "right", "cover", "left", "top"];
const THEMES = 6;

/**
 * Plays a lesson script like a video: one scene at a time, narrated, with a real
 * picture that moves around the stage, a sticker, pixel captions, colour themes,
 * sound effects and auto-advance. Sized by width; never scrolls internally.
 */
export default function LessonPlayer({ script, autoplay = false }) {
  const scenes = script.scenes;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [stickers, setStickers] = useState({});
  const [images, setImages] = useState({});
  const [showTranscript, setShowTranscript] = useState(false);
  const [muted, setMuted] = useState(sfxMuted());
  const runId = useRef(0);
  const firstRender = useRef(true);
  const scene = scenes[index];
  const atEnd = index >= scenes.length - 1;

  useEffect(() => {
    let cancelled = false;
    preloadSfx();
    scenes.forEach((s, i) => {
      if (stickersEnabled) {
        randomSticker(s.sticker).then((st) => {
          if (!cancelled) setStickers((prev) => ({ ...prev, [i]: st || false }));
        });
      }
      const query = s.imageQuery === undefined ? s.caption : s.imageQuery;
      findImage(query || "").then((img) => {
        if (!cancelled) setImages((prev) => ({ ...prev, [i]: img || false }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [scenes]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!playing) return;
    playSfx(index === scenes.length - 1 ? "chime" : "whoosh");
    const t = setTimeout(() => playSfx("pop"), 450);
    return () => clearTimeout(t);
  }, [index, playing, scenes.length]);

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

  function toggleMute(e) {
    e.stopPropagation();
    const next = !muted;
    setMuted(next);
    setSfxMuted(next);
  }

  const sticker = stickers[index] || null;
  const image = images[index] || null;
  const effect = EFFECTS.includes(scene.effect) ? scene.effect : EFFECTS[index % EFFECTS.length];
  const layout = image ? LAYOUTS[index % LAYOUTS.length] : "none";
  const theme = index % THEMES;

  return (
    <div className="player">
      <div className={`stage fx-${effect} layout-${layout} theme-${theme}`} onClick={togglePlay} role="button" aria-label={playing ? "Pause" : "Play"}>
        {image && layout === "cover" && (
          <div className="stage-cover" key={`cover-${index}`}>
            <SceneImage image={image} alt={scene.imageQuery} />
          </div>
        )}

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
            {image && layout !== "cover" ? (
              <SceneImage key={`img-${index}`} image={image} alt={scene.imageQuery} />
            ) : !image && !sticker ? (
              <span className="stage-sticker-placeholder" />
            ) : null}
            {sticker && (
              <div className={"stage-sticker" + (image && layout !== "cover" ? " badge" : " solo")}>
                <img src={sticker.url} alt={sticker.title} />
              </div>
            )}
          </div>
        </div>

        <button className="mute-btn" onClick={toggleMute} title={muted ? "Unmute sound effects" : "Mute sound effects"} aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}>
          {muted ? <MutedIcon /> : <SoundIcon />}
        </button>

        {!playing && (
          <div className="stage-overlay">
            <span className="play-big">{atEnd ? <ReplayIcon /> : <PlayIcon />}</span>
            <span>{atEnd ? "Replay lesson" : index === 0 ? "Play lesson" : "Resume"}</span>
          </div>
        )}

        <div className="stage-progress" aria-hidden="true">
          {scenes.map((_, i) => (
            <span key={i} className={i < index ? "done" : i === index ? (playing ? "active" : "current") : ""} />
          ))}
        </div>
      </div>

      <div className="player-controls">
        <div className="row">
          <button className="icon-btn" onClick={() => go(index - 1)} disabled={index === 0} title="Previous scene" aria-label="Previous scene"><PrevIcon /></button>
          <button className="btn sm" onClick={togglePlay}>
            {playing ? "Pause" : atEnd ? "Replay" : "Play"}
          </button>
          <button className="icon-btn" onClick={() => go(index + 1)} disabled={atEnd} title="Next scene" aria-label="Next scene"><NextIcon /></button>
          <span className="scene-count">{index + 1} / {scenes.length}</span>
        </div>
        <button className="link-btn small" onClick={() => setShowTranscript((s) => !s)}>
          {showTranscript ? "Hide transcript" : "Show transcript"}
        </button>
      </div>

      {!speechSynthesisSupported && (
        <p className="muted small" style={{ margin: "6px 0 0" }}>Voice narration is not supported in this browser; scenes advance on a timer.</p>
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

function SceneImage({ image, alt }) {
  const [i, setI] = useState(0);
  const src = image.candidates[i];
  if (!src) return null;
  return <img className="stage-image" src={src} alt={alt || ""} referrerPolicy="no-referrer" onError={() => setI((n) => n + 1)} />;
}

const svgProps = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
function PlayIcon() { return <svg {...svgProps} width={26} height={26} fill="currentColor" stroke="none"><path d="M7 4l13 8-13 8z" /></svg>; }
function ReplayIcon() { return <svg {...svgProps} width={26} height={26}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>; }
function PrevIcon() { return <svg {...svgProps}><path d="M15 6l-6 6 6 6" /></svg>; }
function NextIcon() { return <svg {...svgProps}><path d="M9 6l6 6-6 6" /></svg>; }
function SoundIcon() { return <svg {...svgProps} width={16} height={16}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>; }
function MutedIcon() { return <svg {...svgProps} width={16} height={16}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9l5 6M21 9l-5 6" /></svg>; }
