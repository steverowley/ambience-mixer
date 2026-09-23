#!/usr/bin/env node
/* Build a standalone preview page showing the redesigned layer card in its
   real states, at the narrowest width the grid can produce.

   Because no browser is available here, this exists so a human can open one
   file and see every footer state at once instead of reproducing them by
   hand in the app. It reuses index.html's own <style> block verbatim, so
   what you see is what the app renders. */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];

function card({ title, status, playing, silent, gone, vol, spd, loop,
                muted, soloed, visualising, retry }) {
  const cls = ["layer", playing && "playing", silent && "silent", gone && "gone"]
    .filter(Boolean).join(" ");
  return `
<div class="${cls}">
  <div class="layer-head">
    <div class="thumb"></div>
    <div class="meta">
      <p class="title">${title}</p>
      <div class="status">${status}</div>
    </div>
    <button class="playbtn">${playing ? "⏸" : "▶"}</button>
  </div>
  <div class="ctl"><div class="lab"><span>Volume</span><b>${vol}%</b></div>
    <input type="range" min="0" max="100" value="${vol}" style="--val:${vol}%"></div>
  <div class="ctl"><div class="lab"><span>Speed</span><b>${spd.toFixed(2)}×</b></div>
    <input type="range" min="0.25" max="2" step="0.25" value="${spd}"
      style="--val:${((spd - 0.25) / 1.75 * 100).toFixed(0)}%"></div>
  <div class="layer-foot">
    <div class="foot-row">
      <label class="toggle"><input type="checkbox" ${loop ? "checked" : ""}><span class="sw"></span>Loop</label>
      <div class="spacer"></div>
      <button class="tvbtn ${muted ? "active" : ""}">${muted ? "Muted" : "Mute"}</button>
      <button class="tvbtn ${soloed ? "active" : ""}">${soloed ? "Soloed" : "Solo"}</button>
    </div>
    <div class="foot-row">
      ${gone ? "" : `<button class="tvbtn ${visualising ? "active" : ""}">${visualising ? "Visualising" : "Visualise"}</button>`}
      ${retry ? '<button class="tvbtn retry">Retry</button>' : ""}
      <div class="spacer"></div>
      <button class="remove">Remove</button>
    </div>
  </div>
</div>`;
}

const states = [
  { label: "Playing", title: "Rain On Window with Thunder Sounds — 10 Hours",
    status: '<span class="live">● playing</span> · 1.00× · 76%',
    playing: true, vol: 76, spd: 1, loop: true },
  { label: "Paused", title: "The Wind in the Trees ( 10 Hours of Natural White Noise )",
    status: "paused · 0.75× · 42%", vol: 42, spd: 0.75, loop: true },
  { label: "Muted", title: "10 Hours Grandfather Clock Ticking Sounds For Deep Sleep",
    status: '<span class="live">● playing</span> · 1.00× · 14% · muted',
    playing: true, silent: true, muted: true, vol: 14, spd: 1, loop: true },
  { label: "Soloed", title: "Warm Cozy Fireplace 🔥 10 Hours • No Ads • No Music",
    status: '<span class="live">● playing</span> · 1.00× · 72%',
    playing: true, soloed: true, vol: 72, spd: 1, loop: true },
  { label: "Visualising", title: "UNDERWATER Ambience 10 Hours | DEEP SEA ASMR",
    status: '<span class="live">● playing</span> · 1.00× · 70%',
    playing: true, visualising: true, vol: 70, spd: 1, loop: true },
  { label: "Unavailable (Retry, no Visualise)",
    title: "Medieval Fantasy Tavern Ambience No Music",
    status: '<span class="gone">The owner has turned off playback on other sites.</span>',
    gone: true, retry: true, vol: 30, spd: 1, loop: true },
  { label: "Silenced by another layer's solo", title: "Relaxing Jazz Instrumental in Cozy Coffee Shop",
    status: '<span class="live">● playing</span> · 1.00× · 30% · silenced by solo',
    playing: true, silent: true, vol: 30, spd: 1, loop: true }
];

const out = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Ambience — card states preview</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>${css}
  body{padding:32px}
  .note{max-width:900px; margin:0 auto 28px; color:var(--text2); font-size:13.5px; line-height:1.6}
  .note h1{font-family:"Fraunces",serif; font-weight:400; color:var(--text); font-size:24px; margin:0 0 8px}
  .cases{max-width:900px; margin:0 auto; display:flex; flex-wrap:wrap; gap:26px}
  .case{width:320px}
  .case > .cap{font-size:11px; text-transform:uppercase; letter-spacing:.12em;
    color:var(--accent); font-weight:600; margin:0 0 10px}
  .ruler{max-width:900px; margin:0 auto 26px; font-size:12px; color:var(--muted)}
</style></head>
<body>
<div class="aurora"></div><div class="grain"></div>
<div class="note">
  <h1>Layer card — every footer state</h1>
  <p>Each card is fixed at <b>320px</b>, the narrowest the grid
  (<code>minmax(320px,1fr)</code>) will ever render. If nothing overflows here,
  nothing overflows in the app. Styles are lifted verbatim from
  <code>index.html</code>.</p>
</div>
<div class="cases">
${states.map(s => `<div class="case"><p class="cap">${s.label}</p>${card(s)}</div>`).join("\n")}
</div>
</body></html>`;

const dest = path.join(ROOT, ".dev", "preview-cards.html");
fs.writeFileSync(dest, out);
console.log("wrote", path.relative(ROOT, dest), `(${states.length} states)`);
