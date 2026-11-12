import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { randomSticker, stickersEnabled } from "../lib/stickers";
import { findImage } from "../lib/images";
import { direct, normalizeScript } from "../lib/lessonPipeline";
import { narrate, speechSynthesisSupported, stopNarration } from "../lib/speech";
import { prefetchNarration } from "../lib/tts";
import { playSfx, preloadSfx, setSfxMuted, sfxMuted } from "../lib/sounds";
import "./player.css";

const CHARS_PER_SECOND = 14; // rough speaking rate, used to pace on-screen reveals

/**
 * Plays a directed lesson script as a video. Every scene is drawn from a fixed template with
 * its own regions: the picture sits in a clipped frame, so its motion never reaches the text.
 */
export default function LessonPlayer({ script: rawScript, autoplay = false }) {
  const script = useMemo(() => normalizeScript(rawScript), [rawScript]);
  const [legacyImages, setLegacyImages] = useState({});
  const scenes = useMemo(() => {
    if (!script.legacy) return script.scenes;
    return direct(script.scenes.map((s, i) => (legacyImages[i] ? { ...s, image: legacyImages[i] } : s)));
  }, [script, legacyImages]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [revealed, setRevealed] = useState(false); // quiz answer shown
  const [stickers, setStickers] = useState({});
  const [showTranscript, setShowTranscript] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [muted, setMuted] = useState(sfxMuted());
  const runId = useRef(0);
  const scene = scenes[index];
  const atEnd = index >= scenes.length - 1;

  // Stickers, preloaded pictures, and (for old lessons) lazy picture lookups.
  useEffect(() => {
    let cancelled = false;
    preloadSfx();
    script.scenes.forEach((s, i) => {
      if (s.image?.url) {
        const img = new Image();
        img.src = s.image.url;
      }
      if (stickersEnabled && s.sticker) {
        randomSticker(s.sticker).then((st) => !cancelled && st && setStickers((p) => ({ ...p, [i]: st })));
      }
      if (script.legacy && s.legacyQuery) {
        findImage(s.legacyQuery).then((img) => !cancelled && img && setLegacyImages((p) => ({ ...p, [i]: { url: img.url, credit: img.credit, focus: "center" } })));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [script]);

  // Scene entry: sound cue, reset quiz state.
  useEffect(() => {
    setRevealed(false);
    if (!playing) return;
    if (scene.sfx) playSfx(scene.sfx);
    if (scene.sticker) {
      const t = setTimeout(() => playSfx("pop"), 650);
      return () => clearTimeout(t);
    }
  }, [index, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Narrate, then advance. Quiz scenes reveal the answer before moving on.
  useEffect(() => {
    if (!playing) {
      stopNarration();
      return;
    }
    const id = ++runId.current;
    const started = Date.now();
    prefetchNarration(scenes.slice(index + 1, index + 3).map((s) => s.narration));
    narrate(scene.narration).then(async (how) => {
      if (runId.current !== id) return;
      const minDuration = how === "browser" && !speechSynthesisSupported ? 3500 + (scene.narration?.length || 0) * 45 : 1800;
      await sleep(Math.max(0, minDuration - (Date.now() - started)));
      if (runId.current !== id) return;
      if (scene.template === "quiz" && scene.highlight) {
        setRevealed(true);
        playSfx("ding");
        await sleep(2200);
        if (runId.current !== id) return;
      } else {
        await sleep(600);
        if (runId.current !== id) return;
      }
      if (index < scenes.length - 1) setIndex(index + 1);
      else setPlaying(false);
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

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setSfxMuted(next);
  }

  // Pace reveals across the narration so text appears as it is spoken.
  const speakSecs = Math.max(2.5, (scene.narration?.length || 40) / CHARS_PER_SECOND);
  const sticker = stickers[index] || null;

  return (
    <div className="player">
      <div
        className={`stage theme-${scene.theme} ${playing ? "is-playing" : "is-paused"}`}
        onClick={togglePlay}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), togglePlay())}
        aria-label={playing ? "Pause lesson" : "Play lesson"}
      >
        <div className="stage-pattern" aria-hidden="true" />
        {scene.template !== "title" && <div className="stage-title">{script.title}</div>}

        <Scene key={index} scene={scene} sticker={sticker} speakSecs={speakSecs} revealed={revealed} />

        {captions && scene.narration && <div className="stage-cc">{scene.narration}</div>}

        {!playing && (
          <div className="stage-overlay">
            <span className="play-big">{atEnd ? <ReplayIcon /> : <PlayIcon />}</span>
            <span>{atEnd ? "Replay lesson" : index === 0 ? "Play lesson" : "Resume"}</span>
          </div>
        )}

        <div className="stage-progress" aria-hidden="true">
          {scenes.map((_, i) => (
            <span key={i} className={i < index ? "done" : i === index ? (playing ? "active" : "current") : ""} style={i === index ? { "--dur": `${speakSecs + 1}s` } : undefined} />
          ))}
        </div>
      </div>

      <div className="player-controls">
        <div className="row">
          <button className="icon-btn" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous scene"><PrevIcon /></button>
          <button className="btn sm" onClick={togglePlay}>{playing ? "Pause" : atEnd ? "Replay" : "Play"}</button>
          <button className="icon-btn" onClick={() => go(index + 1)} disabled={atEnd} aria-label="Next scene"><NextIcon /></button>
          <span className="scene-count">{index + 1} / {scenes.length}</span>
        </div>
        <div className="row">
          <button className={"tool-btn" + (captions ? " on" : "")} onClick={() => setCaptions((c) => !c)} aria-pressed={captions}>CC</button>
          <button className="tool-btn" onClick={toggleMute} aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}>{muted ? <MutedIcon /> : <SoundIcon />}</button>
          <button className="link-btn small" onClick={() => setShowTranscript((s) => !s)}>{showTranscript ? "Hide transcript" : "Transcript"}</button>
        </div>
      </div>
      {scene.image?.credit && <div className="muted small" style={{ marginTop: 4 }}>Picture: {scene.image.credit}</div>}

      {!speechSynthesisSupported && <p className="muted small" style={{ margin: "6px 0 0" }}>Voice narration is not supported in this browser; scenes advance on a timer.</p>}

      {showTranscript && (
        <ol className="transcript">
          {scenes.map((s, i) => (
            <li key={i} className={i === index ? "current" : ""} onClick={() => go(i)}>
              <strong>{s.heading}</strong> {s.narration}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ scene */

function Scene({ scene, sticker, speakSecs, revealed }) {
  const { template, layout, heading, lines = [], highlight, image } = scene;
  // Reveal delays: spread the lines across ~80% of the narration.
  const step = lines.length ? (speakSecs * 0.8) / (lines.length + 1) : 0;
  const delay = (i) => ({ animationDelay: `${0.5 + (i + 1) * step}s` });

  const text = (
    <div className={`scene-text t-${template}`}>
      {template === "definition" ? (
        <>
          <div className="term">{heading}</div>
          <div className="rule" />
          {highlight && <p className="meaning reveal" style={delay(0)}>{highlight}</p>}
          {lines.map((l, i) => <p key={i} className="sub reveal" style={delay(i + 1)}>{l}</p>)}
        </>
      ) : template === "compare" ? (
        <>
          <h3 className="heading">{heading}</h3>
          <div className="compare">
            {lines.map((l, i) => {
              const [a, b] = l.split("::").map((x) => x.trim());
              return (
                <div key={i} className="compare-row reveal" style={delay(i)}>
                  <span>{a}</span>
                  <span>{b ?? ""}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : template === "quiz" ? (
        <>
          <div className="quiz-label">Quick check</div>
          <h3 className="heading">{heading}</h3>
          <ol className="quiz-options">
            {lines.map((l, i) => (
              <li key={i} className={"reveal" + (revealed ? (l.trim() === highlight?.trim() ? " correct" : " dim") : "")} style={delay(i)}>
                <b>{"ABC"[i] || i + 1}</b> {l}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <h3 className="heading">{heading}</h3>
          {lines.length > 0 && (
            <ul className={template === "steps" ? "steps" : template === "recap" ? "ticks" : "facts"}>
              {lines.map((l, i) => (
                <li key={i} className="reveal" style={delay(i)}>
                  {template === "steps" && <b>{i + 1}</b>}
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          )}
          {highlight && template !== "steps" && (
            <div className="highlight reveal" style={delay(lines.length)}>
              {template === "example" ? <span className="arrow">=</span> : null}
              {highlight}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className={`scene layout-${layout} v-${scene.variant || "left"} tr-${scene.transition}`}>
      {image?.url && (
        <figure className={`frame m-${scene.motion} f-${image.focus || "center"} k-${image.kind || "photo"}`}>
          <SceneImage image={image} />
        </figure>
      )}
      {text}
      {sticker && (
        <div className="sticker">
          <img src={sticker.url} alt="" />
        </div>
      )}
    </div>
  );
}

function SceneImage({ image }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={image.url} alt={image.title || ""} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const svgProps = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
function PlayIcon() { return <svg {...svgProps} width={26} height={26} fill="currentColor" stroke="none"><path d="M7 4l13 8-13 8z" /></svg>; }
function ReplayIcon() { return <svg {...svgProps} width={26} height={26}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>; }
function PrevIcon() { return <svg {...svgProps}><path d="M15 6l-6 6 6 6" /></svg>; }
function NextIcon() { return <svg {...svgProps}><path d="M9 6l6 6-6 6" /></svg>; }
function SoundIcon() { return <svg {...svgProps} width={16} height={16}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>; }
function MutedIcon() { return <svg {...svgProps} width={16} height={16}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9l5 6M21 9l-5 6" /></svg>; }
