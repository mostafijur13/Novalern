// Development-only preview of the lesson player: /preview.html?scene=N&w=390 renders one scene
// of the last lesson made by scripts/test-pipeline.mjs, paused with all lines visible, so
// layouts can be checked without signing in. Dev server only; not part of the production build.
import React from "react";
import ReactDOM from "react-dom/client";
import LessonPlayer from "./components/LessonPlayer";
import "./index.css";

const params = new URLSearchParams(location.search);
const sceneIndex = Number(params.get("scene") || 0);

fetch("/scripts/.tmp/last-script.json")
  .then((r) => r.json())
  .then((script) => {
    const one = { ...script, scenes: [script.scenes[sceneIndex]] };
    ReactDOM.createRoot(document.getElementById("root")).render(
      <div style={{ padding: 16, maxWidth: Number(params.get("w")) || 980, margin: "0 auto" }}>
        <style>{".stage-overlay{display:none!important}"}</style>
        <LessonPlayer script={one} autoplay={params.get("play") === "1"} />
      </div>
    );
  });
