/* Design gate for the overhaul candidates.
   node .dev/design/gate.js

   Mechanical only: it cannot tell you whether a design is good, just whether
   it breaks a rule we agreed to keep. It has already caught, in its own
   mockups: meta text at Lc 34, a paused layer at Lc 0.0 (invisible), and
   button borders at Lc 0.0 in BOTH candidates.

   Floors, and why each one:
     text            Lc 58   every text tone here carries real words
     primary text    Lc 75-90  below 75 is work in the dark, above 90 halates
     fine graphic    Lc 45   2px rules, 7px dots, 1px marks
     large graphic   Lc 25   discs 20px and up, read by area not edge
     edge            Lc 25   a border you cannot see is not a border
     decorative      none    reported, not enforced

   Text is measured against the LIGHTEST surface a string can sit on, because
   a lighter ground is the worst case for light type.

   Each file declares what role each token plays, because guessing a role from
   a token's name is how the first version of this gate produced three false
   failures and missed a real one. */

var fs = require("fs");
var path = require("path");

var DIR = __dirname;

var SPEC = {
  "bathhouse.html": {
    surfaces: ["g0", "g1", "g2", "g3"],
    text:       ["ink", "ink-dim", "rust-text"],
    primary:    "ink",
    fine:       ["rust-lit", "sage"],
    large:      [],
    edge:       ["edge"],
    decorative: ["line", "track", "rust"]
  },
  "lamp.html": {
    surfaces: ["g0", "g1", "g2"],
    text:       ["ink", "ink-dim", "amber-text"],
    primary:    "ink",
    fine:       ["lamp-off"],
    large:      ["lamp-1", "lamp-2", "lamp-3", "lamp-4"],
    edge:       ["edge"],
    decorative: ["ring"]
  }
};

/* ---------- APCA Lc, Myndex 0.1.9 constants ---------- */
var mainTRC = 2.4,
    sRco = 0.2126729, sGco = 0.7151522, sBco = 0.0721750,
    normBG = 0.56, normTXT = 0.57, revTXT = 0.62, revBG = 0.65,
    blkThrs = 0.022, blkClmp = 1.414, scale = 1.14,
    loOffset = 0.027, loClip = 0.1, deltaYmin = 0.0005;

function hexToY(hex) {
  var h = hex.replace("#", "");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var r = parseInt(h.slice(0,2),16)/255,
      g = parseInt(h.slice(2,4),16)/255,
      b = parseInt(h.slice(4,6),16)/255;
  var Y = sRco*Math.pow(r,mainTRC) + sGco*Math.pow(g,mainTRC) + sBco*Math.pow(b,mainTRC);
  return Y >= blkThrs ? Y : Y + Math.pow(blkThrs - Y, blkClmp);
}

function apca(txtHex, bgHex) {
  var txtY = hexToY(txtHex), bgY = hexToY(bgHex);
  if (Math.abs(bgY - txtY) < deltaYmin) return 0;
  var sapc, out;
  if (bgY > txtY) {
    sapc = (Math.pow(bgY, normBG) - Math.pow(txtY, normTXT)) * scale;
    out = sapc < loClip ? 0 : sapc - loOffset;
  } else {
    sapc = (Math.pow(bgY, revBG) - Math.pow(txtY, revTXT)) * scale;
    out = sapc > -loClip ? 0 : sapc + loOffset;
  }
  return Math.abs(out * 100);
}

/* ---------- harness ---------- */
var results = [];
function check(file, name, ok, detail) {
  results.push({ file: file, name: name, ok: !!ok, detail: detail || "" });
}
function varOf(css, name) {
  var m = css.match(new RegExp("--" + name + "\\s*:\\s*(#[0-9A-Fa-f]{3,8})"));
  return m ? m[1] : null;
}
/* comments must go before any pattern check: the first version of this gate
   failed its own "no innerHTML" rule by matching the word in a comment that
   said there was no innerHTML. */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

