#!/usr/bin/env node
/* Build a standalone preview page showing the layer card in its real states,
   at the narrowest width the grid can produce.

   This exists so a human can open one file and see every card state at once
   instead of reproducing them by hand in the app, which needs network, a
   YouTube player and a lot of clicking to reach states like "unavailable".
   It reuses index.html's own <style> block verbatim, so what you see is what
   the app renders. */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];

/* ---- the waveform ----
   Mirrors buildWave/waveShape/nearness in index.html. Duplicated rather than
   imported because index.html is a single self-contained file with no module
   boundary; if the curve is ever retuned, retune it in both places. */
const WAVE_STROKES = 150, WAVE_H = 34;
function waveSeed(s){ let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000; return h; }
function waveShape(seed, i){
  const slow   = Math.sin(i * 0.019 + seed * 0.071);
  const swell  = Math.sin(i * 0.062 + seed * 0.031) * 0.85;
  const detail = Math.sin(i * 0.27  + seed * 0.013) * 0.45;
  return 0.16 + Math.abs((slow + swell + detail) / 2.30) * 0.84;
}
function nearness(v){
  if (v >= 85) return "filling the room";
  if (v >= 65) return "close";
  if (v >= 45) return "across the room";
  if (v >= 25) return "down the corridor";
  if (v >= 10) return "behind a door";
  if (v > 0)   return "almost gone";
  return "silent";
}
function wave(key, vol, inert){
  const seed = waveSeed(key);
  let strokes = "";
  for (let i = 0; i < WAVE_STROKES; i++){
    strokes += `<i style="height:${(waveShape(seed, i) * WAVE_H).toFixed(1)}px"></i>`;
  }
  const scale = (0.14 + 0.86 * (vol / 100)).toFixed(3);
  return `<div class="wave${vol > 0 ? "" : " off"}"${inert ? ' aria-disabled="true"' : ""}>` +
         `<span class="strokes" style="transform:scaleY(${scale})">${strokes}</span></div>`;
}

function card({ title, status, playing, silent, gone, vol, spd, loop,
                muted, soloed, visualising, retry, synth, tone, inert, key }) {
  const cls = ["layer", playing && "playing", silent && "silent", gone && "gone"]
    .filter(Boolean).join(" ");
  const GLYPH = '<svg viewBox="0 0 48 48" width="34" height="34" fill="none" ' +
    'stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
    '<path d="M4 24c4 0 4-9 8-9s4 18 8 18 4-18 8-18 4 9 8 9"/>' +
    '<path d="M40 24h4" opacity=".45"/></svg>';
  const PLAY = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M9.2 7.4v9.2a.9.9 0 0 0 1.37.77l7.03-4.35a.9.9 0 0 0 0-1.53L10.57 6.6a.9.9 0 0 0-1.37.8z"/></svg>';
  const PAUSE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="8.4" y="6.9" width="2.9" height="10.2" rx="1.2"/>' +
    '<rect x="12.7" y="6.9" width="2.9" height="10.2" rx="1.2"/></svg>';
  return `
<div class="${cls}">
  <div class="layer-head">
    ${synth ? `<div class="thumb synth">${GLYPH}</div>` : '<div class="thumb"></div>'}
    <div class="meta">
      <p class="title">${title}</p>
      <div class="status">${status}</div>
    </div>
    <button class="playbtn">${playing ? PAUSE : PLAY}</button>
  </div>
  <div class="ctl"><div class="lab"><span>Volume</span><b>${inert ? "full volume (iOS)" : nearness(vol)}</b></div>
    ${wave(key || title, vol, inert)}</div>
  ${synth
    ? `<div class="ctl"><div class="lab"><span>Tone</span><b>${tone.label}</b></div>
        <input type="range" min="0" max="100" value="${tone.v}" style="--val:${tone.v}%"></div>`
    : `<div class="ctl"><div class="lab"><span>Speed</span><b>${spd.toFixed(2)}×</b></div>
        <input type="range" min="0.25" max="2" step="0.25" value="${spd}"
          style="--val:${((spd - 0.25) / 1.75 * 100).toFixed(0)}%"></div>`}
  <div class="layer-foot">
    <div class="foot-row">
      ${synth
        ? '<span class="tag-synth">Synth</span>'
        : `<label class="toggle"><input type="checkbox" ${loop ? "checked" : ""}><span class="sw"></span>Loop</label>`}
      <div class="spacer"></div>
      <button class="tvbtn ${muted ? "active" : ""}">${muted ? "Muted" : "Mute"}</button>
      <button class="tvbtn ${soloed ? "active" : ""}">${soloed ? "Soloed" : "Solo"}</button>
    </div>
    <div class="foot-row">
      ${synth || gone ? "" : `<button class="tvbtn ${visualising ? "active" : ""}">${visualising ? "Visualising" : "Visualise"}</button>`}
      ${retry ? '<button class="tvbtn retry">Retry</button>' : ""}
      <div class="spacer"></div>
      <button class="remove">Remove</button>
    </div>
  </div>
</div>`;
}

