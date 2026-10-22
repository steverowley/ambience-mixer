/* Smoke test for the design candidates.
   node .dev/design/smoke.js

   There is no browser available in this environment, so the mockups are run
   in a Node VM against a stub DOM. This proves three things the design gate
   cannot: the script initialises without throwing, the field or stack is
   actually populated, and the drag maths stays inside 0-100.

   The stub is deliberately faithful on two points that previously hid bugs:
     - listeners are called with `this` bound to the element, because handlers
       here use `this.setAttribute`
     - static attributes written in the HTML are parsed and seeded, because a
       control declaring aria-pressed="false" in markup must start that way

   It is not a substitute for looking at the thing on a phone. It only catches
   the class of bug where a mockup looks finished and is in fact throwing. */

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var DIR = __dirname;
var fails = [];
var passes = 0;

function ok(name, cond, detail) {
  if (cond) { passes++; console.log("  pass  " + name + (detail ? "   [" + detail + "]" : "")); }
  else { fails.push(name); console.log("  FAIL  " + name + (detail ? "   [" + detail + "]" : "")); }
}

/* ---------- minimal DOM ---------- */
function makeNode(tag) {
  var n = {
    tagName: String(tag || "div").toUpperCase(),
    childNodes: [],
    attrs: {},
    style: {},
    _cls: "",
    _text: "",
    _handlers: {}
  };
  Object.defineProperty(n, "className", {
    get: function () { return n._cls; },
    set: function (v) { n._cls = String(v); }
  });
  Object.defineProperty(n, "textContent", {
    get: function () { return n._text; },
    set: function (v) { n._text = String(v); n.childNodes = []; }
  });
  Object.defineProperty(n, "firstChild", {
    get: function () { return n.childNodes.length ? n.childNodes[0] : null; }
  });
  n.setAttribute = function (k, v) { n.attrs[k] = String(v); };
  n.getAttribute = function (k) { return n.attrs.hasOwnProperty(k) ? n.attrs[k] : null; };
  n.removeAttribute = function (k) { delete n.attrs[k]; };
  n.appendChild = function (c) { n.childNodes.push(c); c.parentNode = n; return c; };
  n.removeChild = function (c) {
    var i = n.childNodes.indexOf(c);
    if (i >= 0) n.childNodes.splice(i, 1);
    return c;
  };
  n.addEventListener = function (t, fn) { (n._handlers[t] = n._handlers[t] || []).push(fn); };
  n.removeEventListener = function () {};
  n.setPointerCapture = function () {};
  n.releasePointerCapture = function () {};
  n.classList = {
    add: function (c) { if (!n.classList.contains(c)) n._cls = (n._cls + " " + c).trim(); },
    remove: function (c) {
      n._cls = n._cls.split(/\s+/).filter(function (x) { return x && x !== c; }).join(" ");
    },
    contains: function (c) { return n._cls.split(/\s+/).indexOf(c) >= 0; }
  };
  n.querySelector = function (sel) {
    var want = sel.replace(/^\./, "");
    var found = null;
    (function walk(node) {
      if (found) return;
      node.childNodes.forEach(function (c) {
        if (found) return;
        if (c._cls && c._cls.split(/\s+/).indexOf(want) >= 0) { found = c; return; }
        walk(c);
      });
    })(n);
    return found;
  };
  n.getBoundingClientRect = function () { return { left: 0, top: 0, width: 390, height: 20 }; };
  n.fire = function (type, ev) {
    /* real events always carry these, and `this` is always the element */
    var e = ev || {};
    if (!e.preventDefault) e.preventDefault = function () {};
    if (!e.stopPropagation) e.stopPropagation = function () {};
    if (e.pointerId === undefined) e.pointerId = 1;
    (n._handlers[type] || []).forEach(function (fn) { fn.call(n, e); });
  };
  return n;
}

/* pull the static attributes an element declares in the markup, so a control
   that says aria-pressed="false" in HTML starts out that way here too */
function seedFromMarkup(node, markup, id) {
  var re = new RegExp("<([a-z]+)([^>]*\\bid=[\"']" + id + "[\"'][^>]*)>", "i");
  var m = markup.match(re);
  if (!m) return;
  node.tagName = m[1].toUpperCase();
  var attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g, a;
  while ((a = attrRe.exec(m[2]))) {
    if (a[1].toLowerCase() === "class") node.className = a[2];
    else node.attrs[a[1]] = a[2];
  }
}

