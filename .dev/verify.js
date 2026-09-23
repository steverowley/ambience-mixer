#!/usr/bin/env node
/* Verifies the app logic against the real index.html by running its actual
   IIFE in a stub DOM. No dependencies. Run: node .dev/verify.js */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  :: " + extra : "")); }
}

/* ---------- 1. Static assertions ---------- */
console.log("\n[static]");

ok("no backdrop-filter on bare button selector",
   !/\n\s*button\{[^}]*backdrop-filter/.test(html));
const bf = (html.match(/backdrop-filter:\s*blur/g) || []).length;
ok("backdrop-filter blur used sparingly (<=3: header, dock, dialog)", bf <= 3, "found " + bf);
ok("cardbreathe animates opacity", /@keyframes cardbreathe\{0%,100%\{opacity/.test(html));
ok("glow on ::after", /\.layer\.playing::after\{opacity:1; animation:cardbreathe/.test(html));
ok("renderMixes has no innerHTML for names", !/el\.innerHTML='<span class="name">'/.test(html));
ok("loop checkbox focusable", /\.toggle input\{position:absolute; width:1px/.test(html));
ok("extractId catch-all removed", !/m=input\.match\(\/\(\[a-zA-Z0-9_-\]\{11\}\)\/\)/.test(html));
ok("aurora pauses when hidden", /body\.hidden-tab \.aurora::before/.test(html));
ok("random start offset", /L\.offset=Math\.random\(\)\*\(d-30\)/.test(html));
ok("session persistence", /SESSION_KEY="ambience\.session\.v1"/.test(html));
ok("manifest linked", /<link rel="manifest"/.test(html));
ok("service worker registered", /navigator\.serviceWorker\.register/.test(html));

// batch two
ok("perceptual volume curve", /function perceptual\(v\)\{ return v\*v\/100; \}/.test(html));
ok("fade engine uses one rAF loop", /rampRAF=requestAnimationFrame\(stepRamps\)/.test(html));
ok("equal-power fade curve", /Math\.sin\(p\*Math\.PI\/2\)/.test(html));
ok("media session handlers registered", /setActionHandler/.test(html));
ok("wake lock dock toggle", /id="btnWake"/.test(html));
ok("share button present", /id="btnShare"/.test(html));
ok("hash load on boot", /if\(!loadFromHash\(\)\) restoreSession\(\)/.test(html));
ok("hashchange listener", /addEventListener\("hashchange"/.test(html));
ok("mute/solo buttons in card", /id="mute_'\+L\.uid/.test(html) && /id="solo_'\+L\.uid/.test(html));
ok("retry button in card", /id="retry_'\+L\.uid/.test(html));
ok("import validates layers", /function validLayer\(d\)/.test(html));
ok("import never clobbers", /renamed\+\+/.test(html));
ok("schema constant", /var SCHEMA=2/.test(html));
ok("save confirms overwrite", /A mix with that name already exists/.test(html));
ok("status text set via textContent for errors",
   /s\.firstChild\.textContent=L\.unavailable/.test(html));
ok("proprietary licence header in html", /All rights reserved/.test(html));
// P3 batch
ok("renderTitle exists for narrow updates", /function renderTitle\(L\)\{/.test(html));
ok("fetchTitle uses renderTitle not renderLayers", /L\.title=d\.title; renderTitle\(L\)/.test(html));
ok("no native prompt() calls", !/(?:^|[^a-zA-Z.])(?:window\.)?prompt\(/m.test(html.replace(/promptCopy/g,"X").replace(/Native prompt\(\)\/confirm\(\)/g,"X")));
ok("no native confirm() calls", !/(?:^|[^a-zA-Z.])(?:window\.)?confirm\(/m.test(html.replace(/askConfirm/g,"X").replace(/Native prompt\(\)\/confirm\(\)/g,"X")));
ok("in-app dialog markup present", /id="dlg"[^>]*role="dialog"/.test(html));
ok("dialog is aria-modal", /aria-modal="true"/.test(html));
ok("loadMix replace param removed", /function loadMix\(name,data\)\{/.test(html));
ok("no stale 3-arg loadMix calls", !/loadMix\([^)]*,true\)/.test(html));
ok("Fraunces self-hosted", /@font-face\{[\s\S]{0,200}fraunces-subset\.woff2/.test(html));
ok("Fraunces preloaded", /rel="preload" href="\/fraunces-subset\.woff2"/.test(html));
ok("Google Fonts no longer serves Fraunces", !/googleapis[^"]*Fraunces/.test(html));

/* ---------- 2. Runtime ---------- */
console.log("\n[runtime]");

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const app = scripts.find(s => s.includes("ambience.mixes.v1"));
if (!app) { console.log("  FAIL  could not extract app script"); process.exit(1); }

const byId = {};
function mkEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    children: [], style: { setProperty(){} },
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
    dispatch(ev, arg){ (this._listeners[ev]||[]).forEach(f=>f(arg||{target:this,preventDefault(){}})); },
    setAttribute(k,v){ this._attrs[k]=v; }, getAttribute(k){ return this._attrs[k]; },
    appendChild(c){ this.children.push(c); c.parentNode = this; return c; },
    remove(){ if(this.parentNode){ const i=this.parentNode.children.indexOf(this); if(i>=0) this.parentNode.children.splice(i,1); } },
    _all(){ const out=[]; (function walk(n){ n.children.forEach(c=>{ out.push(c); walk(c); }); })(this); return out; },
    _match(sel, n){ return sel.split(",").map(s=>s.trim()).some(s =>
      s.startsWith("#") ? n.id === s.slice(1)
      : s.startsWith(".") ? n._classes.has(s.slice(1))
      : n.tagName === s.toUpperCase()); },
    querySelector(sel){ return this._all().find(n => this._match(sel, n)) || null; },
    querySelectorAll(sel){ return this._all().filter(n => this._match(sel, n)); },
    focus(){}
  };
  el.classList = {
    add:(...c)=>c.forEach(x=>el._classes.add(x)),
    remove:(...c)=>c.forEach(x=>el._classes.delete(x)),
    toggle:(c,f)=>{ f ? el._classes.add(c) : el._classes.delete(c); },
    contains:(c)=>el._classes.has(c)
  };
  return el;
}
[ "grid","empty","presets","mixes","toast","urlInput","btnAdd","btnPlayAll","btnStopAll",
  "btnClearAll","btnWake","masterVol","btnSave","btnShare","btnExport","btnImport","fileImport",
  "sleepSel","timerLeft","shade","catch","tbar","tname","tvol","tdim","tplay","tfit","texit",
  "hint","noMixes","resume","resumeCount","btnResume","btnDiscard",
  "dlg","dlgTitle","dlgBody","dlgInput","dlgOk","dlgCancel"
].forEach(id => { byId[id] = mkEl("div"); byId[id].id = id; });
byId.masterVol.value="100"; byId.masterVol.min="0"; byId.masterVol.max="100";
byId.tvol.value="60"; byId.tvol.min="0"; byId.tvol.max="100";
byId.tdim.value="35"; byId.tdim.min="0"; byId.tdim.max="85";
byId.sleepSel.value="0";

const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
const body = mkEl("body");
const document_ = {
  body, hidden:false, visibilityState:"visible", activeElement:null,
  getElementById: id => byId[id] || null, createElement: mkEl,
  addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }
};
const toasts = [];
const mediaActions = {};
let rafQueue = [];
const sandbox = {
  URL: URL,
  document: document_, localStorage,
  window: { innerWidth:1280, innerHeight:800, addEventListener(){}, prompt:()=>null,
            location:{origin:"https://x",pathname:"/",protocol:"https:",hostname:"x",hash:""} },
  location: { origin:"https://x", pathname:"/", protocol:"https:", hostname:"x", hash:"" },
  navigator: {
    mediaSession: {
      metadata:null, playbackState:"none",
      setActionHandler(a,f){ mediaActions[a]=f; }
    },
    clipboard: { writeText: t => { sandbox.__copied = t; return Promise.resolve(); } }
  },
  MediaMetadata: function(o){ Object.assign(this,o); },
  requestAnimationFrame: f => { rafQueue.push(f); return rafQueue.length; },
  cancelAnimationFrame(){},
  setTimeout: (f)=>0, clearTimeout(){}, setInterval(){ return 0; }, clearInterval(){},
  fetch: () => Promise.resolve({ ok:false }),
  console, Math, Date, JSON, Object, Array, String, Number, isFinite, parseInt, parseFloat,
  decodeURIComponent, encodeURIComponent, RegExp,
  Blob: function(){}, URL:{ createObjectURL(){return "";}, revokeObjectURL(){} },
  FileReader: function(){ this.readAsText = () => { this.onload && this.onload(); }; },
  prompt: () => "test", confirm: () => true, alert(){},
  YT: { Player: function(id,opts){ this.opts=opts; this.destroy=()=>{}; this.setVolume=v=>{this._v=v;};
        this.getVideoData=()=>({}); this.playVideo=()=>{}; this.pauseVideo=()=>{};
        this.setPlaybackRate=()=>{}; this.seekTo=()=>{}; this.getDuration=()=>36000;
        this.getAvailablePlaybackRates=()=>[0.25,0.5,0.75,1,1.25,1.5,1.75,2]; },
       PlayerState:{ENDED:0,PLAYING:1,PAUSED:2} }
};
sandbox.window.document = document_;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const probe = app.replace(/\}\)\(\);\s*$/,
 `  globalThis.__t={extractId:extractId, effectiveVol:effectiveVol, perceptual:perceptual,
      setFade:function(v){fadeFactor=v;}, addLayer:addLayer, layers:function(){return layers;},
      renderMixes:renderMixes, loadMixes:loadMixes, storeMixes:storeMixes,
      encodeMix:encodeMix, decodeMix:decodeMix, validLayer:validLayer, cleanLayer:cleanLayer,
      toggleMute:toggleMute, toggleSolo:toggleSolo, solo:function(){return soloLayer;},
      importMixes:importMixes, shareMix:shareMix, updateMediaSession:updateMediaSession,
      saveSessionNow:function(){ try{ localStorage.setItem(SESSION_KEY, JSON.stringify(
        {v:2,layers:currentMixData(),master:masterVolume,dim:dimLevel,fit:fitMode,
         wake:wakeWanted,name:currentMixName,
         solo:soloLayer?layers.indexOf(soloLayer):-1,sleep:0})); }catch(e){} }};
})();`);

try { vm.runInContext(probe, sandbox, { timeout: 5000 }); }
catch (e) { console.log("  FAIL  app threw on init :: " + e.message); process.exit(1); }
const T = sandbox.__t;
ok("app initialises without throwing", !!T);

// extractId
ok("extractId: bare ID", T.extractId("x7SQaDTSrVg") === "x7SQaDTSrVg");
ok("extractId: watch URL", T.extractId("https://www.youtube.com/watch?v=x7SQaDTSrVg") === "x7SQaDTSrVg");
ok("extractId: youtu.be", T.extractId("https://youtu.be/x7SQaDTSrVg") === "x7SQaDTSrVg");
ok("extractId REJECTS Spotify", T.extractId("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT") === null);
ok("extractId REJECTS prose", T.extractId("please play some rainfall for me") === null);

// perceptual curve
ok("perceptual(100) === 100", T.perceptual(100) === 100);
ok("perceptual(50) === 25 (not 50)", T.perceptual(50) === 25);
ok("perceptual(0) === 0", T.perceptual(0) === 0);

// volume + fade
const L1 = { volume: 100 };
ok("full volume at master 100", T.effectiveVol(L1) === 100, "got " + T.effectiveVol(L1));
T.setFade(0.5);
ok("fadeFactor halves output", T.effectiveVol(L1) === 50, "got " + T.effectiveVol(L1));
T.setFade(0);
ok("fade 0 silences", T.effectiveVol(L1) === 0);
T.setFade(1);
ok("muted layer is silent", T.effectiveVol({volume:100, muted:true}) === 0);
ok("per-layer fade multiplies", T.effectiveVol({volume:100, fade:0.25}) === 25);
ok("volume clamps to 0..100", T.effectiveVol({volume:100, fade:5}) === 100);

// share round-trip
const mix = [
  {videoId:"x7SQaDTSrVg", volume:76, speed:1,    loop:true,  muted:false},
  {videoId:"TpReQ1XXQzs", volume:42, speed:0.75, loop:true,  muted:true},
  {videoId:"4KzFe50RQkQ", volume:26, speed:1,    loop:false, muted:false}
];
const enc = T.encodeMix(mix);
const dec = T.decodeMix(enc);
ok("share: encodes all layers", dec.length === 3, "got " + dec.length);
ok("share: preserves videoIds", dec.every((d,i) => d.videoId === mix[i].videoId));
ok("share: preserves volumes", dec.every((d,i) => d.volume === mix[i].volume));
ok("share: preserves speeds", dec.every((d,i) => d.speed === mix[i].speed), JSON.stringify(dec.map(d=>d.speed)));
ok("share: preserves loop flags", dec.every((d,i) => d.loop === mix[i].loop), JSON.stringify(dec.map(d=>d.loop)));
ok("share: preserves muted flags", dec.every((d,i) => d.muted === mix[i].muted));
ok("share: URL-safe charset only", /^[A-Za-z0-9_\-.,]+$/.test(enc), enc);
ok("share: survives a full URL round-trip",
   T.decodeMix(new URL("https://x/#m=" + enc).hash.replace(/^#m=/, "")).length === 3);
ok("share: rejects junk ids", T.decodeMix("notanid.50.1.l,<script>.50.1.l").length === 0);
ok("share: clamps out-of-range volume", T.decodeMix("x7SQaDTSrVg.999.1.l")[0].volume === 100);
ok("share: tolerates empty input", T.decodeMix("").length === 0);

// import validation
ok("validLayer accepts a good layer", T.validLayer({videoId:"x7SQaDTSrVg",volume:50,speed:1}));
ok("validLayer rejects bad id", !T.validLayer({videoId:"nope",volume:50,speed:1}));
ok("validLayer rejects out-of-range volume", !T.validLayer({videoId:"x7SQaDTSrVg",volume:500}));
ok("validLayer rejects out-of-range speed", !T.validLayer({videoId:"x7SQaDTSrVg",speed:99}));
ok("validLayer rejects null", !T.validLayer(null));
ok("cleanLayer caps title length",
   T.cleanLayer({videoId:"x7SQaDTSrVg",title:"z".repeat(1000)}).title.length === 300);

// import: no clobber
T.storeMixes({ "Rainy night": [{videoId:"x7SQaDTSrVg",volume:50,speed:1,loop:true}] });
const before = Object.keys(T.loadMixes());
sandbox.FileReader = function(){
  this.readAsText = () => {
    this.result = JSON.stringify({ app:"ambience", version:2, saved:{
      "Rainy night":[{videoId:"TpReQ1XXQzs",volume:40,speed:1,loop:true}] } });
    this.onload && this.onload();
  };
};
T.importMixes({});
const after = Object.keys(T.loadMixes());
ok("import does not overwrite an existing mix", after.length === before.length + 1,
   JSON.stringify(after));
ok("import suffixes the duplicate", after.some(n => /\(2\)$/.test(n)), JSON.stringify(after));
ok("original mix untouched",
   T.loadMixes()["Rainy night"][0].videoId === "x7SQaDTSrVg");

// import: rejects foreign / future files
sandbox.FileReader = function(){
  this.readAsText = () => { this.result = JSON.stringify({app:"somethingelse",saved:{x:[]}}); this.onload&&this.onload(); };
};
const beforeForeign = Object.keys(T.loadMixes()).length;
T.importMixes({});
ok("import rejects a foreign app file", Object.keys(T.loadMixes()).length === beforeForeign);

sandbox.FileReader = function(){
  this.readAsText = () => { this.result = JSON.stringify({app:"ambience",version:99,saved:{y:[]}}); this.onload&&this.onload(); };
};
T.importMixes({});
ok("import rejects a newer schema", Object.keys(T.loadMixes()).length === beforeForeign);

// XSS
T.storeMixes({});
const evil = '<img src=x onerror="globalThis.__pwned=1">';
T.storeMixes({ [evil]: [] });
T.renderMixes();
const chip = byId.mixes.children.find(c => c.classList.contains("mix"));
const nameSpan = chip && chip.children[0];
ok("malicious mix name renders as a chip", !!chip);
ok("name set via textContent", nameSpan && nameSpan.textContent === evil);
ok("no script executed", sandbox.__pwned === undefined);
ok("chip keyboard reachable", nameSpan && nameSpan.getAttribute("tabindex") === "0");

// mute / solo semantics
T.storeMixes({});
const A = T.addLayer({videoId:"x7SQaDTSrVg", title:"A", volume:80});
const B = T.addLayer({videoId:"TpReQ1XXQzs", title:"B", volume:80});
T.toggleSolo(A);
ok("solo: soloed layer audible", T.effectiveVol(A) > 0);
ok("solo: other layers silenced", T.effectiveVol(B) === 0);
T.toggleSolo(A);
ok("solo: toggling off restores others", T.effectiveVol(B) > 0);
T.toggleMute(B);
ok("mute: silences that layer", T.effectiveVol(B) === 0);
ok("mute: preserves its volume value", B.volume === 80);
ok("mute: leaves other layers alone", T.effectiveVol(A) > 0);
T.toggleMute(B);
ok("unmute restores", T.effectiveVol(B) > 0);

// media session
T.updateMediaSession();
ok("media session metadata set", !!sandbox.navigator.mediaSession.metadata);
ok("media session has artwork", (sandbox.navigator.mediaSession.metadata.artwork||[]).length === 2);
ok("media session registers play", typeof mediaActions.play === "function");
ok("media session registers pause", typeof mediaActions.pause === "function");
ok("media session registers stop", typeof mediaActions.stop === "function");

// session round-trip
T.saveSessionNow();
const sess = JSON.parse(store["ambience.session.v1"] || "null");
ok("session written", !!sess);
ok("session records layers", sess && sess.layers.length === 2);
ok("session records mute state", sess && typeof sess.layers[0].muted === "boolean");
ok("session records wake preference", sess && "wake" in sess);
ok("session key separate from mixes", store["ambience.session.v1"] !== store["ambience.mixes.v1"]);

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
