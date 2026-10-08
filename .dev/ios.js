#!/usr/bin/env node
/* Run the real app under an iPhone user agent and assert the behaviour
   changes, rather than trusting that the code reads correctly.
   Run: node .dev/ios.js */

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  :: " + extra : "")); }
}

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function run(ua, touchPoints, opts) {
  opts = opts || {};
  const byId = {};
  const listeners = {};
  function mkEl(tag) {
    const el = {
      tagName: (tag || "div").toUpperCase(), children: [], style: { setProperty(){} },
      _classes: new Set(), _listeners: {}, _attrs: {},
      set className(v){ this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
      get className(){ return [...this._classes].join(" "); },
      set innerHTML(v){
        this._html = v; this.children = [];
        /* Every id in the markup, with whether that tag carries `disabled`
           and any title — enough for the app to find and drive its controls. */
        const tags = String(v).match(/<[a-zA-Z][^>]*>/g) || [];
        for (const t of tags) {
          const id = (t.match(/id="([^"]+)"/) || [])[1];
          if (!id) continue;
          const c = mkEl((t.match(/^<(\w+)/) || [])[1]);
          c.id = id;
          if (/\sdisabled(?=[\s>])/.test(t)) c.disabled = true;
          const ti = t.match(/\stitle="([^"]*)"/);
          if (ti) c.title = ti[1];
          this.appendChild(c); byId[id] = c;
        }
      },
      get innerHTML(){ return this._html || ""; },
      textContent: "", value: "", checked: false, hidden: false, title: "", disabled: false,
      addEventListener(ev, fn){ (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
      setAttribute(k,v){ this._attrs[k]=v; }, getAttribute(k){ return this._attrs[k]; },
      removeAttribute(k){ delete this._attrs[k]; if(k==="title") this.title=""; },
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
   "dlgInput","dlgOk","dlgCancel","tall","tallLabel","synths","update","btnUpdate",
   "btnUpdateLater","iosNote","btnIosOk","wakeLabel"
  ].forEach(id => { byId[id] = mkEl("div"); byId[id].id = id; });
  byId.masterVol.value="100"; byId.masterVol.min="0"; byId.masterVol.max="100";
  byId.tvol.value="60"; byId.tdim.value="35"; byId.sleepSel.value="0";
  /* These carry the `hidden` attribute in the real markup. */
  byId.iosNote.hidden = true; byId.update.hidden = true; byId.resume.hidden = true;

  const store = {};
  const body = mkEl("body");
  const dock = mkEl("div"); dock.className = "dock";
  let ctxResumes = 0;
  const sandbox = {
    document: { body, hidden:false, visibilityState:"visible", activeElement:null,
      getElementById: id => byId[id] || null, createElement: mkEl,
      addEventListener(ev,fn){ (listeners[ev]=listeners[ev]||[]).push(fn); },
      querySelector: sel => (sel === ".dock" ? dock : null),
      querySelectorAll: () => [] },
    localStorage: { getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; } },
    navigator: Object.assign({ userAgent: ua, maxTouchPoints: touchPoints,
      mediaSession:{ metadata:null, playbackState:"none", setActionHandler(){} },
      clipboard:{ writeText:()=>Promise.resolve() } },
      /* Only Chromium ships Wake Lock; Safari has never had it. */
      opts.wakeLock ? { wakeLock:{ request:()=>Promise.resolve({release(){}}) } } : {}),
    MediaMetadata: function(o){ Object.assign(this,o); },
    AudioContext: function(){
      const mk=(t)=>{const n={type:t,connect(x){return x;},disconnect(){},start(){},stop(){}};return n;};
      this.state="suspended"; this.currentTime=0; this.sampleRate=48000;
      this.destination=mk("destination");
      this.resume=()=>{ ctxResumes++; this.state="running"; return Promise.resolve(); };
      this.createGain=()=>Object.assign(mk("gain"),{gain:{value:1,setTargetAtTime(){}}});
      this.createOscillator=()=>Object.assign(mk("osc"),{frequency:{value:0},detune:{value:0}});
      this.createBiquadFilter=()=>Object.assign(mk("bq"),{frequency:{value:0},Q:{value:0},gain:{value:0}});
      this.createBufferSource=()=>Object.assign(mk("bs"),{buffer:null,loop:false,playbackRate:{value:1}});
      this.createBuffer=(c,l,r)=>({length:l,sampleRate:r,numberOfChannels:c,getChannelData:()=>new Float32Array(l)});
    },
    requestAnimationFrame: ()=>1, cancelAnimationFrame(){},
    setTimeout: ()=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
    fetch: () => Promise.resolve({ ok:false }),
    console: { log(){}, warn(){}, error(){} },
    Math, Date, JSON, Object, Array, String, Number, isFinite, parseInt, parseFloat,
    decodeURIComponent, encodeURIComponent, RegExp, Float32Array,
    prompt: ()=>null, confirm: ()=>true, alert(){},
    Blob: function(){}, FileReader: function(){},
    URL: { createObjectURL:()=>"", revokeObjectURL(){} }
  };
  sandbox.window = { innerWidth:390, innerHeight:844, addEventListener(){},
    location:{origin:"https://x",pathname:"/",protocol:"https:",hostname:"x",hash:""},
    AudioContext: sandbox.AudioContext, document: sandbox.document };
  sandbox.location = sandbox.window.location;
  sandbox.URL = sandbox.URL;
  /* A YouTube player that records whether playVideo was ever called. onReady
     fires only when the harness drains it: in life it arrives well after
     `L.player = new YT.Player(...)` has returned, and firing it synchronously
     would leave L.player unassigned — an artifact, not a real behaviour. */
  let played = 0;
  const pendingReady = [];
  sandbox.YT = { Player: function(id,opts){
      this.opts=opts; this.destroy=()=>{}; this.setVolume=()=>{};
      this.getVideoData=()=>({}); this.playVideo=()=>{ played++; };
      this.pauseVideo=()=>{}; this.setPlaybackRate=()=>{}; this.seekTo=()=>{};
      this.getDuration=()=>36000; this.getPlaybackRate=()=>1;
      this.getAvailablePlaybackRates=()=>[0.25,0.5,0.75,1,1.25,1.5,1.75,2];
      const self=this;
      if(opts && opts.events && opts.events.onReady){
        pendingReady.push(()=>opts.events.onReady({ target:self }));
      }
    },
    PlayerState:{ENDED:0,PLAYING:1,PAUSED:2} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const app = scripts.find(s => s.includes("ambience.mixes.v1"));
  const probe = app.replace(/\}\)\(\);\s*$/,
   `  globalThis.__t={addLayer:addLayer,layers:function(){return layers;},
       removeLayer:removeLayer,isIOS:function(){return IS_IOS;},
       primeAudio:primeAudio,ctx:function(){return audioCtx;},
       /* The YouTube API never loads in a stub, so createPlayer parks its work
          in pendingCreates. Running it is what the script's onload would do. */
       apiArrive:function(){ apiReady=true;
         var q=pendingCreates.slice(); pendingCreates.length=0;
         q.forEach(function(f){ f(); }); }};
    })();`);
  vm.runInContext(probe, sandbox, { timeout: 5000 });

  return { T: sandbox.__t, byId, store, listeners, ctx: () => sandbox,
           dock,
           played: () => played, resumes: () => ctxResumes,
           /* Deliver the onReady callbacks the YouTube API would have sent. */
           drainReady: () => { sandbox.__t.apiArrive();
                               while (pendingReady.length) pendingReady.shift()(); },
           suspend: () => { const c = sandbox.__t.ctx(); if (c) c.state = "suspended"; } };
}

console.log("\n=== behaviour under an iPhone user agent ===\n");
const ios = run(IPHONE_UA, 5);
ok("IS_IOS is true on iPhone", ios.T.isIOS() === true);
ok("the iOS notice is shown", ios.byId.iosNote.hidden === false);

const v = ios.T.addLayer({ videoId: "x7SQaDTSrVg", volume: 70, autoplay: true });
ios.drainReady();                       // the YouTube API reports ready
ok("a video layer does NOT claim to be playing", v.playing === false,
   "playing=" + v.playing);
ok("iOS never calls playVideo() off the gesture", ios.played() === 0,
   "playVideo called " + ios.played() + "×");
ok("its volume slider is disabled", ios.byId["vol_" + v.uid] &&
   ios.byId["vol_" + v.uid].disabled === true);
ok("the disabled slider explains why", /iOS does not allow/.test(
   (ios.byId["vol_" + v.uid] || {}).title || ""));

const s = ios.T.addLayer({ synth: "rain", volume: 55, autoplay: true });
ok("a built-in sound DOES play", s.playing === true, "playing=" + s.playing);
ok("its volume slider stays enabled", ios.byId["vol_" + s.uid] &&
   !ios.byId["vol_" + s.uid].disabled);

/* The touch handlers must actually resume a suspended context. */
ios.suspend();
const before = ios.resumes();
(ios.listeners.touchend || []).forEach(f => f());
ok("a touch resumes a suspended AudioContext", ios.resumes() > before,
   "resumes " + before + " → " + ios.resumes());

ios.byId.btnIosOk._listeners.click.forEach(f => f());
ok("dismissing the notice hides it", ios.byId.iosNote.hidden === true);
ok("the dismissal is persisted", ios.store["ambience.iosNote"] === "1");

console.log("\n=== the same app on desktop is unchanged ===\n");
const mac = run(MAC_UA, 0);
ok("IS_IOS is false on desktop", mac.T.isIOS() === false);
ok("no iOS notice", mac.byId.iosNote.hidden === true);
const dv = mac.T.addLayer({ videoId: "x7SQaDTSrVg", volume: 70, autoplay: true });
mac.drainReady();                       // the YouTube API reports ready
ok("a video layer autoplays as before", dv.playing === true, "playing=" + dv.playing);
ok("playVideo() was actually called", mac.played() > 0);
ok("its volume slider is enabled", mac.byId["vol_" + dv.uid] &&
   !mac.byId["vol_" + dv.uid].disabled);

console.log("\n=== Android: full capability, must NOT take the iOS path ===\n");
const ANDROIDS = {
  "Chrome on Android": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  "Samsung Internet": "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  "Firefox on Android": "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0"
};
for (const [name, ua] of Object.entries(ANDROIDS)) {
  /* Touch points are high on Android too — the iPadOS heuristic must not
     catch it, which it only avoids by also requiring "Macintosh". */
  const a = run(ua, 5, { wakeLock: true });
  ok(name + ": not treated as iOS", a.T.isIOS() === false);
  ok(name + ": no iOS notice", a.byId.iosNote.hidden === true);
  const al = a.T.addLayer({ videoId: "x7SQaDTSrVg", volume: 70, autoplay: true });
  a.drainReady();
  ok(name + ": video layer autoplays", al.playing === true);
  ok(name + ": volume slider is enabled",
     a.byId["vol_" + al.uid] && !a.byId["vol_" + al.uid].disabled);
  ok(name + ": status shows a real percentage",
     !/full volume \(iOS\)/.test(a.byId["status_" + al.uid].innerHTML || ""));
  ok(name + ": keep-awake switch is usable", a.byId.btnWake.disabled === false);
  ok(name + ": keep-awake does not claim the screen will sleep",
     a.byId.wakeLabel.textContent !== "Screen will sleep");
}

console.log("\n=== Wake Lock honesty (Safari has no Wake Lock API) ===\n");
const noWake = run(IPHONE_UA, 5);                 // no wakeLock in navigator
ok("the switch is disabled when the browser cannot keep the screen awake",
   noWake.byId.btnWake.disabled === true);
ok("the label says the screen will sleep rather than claiming otherwise",
   noWake.byId.wakeLabel.textContent === "Screen will sleep",
   "got " + noWake.byId.wakeLabel.textContent);
const withWake = run(MAC_UA, 0, { wakeLock: true });
ok("the switch works where Wake Lock exists", withWake.byId.btnWake.disabled === false);
ok("its label reflects state again", withWake.byId.wakeLabel.textContent === "Screen may sleep",
   "got " + withWake.byId.wakeLabel.textContent);

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
