#!/usr/bin/env node
/* Build a standalone preview of the player with a mix actually loaded.

   The design inspector can only ever see the empty state, because it loads
   index.html without clicking anything and the app starts with no layers.
   This renders the screen as it really looks with five sounds playing, plus
   one row expanded and the awkward states (unavailable, muted, silent, an
   iOS video layer whose level cannot move), so the populated layout gets
   measured and looked at rather than assumed.

   It reuses index.html's own <style> block verbatim, so what you see is
   what the app renders. */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];

/* ---- the waveform ----
   Mirrors buildWave/waveShape/nearness in index.html. Duplicated rather than
   imported because index.html is a single self-contained file with no module
   boundary; if the curve is retuned, retune it in both places. */
const WAVE_STROKES = 150, WAVE_H = 30;
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
function speedLabel(v){
  if (v <= 0.3)  return "much slower";
  if (v <= 0.55) return "slower";
  if (v < 0.95)  return "a little slower";
  if (v < 1.05)  return "as recorded";
  if (v < 1.3)   return "a little faster";
  if (v < 1.8)   return "faster";
  return "much faster";
}

const GLYPH = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
  '<path d="M4 24c4 0 4-9 8-9s4 18 8 18 4-18 8-18 4 9 8 9"/><path d="M40 24h4" opacity=".45"/></svg>';
const PLAY = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 7.4v9.2a.9.9 0 0 0 1.37.77l7.03-4.35a.9.9 0 0 0 0-1.53L10.57 6.6a.9.9 0 0 0-1.37.8z"/></svg>';
const PAUSE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="8.4" y="6.9" width="2.9" height="10.2" rx="1.2"/><rect x="12.7" y="6.9" width="2.9" height="10.2" rx="1.2"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.4 5.6 9l1.4-1.4 5 5 5-5L18.4 9z"/></svg>';

function strokes(key, vol){
  const seed = waveSeed(key);
  let out = "";
  for (let i = 0; i < WAVE_STROKES; i++){
    out += `<i style="height:${(waveShape(seed, i) * WAVE_H).toFixed(1)}px"></i>`;
  }
  const scale = (0.14 + 0.86 * (vol / 100)).toFixed(3);
  return `<span class="strokes" style="transform:scaleY(${scale})">${out}</span>`;
}

function row(s){
  const cls = ["sound", s.playing && "playing", s.silent && "silent", s.gone && "gone"]
    .filter(Boolean).join(" ");
  const extras = s.open ? `
    <div class="extras">
      <div class="status">${s.status}</div>
      <div class="ctl"><div class="lab"><span>${s.synth ? "tone" : "speed"}</span><b>${s.synth ? s.tone : speedLabel(s.spd)}</b></div>
        <input type="range" value="${s.synth ? 50 : 60}"></div>
      <div class="foot-row">
        ${s.synth
          ? '<span class="tag-synth">built in</span>'
          : '<label class="toggle"><input type="checkbox" checked><span class="sw"></span>loop</label>'}
        <div class="spacer"></div>
        <button class="tvbtn${s.muted ? " active" : ""}">${s.muted ? "muted" : "mute"}</button>
        <button class="tvbtn">solo</button>
        ${s.synth || s.gone ? "" : '<button class="tvbtn">visualise</button>'}
        ${s.gone ? '<button class="tvbtn retry">retry</button>' : ""}
        <button class="remove">remove</button>
      </div>
    </div>` : "";
  return `
  <li class="${cls}">
    ${s.synth ? `<div class="thumb synth">${GLYPH}</div>` : '<div class="thumb"></div>'}
    <div class="band${s.vol > 0 ? "" : " off"}" role="slider" tabindex="0">
      <span class="cap"><span class="name">${s.name}</span><span class="near">${s.gone ? "unavailable" : s.inert ? "full volume (iOS)" : nearness(s.vol)}</span></span>
      <span class="wave">${strokes(s.key, s.vol)}</span>
    </div>
    <button class="playbtn">${s.playing ? PAUSE : PLAY}</button>
    <button class="more" aria-expanded="${s.open ? "true" : "false"}">${CHEV}</button>
    ${extras}
  </li>`;
}

