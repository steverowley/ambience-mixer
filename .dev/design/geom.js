/* Geometry checks for the design candidates.
   node .dev/design/geom.js

   Same approach as .dev/layout.js: read the real numbers out of the file so
   the check breaks when the design changes, then do the arithmetic. There is
   no browser here, so this is how overflow gets caught.

   This found three things eyeballing a 390px window would not:
     - the bathhouse bar needed 319px of a 280px budget at 320px wide
     - the lamp field ran under the bottom bar on all five viewports
     - lamp labels overflowed sideways by up to 106px

   Glyph advances are pessimistic, matching .dev/layout.js:
     mixed-case Helvetica/Arial   0.56em
     tabular digits               0.58em  (tabular figures are wider) */

var fs = require("fs");
var path = require("path");

var DIR = __dirname;
var fail = 0, pass = 0;
function ok(n, cond, x) {
  if (cond) { pass++; console.log("  pass  " + n + (x ? "   [" + x + "]" : "")); }
  else { fail++; console.log("  FAIL  " + n + (x ? "   [" + x + "]" : "")); }
}
function num(src, re, label, dflt) {
  var m = src.match(re);
  if (!m) { console.log("  note  could not read " + label + ", assuming " + dflt); return dflt; }
  return parseFloat(m[1]);
}

var MIXED = 0.56, DIGIT = 0.58;
function textW(s, px) {
  var w = 0;
  for (var i = 0; i < s.length; i++) w += px * (/[0-9:]/.test(s[i]) ? DIGIT : MIXED);
  return w;
}

/* Phones worth caring about. The 320 and 360 cases are the ones a 390-only
   eyeball test silently passes. Landscape is included because a radial field
   anchored low has no room on a short screen. */
var VIEWPORTS = [
  { n: "iPhone SE 1st gen", w: 320, h: 568 },
  { n: "common Android",    w: 360, h: 640 },
  { n: "iPhone 14/15",      w: 390, h: 844 },
  { n: "iPhone Pro Max",    w: 430, h: 932 },
  { n: "landscape",         w: 844, h: 390 }
];

/* ============================================================
   BATHHOUSE: does the fixed bottom bar fit one row?
   ============================================================ */