function makeDom(ids, markup) {
  var byId = {};
  ids.forEach(function (id) {
    byId[id] = makeNode("div");
    if (markup) seedFromMarkup(byId[id], markup, id);
  });

  var document = {
    createElement: function (t) { return makeNode(t); },
    createElementNS: function (ns, t) { return makeNode(t); },
    getElementById: function (id) { return byId[id] || null; },
    querySelector: function () { return null; },
    addEventListener: function () {},
    hidden: false,
    body: makeNode("body"),
    documentElement: makeNode("html")
  };

  var timers = [];
  var sandbox = {
    document: document,
    console: console,
    Math: Math, Date: Date, String: String, Number: Number,
    Array: Array, Object: Object,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    setTimeout: function (fn) { timers.push(fn); return timers.length; },
    clearTimeout: function () {},
    setInterval: function (fn) { timers.push(fn); return timers.length; },
    clearInterval: function () {},
    requestAnimationFrame: function (fn) { timers.push(fn); return timers.length; },
    window: null
  };
  sandbox.window = {
    innerWidth: 390,
    innerHeight: 844,
    addEventListener: function () {},
    matchMedia: function () { return { matches: false, addEventListener: function () {} }; },
    devicePixelRatio: 3
  };
  sandbox.matchMedia = sandbox.window.matchMedia;
  sandbox.globalThis = sandbox;

  return { sandbox: sandbox, byId: byId, timers: timers };
}

function fileOf(file) { return fs.readFileSync(path.join(DIR, file), "utf8"); }
function scriptOf(src) {
  var m = src.match(/<script>([\s\S]*?)<\/script>/i);
  if (!m) throw new Error("no inline script");
  return m[1];
}

/* ---------- bathhouse ---------- */
console.log("\nbathhouse.html");
console.log("--------------");
(function () {
  var src = fileOf("bathhouse.html");
  var dom = makeDom(["meta", "stack", "presets", "toggle", "toggleLabel", "breathe", "left"], src);
  var ico = makeNode("svg"); ico.className = "ico";
  dom.byId.toggle.appendChild(ico);

  var threw = null;
  try {
    vm.createContext(dom.sandbox);
    vm.runInContext(scriptOf(src), dom.sandbox, { timeout: 5000 });
  } catch (e) { threw = e; }

  ok("script initialises without throwing", !threw, threw ? String(threw.message) : "");
  if (threw) return;

  var stack = dom.byId.stack;
  ok("five layer rows rendered", stack.childNodes.length === 5, stack.childNodes.length + " rows");
  ok("five other mixes rendered", dom.byId.presets.childNodes.length === 5,
    dom.byId.presets.childNodes.length + " rows");
  ok("meta line describes the mix", /five layers/.test(dom.byId.meta._text), dom.byId.meta._text);
  ok("play icon built as svg nodes, not a glyph", ico.childNodes.length === 2,
    ico.childNodes.length + " shapes (pause = 2 bars)");

  var row = stack.childNodes[0];
  ok("row exposes a slider role", row.getAttribute("role") === "slider");
  ok("row exposes a value", row.getAttribute("aria-valuenow") === "75",
    "aria-valuenow " + row.getAttribute("aria-valuenow"));
  ok("row exposes readable value text",
    /pool ambience, 75 percent/.test(row.getAttribute("aria-valuetext") || ""),
    row.getAttribute("aria-valuetext"));

  row.fire("pointerdown", { clientX: 100 });
  row.fire("pointermove", { clientX: 140 });
  var mid = parseInt(row.getAttribute("aria-valuenow"), 10);
  ok("drag right raises the level", mid > 75, "75 -> " + mid);

  for (var i = 0; i < 40; i++) row.fire("pointermove", { clientX: 200 + i * 40 });
  ok("level clamps at 100", parseInt(row.getAttribute("aria-valuenow"), 10) === 100,
    "ended at " + row.getAttribute("aria-valuenow"));

  for (var j = 0; j < 80; j++) row.fire("pointermove", { clientX: 2000 - j * 60 });
  ok("level clamps at 0", parseInt(row.getAttribute("aria-valuenow"), 10) === 0,
    "ended at " + row.getAttribute("aria-valuenow"));
  row.fire("pointerup", {});

  var row2 = dom.byId.stack.childNodes[1];
  var before = parseInt(row2.getAttribute("aria-valuenow"), 10);
  row2.fire("keydown", { key: "ArrowLeft" });
  var after = parseInt(dom.byId.stack.childNodes[1].getAttribute("aria-valuenow"), 10);
  ok("arrow key changes the level", after === before - 1, before + " -> " + after);

  dom.byId.toggle.fire("click", {});
  ok("pause all stops every layer", /nothing playing/.test(dom.byId.meta._text),
    dom.byId.meta._text);
  ok("icon swaps to one play shape", ico.childNodes.length === 1, ico.childNodes.length + " shape");
  ok("toggle relabels itself for screen readers",
    /Play everything/.test(dom.byId.toggle.getAttribute("aria-label") || ""),
    dom.byId.toggle.getAttribute("aria-label"));
})();