const sounds = [
  { name: "Schwimmbad Geräusche zum Einschlafen und Entspannen (4 Stunden)", key: "aJK6xiAx_Mg", vol: 75, playing: true, spd: 1,
    status: '<span class="live">\u25cf playing</span> \u00b7 as recorded \u00b7 close' },
  { name: "The Cool River", key: "u3z2PO8W9ww", vol: 89, playing: true, spd: 0.75, open: true,
    status: '<span class="live">\u25cf playing</span> \u00b7 a little slower \u00b7 filling the room' },
  { name: "Rain", key: "rain", vol: 60, playing: true, synth: true, tone: "balanced",
    status: '<span class="live">\u25cf playing</span> \u00b7 balanced \u00b7 across the room' },
  { name: "Bathroom Ambience • Locker Room • Gym Background Sounds ~ Relax, Study, Sleep", key: "OuYtZhrFo4U", vol: 30, playing: true, silent: true, muted: true, spd: 1,
    status: '<span class="live">\u25cf playing</span> \u00b7 as recorded \u00b7 down the corridor \u00b7 muted' },
  { name: "Medieval Fantasy Tavern Ambience No Music", key: "tavern", vol: 22, gone: true, spd: 1,
    status: '<span class="gone">The owner has turned off playback on other sites.</span>' },
  { name: "Relaxing Locker Room Shower Sounds 10 Hours | Relaxation, Sleep, Study", key: "58R8J9OIxdI", vol: 0, spd: 1,
    status: 'paused \u00b7 as recorded \u00b7 silent' }
];

const out = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>murmur: the player, with a mix loaded</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
<main class="page">
  <p class="wordmark">murmur</p>
  <header class="now">
    <h1>indoor pool</h1>
    <p class="sum">4 sounds together.</p>
  </header>
  <ul class="sounds">
${sounds.map(row).join("\n")}
  </ul>
  <footer class="transport">
    <button class="primary with-ico">${PLAY}play all</button>
    <button class="with-ico">${PAUSE}pause all</button>
    <div class="spacer"></div>
    <button class="quiet">add a sound</button>
    <span class="sep">\u00b7</span>
    <button class="quiet">mixes</button>
    <span class="sep">\u00b7</span>
    <button class="quiet">more</button>
    <span class="left">about an hour left</span>
  </footer>
</main>
</body></html>`;

const dest = path.join(ROOT, ".dev", "preview-cards.html");
fs.writeFileSync(dest, out);
console.log("wrote", path.relative(ROOT, dest), `(${sounds.length} sounds, 1 expanded)`);

/* ---- the sheets ----
   They are position:fixed overlays that are hidden until opened, so the
   inspector can never see them. Lift the real markup straight out of
   index.html, unhide it and lay the three cards out in flow, so the panels
   that hold every build-a-mix control get looked at like everything else. */
const sheets = [...html.matchAll(/<section class="sheet"[\s\S]*?<\/section>/g)]
  .map(m => m[0].replace(' hidden>', '>'));

const sheetDoc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>murmur: the sheets</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500&display=swap" rel="stylesheet">
<style>${css}
  /* lay the overlays out in flow so all three can be seen at once */
  .sheet{position:static; background:none; display:block; padding:0; margin:0 auto 26px; max-width:760px}
  .sheet-card{max-height:none; border-bottom:1px solid var(--edge); border-radius:var(--radius)}
  body{padding:28px 20px}
</style></head>
<body>
${sheets.join("\n")}
</body></html>`;

const sdest = path.join(ROOT, ".dev", "preview-sheets.html");
fs.writeFileSync(sdest, sheetDoc);
console.log("wrote", path.relative(ROOT, sdest), `(${sheets.length} sheets)`);