Object.keys(SPEC).forEach(function (f) {
  var spec = SPEC[f];
  var full = fs.readFileSync(path.join(DIR, f), "utf8");
  var css = stripComments((full.match(/<style[\s\S]*?<\/style>/i) || [""])[0]);
  var js  = stripComments((full.match(/<script[\s\S]*?<\/script>/i) || [""])[0]);
  var markup = full
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  var prose = markup.replace(/<[^>]+>/g, " ");

  var g0 = varOf(css, "g0");
  var surfaceHexes = spec.surfaces.map(function (n) { return varOf(css, n); }).filter(Boolean);
  var worstBg = surfaceHexes.reduce(function (a, b) {
    return hexToY(b) > hexToY(a) ? b : a;
  }, surfaceHexes[0]);

  /* ---- banned patterns ---- */
  check(f, "no gradients",
    !/(linear|radial|conic)-gradient/i.test(css),
    (css.match(/(linear|radial|conic)-gradient/gi) || []).join(", "));

  check(f, "no backdrop-filter / glass", !/backdrop-filter/i.test(css));

  check(f, "no blur()", !/\bblur\s*\(/i.test(css),
    (css.match(/blur\s*\([^)]*\)/gi) || []).join(", "));

  check(f, "no box-shadow", !/box-shadow/i.test(css),
    (css.match(/box-shadow[^;]*/gi) || []).join(" | "));

  check(f, "no uppercase micro labels",
    !/text-transform\s*:\s*uppercase/i.test(css),
    (css.match(/text-transform\s*:\s*uppercase/gi) || []).join(", "));

  check(f, "no font-weight under 400",
    !/font-weight\s*:\s*[123]00\b/i.test(css),
    (css.match(/font-weight\s*:\s*[123]00\b/gi) || []).join(", "));

  check(f, "no infinite animation at rest",
    !/animation[^;]*infinite/i.test(css),
    (css.match(/animation[^;]*infinite/gi) || []).join(", "));

  check(f, "no innerHTML", !/innerHTML/.test(js),
    (js.match(/[\w.]*innerHTML/g) || []).join(", "));

  /* ---- ground ---- */
  check(f, "ground is not #000", g0 && !/^#0{3,6}$/i.test(g0), "ground " + g0);

  (function () {
    var h = (g0 || "#000000").replace("#", "");
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r = parseInt(h.slice(0,2),16), gg = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    check(f, "ground is warm or neutral, not navy/slate",
      b < r, "r" + r + " g" + gg + " b" + b);
  })();

  /* ---- type colours by declared role ---- */
  check(f, "ink is not white",
    !/(^|[^-\w])color\s*:\s*(#fff\b|#ffffff\b|white)\s*[;}]/i.test(css));

  (function () {
    var p = varOf(css, spec.primary);
    if (!p) return;
    var lc = apca(p, worstBg);
    check(f, "primary text APCA Lc 75-90",
      lc >= 75 && lc <= 90,
      "Lc " + lc.toFixed(1) + " (" + p + " on " + worstBg + ")");
  })();

  spec.text.forEach(function (n) {
    var c = varOf(css, n);
    if (!c) return;
    var l = apca(c, worstBg);
    check(f, "text token --" + n + " clears Lc 58",
      l >= 58, "Lc " + l.toFixed(1) + " (" + c + " on " + worstBg + ")");
  });

  [["fine", 45], ["large", 25], ["edge", 25]].forEach(function (role) {
    spec[role[0]].forEach(function (n) {
      var c = varOf(css, n);
      if (!c) return;
      /* graphics are judged against the ground they are drawn on, not the
         lightest surface in the file */
      var bg = role[0] === "edge" ? (varOf(css, "g1") || g0) : g0;
      var l = apca(c, bg);
      check(f, role[0] + " --" + n + " clears Lc " + role[1],
        l >= role[1], "Lc " + l.toFixed(1) + " (" + c + " on " + bg + ")");
    });
  });

  /* ---- every colour that reaches type must be a declared text token ----
     This is the check that matters most: an accent picked to look right as a
     FILL is usually far too dark to carry words. The lookbehind stops
     border-color and background-color matching as `color`. */
  (function () {
    var allowed = {};
    spec.text.forEach(function (n) { allowed[(varOf(css, n) || "").toLowerCase()] = 1; });
    allowed["inherit"] = 1; allowed["currentcolor"] = 1; allowed["transparent"] = 1;

    var bad = [], seen = {}, m;
    var re = /(?:^|[^-\w])color\s*:\s*(var\(\s*--([\w-]+)\s*\)|#[0-9A-Fa-f]{3,8}|inherit|currentColor|transparent)/gi;
    while ((m = re.exec(css))) {
      var raw = m[1], hex;
      if (/^var\(/i.test(raw)) hex = varOf(css, m[2]);
      else hex = raw;
      if (!hex) continue;
      var key = hex.toLowerCase();
      if (allowed[key] || seen[key]) continue;
      seen[key] = 1;
      bad.push(hex + " Lc " + apca(hex, worstBg).toFixed(1));
    }
    check(f, "only declared text tokens reach type", bad.length === 0, bad.join(", "));
  })();

  /* ---- type scale and targets ---- */
  var bodyFs = css.match(/body\s*\{[^}]*font-size\s*:\s*(\d+(?:\.\d+)?)px/i);
  check(f, "body font-size >= 16px",
    bodyFs && parseFloat(bodyFs[1]) >= 16,
    bodyFs ? bodyFs[1] + "px" : "not found");

  var sizes = (css.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi) || [])
    .map(function (s) { return parseFloat(s.match(/([\d.]+)px/)[1]); });
  check(f, "largest font-size <= 32px (app type, not display)",
    Math.max.apply(null, sizes) <= 32,
    "max " + Math.max.apply(null, sizes) + "px");

  var tap = css.match(/--tap\s*:\s*(\d+)px/);
  check(f, "tap target >= 44px",
    tap && parseInt(tap[1], 10) >= 44,
    tap ? tap[1] + "px" : "not found");

  /* ---- behaviour and access ---- */
  check(f, "honours prefers-reduced-motion",
    /prefers-reduced-motion\s*:\s*reduce/i.test(css));

  check(f, "focus-visible styled", /:focus-visible/.test(css));

  check(f, "no em dashes in copy", !/\u2014/.test(prose),
    (prose.match(/\u2014/g) || []).length + " found");

  (function () {
    var bad = 0;
    (markup.match(/<button[\s\S]*?<\/button>/gi) || []).forEach(function (b) {
      if (/aria-label/.test(b)) return;
      if (!b.replace(/<[^>]+>/g, "").replace(/\s+/g, "")) bad++;
    });
    check(f, "icon-only buttons have aria-label", bad === 0, bad + " unlabelled");
  })();

  check(f, "sliders expose value and text",
    !/slider/.test(js) || (/aria-valuenow/.test(js) && /aria-valuetext/.test(js)));

  /* a drag-driven control is unusable without a keyboard path */
  check(f, "drag controls have a keyboard path",
    !/pointermove/.test(js) || /keydown/.test(js));

  /* ---- report decorative tones without enforcing ---- */
  spec.decorative.forEach(function (n) {
    var c = varOf(css, n);
    if (!c || !g0) return;
    results.push({ file: f, name: "note: decorative --" + n, ok: true,
      detail: "Lc " + apca(c, g0).toFixed(1) + " (" + c + ", not enforced)" });
  });
});

/* ---------- report ---------- */
var byFile = {};
results.forEach(function (r) { (byFile[r.file] = byFile[r.file] || []).push(r); });

var failed = 0;
Object.keys(byFile).forEach(function (f) {
  console.log("\n" + f);
  console.log("-".repeat(f.length));
  byFile[f].forEach(function (r) {
    if (!r.ok) failed++;
    console.log("  " + (r.ok ? "pass" : "FAIL") + "  " + r.name +
      (r.detail ? "   [" + r.detail + "]" : ""));
  });
});

console.log("\n" + (results.length - failed) + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
