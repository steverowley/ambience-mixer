#!/usr/bin/env node
/* Bug hunt: drive the real app through hostile and edge-case sequences and
   assert invariants, rather than testing the happy path.

   This is deliberately adversarial — imported files, rapid toggling,
   removal mid-fade, states the UI cannot reach but data can.
   Run: node .dev/audit.js */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
let issues = [];
function bug(severity, area, what) { issues.push({ severity, area, what }); }
function check(cond, severity, area, what) { if (!cond) bug(severity, area, what); }

/* ---------- static invariants ---------- */

// 1. Every key written to the session must be read back.
const written = (html.match(/localStorage\.setItem\(SESSION_KEY,JSON\.stringify\(\{([\s\S]*?)\}\)\)/) || [])[1] || "";
// Strip comments first, or prose inside them is parsed as key names.
const writtenClean = written.replace(/\/\*[\s\S]*?\*\//g, "");
const writtenKeys = [...writtenClean.matchAll(/(\w+)\s*:/g)].map(m => m[1]).filter(k => k !== "v");
const restoreFn = (html.match(/function restoreSession\(\)\{([\s\S]*?)\n  \}/) || [])[1] || "";
for (const k of writtenKeys) {
  if (k === "layers") continue;
  if (!new RegExp(`d\\.${k}\\b`).test(restoreFn)) {
    bug("MEDIUM", "session", `saveSession writes "${k}" but restoreSession never reads it`);
  }
}

// 2. Theatre mode is video-only; nothing should be able to target a synth.
if (!/function enterTheatre\(L\)\{[\s\S]{0,400}isSynth\(L\)\) return/.test(html)) {
  bug("HIGH", "theatre", "enterTheatre() has no guard against synth layers — an imported mix with {kind:'wa', visualiser:true} would blow a 66px gradient tile fullscreen with no video");
}

// 3. Unguarded element lookups, but only for IDs that some card variant omits.
//    vlab_/slab_/title_ exist on every card; loop_/spd_/tone_/tv_/retry_ do not.
const variantOnly = ["loop_", "spd_", "tone_", "tv_", "retry_"];
const idRefs = [...html.matchAll(/document\.getElementById\("(\w+_)"\+L\.uid\)(\.\w+)/g)];
for (const m of idRefs) {
  if (variantOnly.includes(m[1])) {
    bug("HIGH", "render", `unguarded getElementById("${m[1]}") + ${m[2]} — that element is absent on the other card variant, so this throws`);
  }
}

// 4. Timers that must be cleared on teardown.
const timerVars = ["sleepTimer", "sleepTick", "idleT", "toastT", "sessionT"];
for (const t of timerVars) {
  const set = (html.match(new RegExp(`${t}\\s*=\\s*set(Timeout|Interval)`, "g")) || []).length;
  const clear = (html.match(new RegExp(`clear(Timeout|Interval)\\(${t}\\)`, "g")) || []).length;
  if (set && !clear) bug("MEDIUM", "timers", `${t} is set but never cleared`);
}

// 5. Sleep timer must survive a reload, or a 2h timer silently dies on refresh.
if (!/sleepEndsAt/.test(restoreFn) && !/endsAt/.test(written)) {
  bug("MEDIUM", "sleep", "the sleep timer's end time is never persisted — refreshing, or the phone evicting the tab, silently cancels a running timer and audio plays all night");
}

// 6. A 400ms debounced save loses the last change if the tab closes first.
if (/sessionT=setTimeout/.test(html) && !/addEventListener\("(pagehide|beforeunload)"/.test(html)) {
  bug("MEDIUM", "session", "saveSession is debounced 400ms with no pagehide/beforeunload flush — the last change before closing the tab is lost");
}

// 7. ENDED with loop off leaves the card claiming to play.
if (/ENDED && L\.loop/.test(html) && !/ENDED[\s\S]{0,200}else[\s\S]{0,60}playing=false/.test(html)) {
  bug("MEDIUM", "playback", "when a video ends and Loop is off, L.playing is never cleared — the card keeps showing 'playing' and a glowing border over silence");
}

// 8. Loop is meaningless on a synth (they are endless), but is still stored.
if (/loop:L\.loop/.test(html) && !/delete base\.loop/.test(html)) {
  bug("LOW", "synth", "loop is persisted for synth layers where it has no meaning — harmless but it makes shared links and exports carry a lie");
}

/* ---------- runtime: drive the app ---------- */
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const app = scripts.find(s => s.includes("ambience.mixes.v1"));

const byId = {};
function mkEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(), children: [], style: { setProperty(){} },
    _classes: new Set(), _listeners: {}, _attrs: {},
    set className(v){ this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get className(){ return [...this._classes].join(" "); },
    set innerHTML(v){
      this._html = v; this.children = [];
      [...String(v).matchAll(/id="([^"]+)"/g)].map(m => m[1]).forEach(id => {
        const c = mkEl("div"); c.id = id; this.appendChild(c); byId[id] = c;
      });
    },
    get innerHTML(){ return this._html || ""; },
    textContent: "", value: "", checked: false, hidden: false, title: "",
    addEventListener(ev, fn){ (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    setAttribute(k,v){ this._attrs[k]=v; }, getAttribute(k){ return this._attrs[k]; },
    appendChild(c){ this.children.push(c); c.parentNode = this; return c; },
    remove(){ if(this.parentNode){ const i=this.parentNode.children.indexOf(this); if(i>=0) this.parentNode.children.splice(i,1); } },
    _all(){ const out=[]; (function walk(n){ n.children.forEach(c=>{ out.push(c); walk(c); }); })(this); return out; },
    _match(sel, n){ return sel.split(",").map(s=>s.trim()).some(s =>
      s.startsWith("#") ? n.id === s.slice(1)
      : s.startsWith(".") ? n._classes.has(s.slice(1)) : n.tagName === s.toUpperCase()); },
    querySelector(sel){ return this._all().find(n => this._match(sel, n)) || null; },
    querySelectorAll(sel){ return this._all().filter(n => this._match(sel, n)); },
    focus(){}
  };
  el.classList = {
    add:(...c)=>c.forEach(x=>el._classes.add(x)), remove:(...c)=>c.forEach(x=>el._classes.delete(x)),
    toggle:(c,f)=>{ f ? el._classes.add(c) : el._classes.delete(c); }, contains:(c)=>el._classes.has(c)
  };
  return el;
}
["grid","empty","presets","mixes","toast","urlInput","btnAdd","btnPlayAll","btnStopAll",
 "btnClearAll","btnWake","masterVol","btnSave","btnShare","btnExport","btnImport","fileImport",
 "sleepSel","timerLeft","shade","catch","tbar","tname","tvol","tdim","tplay","tfit","texit",
 "hint","noMixes","resume","resumeCount","btnResume","btnDiscard","dlg","dlgTitle","dlgBody",
 "dlgInput","dlgOk","dlgCancel","tall","tallLabel","synths"
].forEach(id => { byId[id] = mkEl("div"); byId[id].id = id; });
byId.masterVol.value="100"; byId.masterVol.min="0"; byId.masterVol.max="100";
byId.tvol.value="60"; byId.tvol.min="0"; byId.tvol.max="100";
byId.tdim.value="35"; byId.tdim.min="0"; byId.tdim.max="85";
byId.sleepSel.value="0";

const store = {};
const body = mkEl("body");
let rafQueue = [];
const timeouts = [];
const sandbox = {
  document: { body, hidden:false, visibilityState:"visible", activeElement:null,
    getElementById: id => byId[id] || null, createElement: mkEl,
    addEventListener(){}, querySelector(){return null;}, querySelectorAll(){return [];} },
  localStorage: { getItem: k => (k in store ? store[k] : null),
    setItem: (k,v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  window: { innerWidth:1280, innerHeight:800, addEventListener(){}, prompt:()=>null,
            location:{origin:"https://x",pathname:"/",protocol:"https:",hostname:"x",hash:""} },
  location: { origin:"https://x", pathname:"/", protocol:"https:", hostname:"x", hash:"" },
  navigator: { mediaSession:{ metadata:null, playbackState:"none", setActionHandler(){} },
               clipboard:{ writeText:()=>Promise.resolve() } },
  MediaMetadata: function(o){ Object.assign(this,o); },
  AudioContext: function(){
    const mk=(t)=>{const n={type:t,_conns:[],connect(x){this._conns.push(x);return x;},disconnect(){n._disc=true;},
      start(){n._started=true;},stop(){n._stopped=true;}};return n;};
    this.state="running"; this.currentTime=0; this.sampleRate=48000;
    this.destination=mk("destination"); this.resume=()=>{this.state="running";};
    this._created=[]; const track=n=>{this._created.push(n);return n;};
    this.createGain=()=>track(Object.assign(mk("gain"),{gain:{value:1,setTargetAtTime(v){this.value=v;}}}));
    this.createOscillator=()=>track(Object.assign(mk("osc"),{frequency:{value:0},detune:{value:0}}));
    this.createBiquadFilter=()=>track(Object.assign(mk("biquad"),{frequency:{value:0},Q:{value:0},gain:{value:0}}));
    this.createBufferSource=()=>track(Object.assign(mk("bufsrc"),{buffer:null,loop:false,playbackRate:{value:1}}));
    this.createBuffer=(c,l,r)=>({length:l,sampleRate:r,numberOfChannels:c,getChannelData:()=>new Float32Array(l)});
  },
  requestAnimationFrame: f => { rafQueue.push(f); return rafQueue.length; },
  cancelAnimationFrame(){},
  setTimeout: (f,ms)=>{ timeouts.push({f,ms}); return timeouts.length; },
  clearTimeout(){}, setInterval(){ return 0; }, clearInterval(){},
  fetch: () => Promise.resolve({ ok:false }),
  console: { log(){}, warn(){}, error(){} },
  Math, Date, JSON, Object, Array, String, Number, isFinite, parseInt, parseFloat,
  decodeURIComponent, encodeURIComponent, RegExp, URL,
  Blob: function(){}, URL_: null,
  FileReader: function(){ this.readAsText=()=>{ this.onload&&this.onload(); }; },
  prompt: ()=> "x", confirm: ()=> true, alert(){},
  YT: { Player: function(id,opts){ this.opts=opts; this.destroy=()=>{this._destroyed=true;};
        this.setVolume=v=>{this._v=v;}; this.getVideoData=()=>({}); this.playVideo=()=>{this._playing=true;};
        this.pauseVideo=()=>{this._playing=false;}; this.setPlaybackRate=()=>{}; this.seekTo=()=>{};
        this.getDuration=()=>36000; this.getAvailablePlaybackRates=()=>[0.25,0.5,0.75,1,1.25,1.5,1.75,2]; },
      PlayerState:{ENDED:0,PLAYING:1,PAUSED:2} }
};
sandbox.URL = { createObjectURL:()=>"", revokeObjectURL(){} };
sandbox.window.document = sandbox.document;
sandbox.window.AudioContext = sandbox.AudioContext;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const probe = app.replace(/\}\)\(\);\s*$/,
 `  globalThis.__t={addLayer:addLayer,removeLayer:removeLayer,layers:function(){return layers;},
     playLayer:playLayer,stopLayer:stopLayer,playAll:playAll,stopAll:stopAll,clearAll:clearAll,
     effectiveVol:effectiveVol,applyVolume:applyVolume,toggleMute:toggleMute,toggleSolo:toggleSolo,
     solo:function(){return soloLayer;},enterTheatre:enterTheatre,exitTheatre:exitTheatre,
     theatre:function(){return theatreLayer;},setSleep:setSleep,fade:function(){return fadeFactor;},
     ramps:function(){return ramps;},encodeMix:encodeMix,decodeMix:decodeMix,
     cleanLayer:cleanLayer,validLayer:validLayer,storeMixes:storeMixes,loadMixes:loadMixes,
     loadMix:loadMix,currentMixData:currentMixData,importMixes:importMixes,
     isSynth:isSynth,retryLayer:retryLayer,stepRamps:stepRamps,
     master:function(v){ if(v!=null) masterVolume=v; return masterVolume; }};
})();`);

try { vm.runInContext(probe, sandbox, { timeout: 5000 }); }
catch (e) { bug("CRITICAL", "init", "app threw on load: " + e.message); }
const T = sandbox.__t;

if (T) {
  const reset = () => { T.layers().slice().forEach(T.removeLayer); };

  // A. Theatre pointed at a synth layer via imported data.
  reset();
  const syn = T.addLayer({ synth: "rain", volume: 50, autoplay: false });
  try {
    T.enterTheatre(syn);
    if (T.theatre() === syn) {
      bug("HIGH", "theatre", "enterTheatre() accepted a synth layer — there is no video to show, so the visualiser fills the screen with an empty tile");
    }
    T.exitTheatre();
  } catch (e) { bug("HIGH", "theatre", "enterTheatre() on a synth layer threw: " + e.message); }

  // B. Removing a layer mid-fade must not leave an orphaned ramp.
  reset();
  const a = T.addLayer({ videoId: "x7SQaDTSrVg", volume: 80, autoplay: false });
  a.ready = true;
  T.playLayer(a);                     // starts a fade-in ramp
  const hadRamp = T.ramps().length > 0;
  T.removeLayer(a);
  if (hadRamp && T.ramps().some(r => r.L === a)) {
    bug("HIGH", "fade", "removeLayer() left a ramp pointing at a destroyed layer — the rAF loop keeps calling applyVolume on it forever");
  }

  // C. Solo + remove the soloed layer: everything must not stay silenced.
  reset();
  const s1 = T.addLayer({ videoId: "x7SQaDTSrVg", volume: 80, autoplay: false });
  const s2 = T.addLayer({ videoId: "TpReQ1XXQzs", volume: 80, autoplay: false });
  T.toggleSolo(s1);
  T.removeLayer(s1);
  if (T.effectiveVol(s2) === 0) {
    bug("CRITICAL", "solo", "removing a soloed layer leaves every other layer silent with no visible cause");
  }

  // D. Sleep timer then clearAll: fadeFactor must not stick.
  reset();
  const d1 = T.addLayer({ videoId: "x7SQaDTSrVg", volume: 100, autoplay: false });
  d1.ready = true;
  T.setSleep(15);
  T.setSleep(0);
  if (T.fade() !== 1) bug("HIGH", "sleep", "cancelling the sleep timer left fadeFactor at " + T.fade() + " — every layer stays quiet");

  // E. Import a mix naming a synth that does not exist.
  reset();
  const bad = T.decodeMix("snotasynth.50.50.l");
  if (bad.length) bug("MEDIUM", "import", "decodeMix accepted an unknown synth id");

  // F. Import a layer with visualiser:true on a synth.
  const cleaned = T.cleanLayer({ kind: "wa", synth: "rain", visualiser: true });
  if (cleaned.visualiser === true) {
    bug("HIGH", "import", "cleanLayer preserves visualiser:true on a synth layer, which later calls enterTheatre() on something with no video");
  }

  // G. Master volume 0 then mute/unmute: must not resurrect audio.
  reset();
  const g1 = T.addLayer({ videoId: "x7SQaDTSrVg", volume: 80, autoplay: false });
  T.master(0);
  if (T.effectiveVol(g1) !== 0) bug("HIGH", "volume", "master at 0 does not silence a layer");
  T.toggleMute(g1); T.toggleMute(g1);
  if (T.effectiveVol(g1) !== 0) bug("HIGH", "volume", "mute/unmute cycle ignores master at 0");
  T.master(100);

  // H. clearAll while a layer is soloed.
  reset();
  const h1 = T.addLayer({ videoId: "x7SQaDTSrVg", volume: 80, autoplay: false });
  T.toggleSolo(h1);
  T.clearAll();
  if (T.solo() !== null) bug("MEDIUM", "solo", "clearAll left soloLayer pointing at a removed layer");

  // I. Duplicate detection.
  reset();
  T.addLayer({ videoId: "x7SQaDTSrVg", volume: 60, autoplay: false });
  T.addLayer({ videoId: "x7SQaDTSrVg", volume: 60, autoplay: false });
  if (T.layers().length === 2 && !/already a layer/.test(html)) {
    bug("LOW", "ux", "the same video can be added twice with no warning — two decoders playing identical audio, which just sounds like phasing");
  }

  // J. Retry on a layer that was never unavailable.
  reset();
  const j1 = T.addLayer({ videoId: "x7SQaDTSrVg", volume: 60, autoplay: false });
  try { T.retryLayer(j1); } catch (e) { bug("LOW", "retry", "retryLayer threw on a healthy layer: " + e.message); }

  // K. Synth layer + stopLayer(instant) then play: graph must survive.
  reset();
  const k1 = T.addLayer({ synth: "waves", volume: 60, autoplay: false });
  T.playLayer(k1, true); T.stopLayer(k1, true); T.playLayer(k1, true);
  if (!k1.wa) bug("HIGH", "synth", "pausing then playing a synth layer destroyed its graph");
}

/* ---------- report ---------- */
const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
issues.sort((a, b) => order[a.severity] - order[b.severity]);
console.log("\n=== Ambience bug audit ===\n");
if (!issues.length) console.log("  No issues found.\n");
for (const i of issues) {
  console.log(`  [${i.severity}] ${i.area}: ${i.what}`);
}
console.log(`\n  ${issues.length} issue(s)\n`);
/* In CI a found bug must fail the build; locally it is a report to read. */
if (process.argv.includes("--ci") && issues.some(i => i.severity !== "LOW")) process.exit(1);