/* ---------- lamp ---------- */
console.log("\nlamp.html");
console.log("---------");
(function () {
  var src = fileOf("lamp.html");
  var dom = makeDom(["field", "meta", "readout", "rn", "rv", "help", "toggle", "drift", "left", "top"], src);
  var ico = makeNode("svg"); ico.className = "ico";
  dom.byId.toggle.appendChild(ico);

  var threw = null;
  try {
    vm.createContext(dom.sandbox);
    vm.runInContext(scriptOf(src), dom.sandbox, { timeout: 5000 });
  } catch (e) { threw = e; }

  ok("script initialises without throwing", !threw, threw ? String(threw.message) : "");
  if (threw) return;

  var field = dom.byId.field;
  function groups() {
    return field.childNodes.filter(function (n) { return n.tagName === "G"; });
  }

  ok("field draws rings and layers", field.childNodes.length === 10,
    field.childNodes.length + " nodes (4 rings + listener + 5 layers)");
  ok("five layer groups", groups().length === 5, groups().length + " groups");

  var g = groups()[0];
  ok("layer group exposes a slider role", g.getAttribute("role") === "slider");
  ok("layer group exposes a value", g.getAttribute("aria-valuenow") === "75",
    "aria-valuenow " + g.getAttribute("aria-valuenow"));
  ok("layer group is keyboard reachable", g.getAttribute("tabindex") === "0");

  var playingDisc = groups()[0].childNodes[1];
  var pausedDisc = groups()[4].childNodes[1];
  ok("playing layer is a filled disc",
    playingDisc.getAttribute("fill") && playingDisc.getAttribute("fill") !== "none",
    "fill " + playingDisc.getAttribute("fill"));
  ok("paused layer is a stroked ring, so state is a shape",
    pausedDisc.getAttribute("fill") === "none" && !!pausedDisc.getAttribute("stroke"),
    "fill " + pausedDisc.getAttribute("fill") + ", stroke " + pausedDisc.getAttribute("stroke"));

  var hit = parseFloat(groups()[0].childNodes[0].getAttribute("r"));
  var disc = parseFloat(playingDisc.getAttribute("r"));
  ok("hit area is larger than the disc", hit > disc,
    hit.toFixed(1) + "px vs " + disc.toFixed(1) + "px");
  ok("hit area clears the 44px touch floor", hit * 2 >= 44, (hit * 2).toFixed(0) + "px across");

  /* centre is (195, 557) for a 390x844 viewport: CX = W/2, CY = H*0.66 */
  g.fire("pointerdown", { clientX: 195, clientY: 557 });
  g.fire("pointermove", { clientX: 195, clientY: 557 });
  ok("dragging to the centre reads as loudest",
    parseInt(groups()[0].getAttribute("aria-valuenow"), 10) === 100,
    "got " + groups()[0].getAttribute("aria-valuenow"));

  g.fire("pointermove", { clientX: 5, clientY: 5 });
  ok("dragging far out reads as quietest",
    parseInt(groups()[0].getAttribute("aria-valuenow"), 10) === 0,
    "got " + groups()[0].getAttribute("aria-valuenow"));
  g.fire("pointerup", {});

  ok("drift is off by default", dom.byId.drift.getAttribute("aria-pressed") === "false",
    "aria-pressed " + dom.byId.drift.getAttribute("aria-pressed"));
  dom.byId.drift.fire("click", {});
  ok("drift reports itself when on",
    dom.byId.drift.getAttribute("aria-pressed") === "true" && /drifting/.test(dom.byId.help._text),
    dom.byId.help._text);
  dom.byId.drift.fire("click", {});
  ok("drift can be turned back off", dom.byId.drift.getAttribute("aria-pressed") === "false",
    "aria-pressed " + dom.byId.drift.getAttribute("aria-pressed"));

  /* the field carries no text by design, so the name must reach the readout
     and the accessible value text, or it is lost entirely */
  var anyText = false;
  groups().forEach(function (gr) {
    gr.childNodes.forEach(function (c) { if (c.tagName === "TEXT") anyText = true; });
  });
  ok("field draws no text labels", !anyText);
  ok("layer name survives in the accessible value text",
    /pool ambience/.test(groups()[0].getAttribute("aria-valuetext") || ""),
    groups()[0].getAttribute("aria-valuetext"));

  /* focus must name the layer too, since there is no label to read */
  groups()[1].fire("focus", {});
  ok("focusing a layer names it in the readout",
    /the cool river/.test(dom.byId.rn._text) && dom.byId.readout.classList.contains("on"),
    "readout says '" + dom.byId.rn._text + "'");
  groups()[1].fire("blur", {});
  ok("blurring hides the readout", !dom.byId.readout.classList.contains("on"));

  dom.byId.toggle.fire("click", {});
  ok("pause all stops every layer", /nothing playing/.test(dom.byId.meta._text),
    dom.byId.meta._text);
  ok("toggle relabels itself for screen readers",
    /Play everything/.test(dom.byId.toggle.getAttribute("aria-label") || ""),
    dom.byId.toggle.getAttribute("aria-label"));
})();

console.log("\n" + passes + " passed, " + fails.length + " failed");
if (fails.length) fails.forEach(function (f) { console.log("  - " + f); });
process.exit(fails.length ? 1 : 0);