const states = [
  { label: "Synth, playing", title: "Rain", key: "rain",
    status: '<span class="live">● playing</span> · balanced · close',
    playing: true, synth: true, tone: { v: 50, label: "balanced" }, vol: 70, spd: 1 },
  { label: "Synth, tone turned up", title: "Waves", key: "waves",
    status: '<span class="live">● playing</span> · brightest · across the room',
    playing: true, synth: true, tone: { v: 92, label: "brightest" }, vol: 48, spd: 1 },
  { label: "Synth, muted", title: "Brown noise", key: "brown",
    status: '<span class="live">● playing</span> · darker · down the corridor · muted',
    playing: true, silent: true, muted: true, synth: true,
    tone: { v: 28, label: "darker" }, vol: 40, spd: 1 },
  { label: "Playing", title: "Rain On Window with Thunder Sounds, 10 Hours", key: "aJK6xiAx_Mg",
    status: '<span class="live">● playing</span> · 1.00× · close',
    playing: true, vol: 76, spd: 1, loop: true },
  { label: "Paused", title: "The Wind in the Trees ( 10 Hours of Natural White Noise )", key: "u3z2PO8W9ww",
    status: "paused · 0.75× · down the corridor", vol: 42, spd: 0.75, loop: true },
  { label: "Quietest audible layer", title: "10 Hours Grandfather Clock Ticking Sounds For Deep Sleep", key: "OuYtZhrFo4U",
    status: '<span class="live">● playing</span> · 1.00× · behind a door · muted',
    playing: true, silent: true, muted: true, vol: 14, spd: 1, loop: true },
  { label: "Soloed", title: "Warm Cozy Fireplace 10 Hours", key: "58R8J9OIxdI",
    status: '<span class="live">● playing</span> · 1.00× · filling the room',
    playing: true, soloed: true, vol: 88, spd: 1, loop: true },
  { label: "Visualising", title: "UNDERWATER Ambience 10 Hours | DEEP SEA ASMR", key: "LmpR4O9-0z4",
    status: '<span class="live">● playing</span> · 1.00× · close',
    playing: true, visualising: true, vol: 70, spd: 1, loop: true },
  { label: "Unavailable (Retry, no Visualise)",
    title: "Medieval Fantasy Tavern Ambience No Music", key: "tavern",
    status: '<span class="gone">The owner has turned off playback on other sites.</span>',
    gone: true, retry: true, vol: 30, spd: 1, loop: true },
  { label: "iOS video layer (level is inert)", title: "Relaxing Jazz Instrumental in Cozy Coffee Shop", key: "uiMXGIG_DQo",
    status: '<span class="live">● playing</span> · 1.00× · full volume (iOS)',
    playing: true, inert: true, vol: 100, spd: 1, loop: true },
  { label: "Silent", title: "Aquarium Ambience, 10 Hours Sleep Sound", key: "V9vclVE4hjE",
    status: 'paused · 1.00× · silent', vol: 0, spd: 1, loop: true }
];

const out = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>murmur: card states preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500&display=swap" rel="stylesheet">
<style>${css}
  body{padding:32px}
  .note{max-width:900px; margin:0 auto 24px; color:var(--ink-soft); font-size:14px; line-height:1.6}
  .note h1{font-weight:400; color:var(--ink); font-size:22px; margin:0 0 8px}
  .cases{max-width:900px; margin:0 auto; display:flex; flex-wrap:wrap; gap:22px; align-items:flex-start}
  .case{width:320px}
  .case > .cap{font-size:13px; color:var(--ink-soft); margin:0 0 9px}
</style></head>
<body>
<div class="note">
  <h1>Layer card, every state</h1>
  <p>Each card is fixed at <b>320px</b>, the narrowest the grid
  (<code>minmax(320px,1fr)</code>) will ever render. If nothing overflows here,
  nothing overflows in the app. Styles are lifted verbatim from
  <code>index.html</code>, and the waveform uses the same curve, so a level
  reads here exactly as it reads in the app.</p>
</div>
<div class="cases">
${states.map(s => `<div class="case"><p class="cap">${s.label}</p>${card(s)}</div>`).join("\n")}
</div>
</body></html>`;

const dest = path.join(ROOT, ".dev", "preview-cards.html");
fs.writeFileSync(dest, out);
console.log("wrote", path.relative(ROOT, dest), `(${states.length} states)`);