console.log("\nbathhouse.html  bottom bar");
console.log("--------------------------");
(function () {
  var src = fs.readFileSync(path.join(DIR, "bathhouse.html"), "utf8");

  var gap    = num(src, /\.bar-in\{[^}]*gap:(\d+)px/, "bar gap", 10);
  var btnFont = num(src, /\.btn\{[^}]*font-size:(\d+(?:\.\d+)?)px/, "button font-size", 14);
  var btnGap  = num(src, /\.btn\{[^}]*gap:(\d+)px/, "button inner gap", 9);
  var icoW    = num(src, /\.btn \.ico\{width:(\d+)px/, "icon width", 15);
  var tmrFont = num(src, /\.timer\{font-size:(\d+(?:\.\d+)?)px/, "timer font-size", 14);

  /* wide defaults */
  var padWide = num(src, /\.bar\{[^}]*padding:\d+px (\d+)px/, "bar padding-x", 20);
  var btnPadWide = num(src, /\.btn\{[^}]*padding:0 (\d+)px/, "button padding-x", 16);

  /* the <=360px breakpoint, which sheds the words "sleep in" */
  var narrow = (src.match(/@media \(max-width:360px\)\{[\s\S]*?\n  \}/) || [""])[0];
  var padNarrow = num(narrow, /\.bar\{padding-left:(\d+)px/, "narrow bar padding-x", padWide);
  var btnPadNarrow = num(narrow, /\.btn\{padding:0 (\d+)px/, "narrow button padding-x", btnPadWide);
  var shedsWords = /\.timer \.tword\{display:none\}/.test(narrow);

  ok("narrow breakpoint sheds the words, keeps the time", shedsWords);

  function barWidth(btnPadX, timerText) {
    var primary = Math.ceil(textW("pause", btnFont) + btnPadX * 2 + icoW + btnGap + 2);
    var second  = Math.ceil(textW("breathe", btnFont) + btnPadX * 2 + 2);
    var timer   = Math.ceil(textW(timerText, tmrFont));
    return { total: primary + second + timer + gap * 2, primary: primary, second: second, timer: timer };
  }

  VIEWPORTS.forEach(function (v) {
    if (v.h < v.w) return;                      /* the bar is not the landscape risk */
    var isNarrow = v.w <= 360;
    var padX = isNarrow ? padNarrow : padWide;
    var btnPadX = isNarrow ? btnPadNarrow : btnPadWide;
    var text = isNarrow && shedsWords ? "42:10" : "sleep in 42:10";
    var m = barWidth(btnPadX, text);
    var usable = v.w - padX * 2;
    ok("bar fits " + v.n + " (" + v.w + "px)", m.total <= usable,
      m.primary + " + " + m.second + " + " + m.timer + " + gaps " + (gap * 2) +
      " = " + m.total + "px of " + usable + "px");
  });
})();

/* ============================================================
   LAMP: does the field stay clear of the chrome at BOTH ends?
   ============================================================ */
console.log("\nlamp.html  field geometry");
console.log("-------------------------");
(function () {
  var src = fs.readFileSync(path.join(DIR, "lamp.html"), "utf8");

  /* the script's own constants */
  var TOPCH   = num(src, /var TOPCH=(\d+)/, "TOPCH", 60);
  var BARPAD  = num(src, /var BARPAD=(\d+)/, "BARPAD", 14);
  var TAP     = num(src, /var TAP=(\d+)/, "TAP", 48);
  var SIDEPAD = num(src, /var SIDEPAD=(\d+)/, "SIDEPAD", 18);
  var discBase = num(src, /var DISC_BASE=(\d+)/, "DISC_BASE", 10);
  var discSpan = num(src, /DISC_SPAN=(\d+)/, "DISC_SPAN", 19);
  var lowFrac  = num(src, /freeH < 400 \? 0\.5 : ([\d.]+)/, "low anchor fraction", 0.72);
  var minFloor = num(src, /MINR=Math\.max\((\d+)/, "min radius floor", 46);
  var minFrac  = num(src, /Math\.min\(W,H\)\*([\d.]+)/, "min radius fraction", 0.11);

  /* the stylesheet's values for the same things */
  var cssTop = num(src, /\.top\{[^}]*height:(\d+)px/, "css .top height", 60);
  var cssPad = num(src, /--bar-pad:(\d+)px/, "css --bar-pad", 14);
  var cssTap = num(src, /--tap:(\d+)px/, "css --tap", 48);

  /* The drift between these two sets is what put the field under the bar. */
  ok("script TOPCH matches the stylesheet", TOPCH === cssTop, TOPCH + " vs css " + cssTop);
  ok("script BARPAD matches the stylesheet", BARPAD === cssPad, BARPAD + " vs css " + cssPad);
  ok("script TAP matches the stylesheet", TAP === cssTap, TAP + " vs css " + cssTap);

  var BARH = TAP + BARPAD * 2;
  var MAXDISC = discBase + discSpan;
  console.log("  top chrome " + TOPCH + "px, bottom bar " + BARH +
              "px, largest disc radius " + MAXDISC + "px\n");

  /* no labels on the field by design, so there is nothing to overflow
     sideways beyond the disc itself */
  ok("field draws no text, so labels cannot overflow",
    !/el\("text"/.test(src) && !/createElementNS\(SVGNS,"text"\)/.test(src));

  VIEWPORTS.forEach(function (v) {
    var CX = v.w / 2;
    var top = TOPCH, bot = v.h - BARH, freeH = bot - top;
    var CY = top + freeH * (freeH < 400 ? 0.5 : lowFrac);
    var MINR = Math.max(minFloor, Math.min(v.w, v.h) * minFrac);
    var MAXR = Math.min(CX - SIDEPAD - MAXDISC, CY - top - MAXDISC, bot - CY - MAXDISC);
    if (MAXR < MINR + 40) MINR = Math.max(26, MAXR - 40);

    var lowest = CY + MAXR + MAXDISC;
    var highest = CY - MAXR - MAXDISC;
    var widest = CX + MAXR + MAXDISC;

    console.log("  " + v.n + " " + v.w + "x" + v.h + ": CY " + CY.toFixed(0) +
                ", radius " + MINR.toFixed(0) + "-" + MAXR.toFixed(0) +
                ", travel " + (MAXR - MINR).toFixed(0) + "px");

    ok("clears the bottom bar on " + v.n, lowest <= bot,
      "reaches " + lowest.toFixed(0) + "px, bar at " + bot.toFixed(0) + "px");
    ok("clears the top chrome on " + v.n, highest >= top,
      "reaches " + highest.toFixed(0) + "px, chrome ends at " + top + "px");
    ok("stays on screen sideways on " + v.n, widest <= v.w,
      "reaches " + widest.toFixed(0) + "px of " + v.w + "px");
    ok("has usable travel on " + v.n, MAXR - MINR >= 40,
      (MAXR - MINR).toFixed(0) + "px");
    /* a disc at the loudest end must not swallow the listener ring */
    ok("innermost disc clears the centre on " + v.n, MINR > MAXDISC,
      "inner radius " + MINR.toFixed(0) + "px vs disc " + MAXDISC + "px");
  });
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
