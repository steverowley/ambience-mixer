#!/usr/bin/env node
/* Layout sanity check for the layer-card footer.

   The regression this guards against: Mute, Solo, Visualise, Retry and
   Remove were added to a single non-wrapping flex row, so at the grid's
   320px minimum card width the row overflowed the card and rendered on top
   of the neighbouring card.

   There is no browser available in this environment, so instead of
   rendering we measure: estimate each chip's width from its text and the
   CSS padding/border/letter-spacing actually declared in index.html, then
   assert every footer row fits the card's inner width at the narrowest
   size the grid can produce.

   Estimates are deliberately pessimistic (wide glyph average), so passing
   here means real rendering has headroom. */

const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c, x) => c
  ? (pass++, console.log("  PASS  " + n))
  : (fail++, console.log("  FAIL  " + n + (x ? "  :: " + x : "")));

/* ---- read the real values out of the stylesheet ---- */
function cssNum(re, label, dflt) {
  const m = html.match(re);
  if (!m) { console.log("  note  could not read " + label + ", assuming " + dflt); return dflt; }
  return parseFloat(m[1]);
}

const cardMin   = cssNum(/minmax\((\d+)px,1fr\)/, "grid min column", 320);
const cardPad   = cssNum(/\.layer\{[^}]*padding:(\d+)px/, "card padding", 24);
const chipPadX  = cssNum(/\.tvbtn\{[^}]*padding:\d+px (\d+)px/, "chip padding-x", 11);
const chipFont  = cssNum(/\.tvbtn\{font-size:(\d+(?:\.\d+)?)px/, "chip font-size", 11);
const chipTrack = cssNum(/\.tvbtn\{[^}]*letter-spacing:\.(\d+)em/, "chip tracking", 9) / 100;
const rowGap    = cssNum(/\.foot-row\{[^}]*gap:(\d+)px/, "foot-row gap", 8);

// Uppercase 11px semi-bold Inter: ~0.70em average advance, pessimistic.
const GLYPH = 0.70;
function chipWidth(label) {
  const text = label.toUpperCase();
  const glyphs = text.length * chipFont * GLYPH;
  const tracking = text.length * chipFont * chipTrack;
  const border = 2;
  return Math.ceil(glyphs + tracking + chipPadX * 2 + border);
}
// The Loop switch: 36px track + 8px gap + label text.
function toggleWidth(label) {
  return Math.ceil(36 + 8 + label.length * chipFont * (GLYPH + chipTrack));
}

const inner = cardMin - cardPad * 2;
console.log(`\n[geometry]  card ${cardMin}px, padding ${cardPad}px -> inner ${inner}px`);
console.log(`            chip: ${chipFont}px, pad-x ${chipPadX}px, tracking ${chipTrack}em, gap ${rowGap}px\n`);

/* ---- the two footer rows as actually emitted ---- */
const row1 = { name: "row 1 (Loop / Mute / Solo)",
               items: [toggleWidth("Loop"), chipWidth("Muted"), chipWidth("Soloed")] };
/* Visualise and Retry are mutually exclusive: an errored layer hides
   Visualise, a healthy one hides Retry. Check both states. */
const row2a = { name: "row 2 healthy (Visualising / Remove)",
                items: [chipWidth("Visualising"), chipWidth("Remove")] };
const row2b = { name: "row 2 errored (Retry / Remove)",
                items: [chipWidth("Retry"), chipWidth("Remove")] };

for (const row of [row1, row2a, row2b]) {
  const content = row.items.reduce((a, b) => a + b, 0);
  const gaps = rowGap * (row.items.length - 1);
  const total = content + gaps;
  console.log(`  ${row.name}: ${row.items.join(" + ")} + gaps ${gaps} = ${total}px / ${inner}px`);
  ok(row.name + " fits the card", total <= inner, `needs ${total}px, has ${inner}px`);
}

/* ---- structural guards ---- */
console.log("\n[structure]");
ok("footer stacks in a column",
   /\.layer-foot\{[^}]*flex-direction:column/.test(html));
ok("footer rows can wrap as a last resort",
   /\.foot-row\{[^}]*flex-wrap:wrap/.test(html));
ok("two foot-rows are emitted per card",
   (html.match(/'<div class="foot-row">'/g) || []).length === 2);
ok("chips never split mid-label",
   /\.tvbtn\{[^}]*white-space:nowrap/.test(html));
ok("Remove is a chip too, not bare text",
   /\.remove\{[^}]*border-radius:9px/.test(html));
ok("spacer cannot force overflow (flex-shrink allowed)",
   /\.foot-row \.spacer\{flex:1 1 auto; min-width:0\}/.test(html));
ok("narrow-screen breakpoint exists", /@media \(max-width:380px\)/.test(html));

/* ---- the wake control ---- */
console.log("\n[wake control]");
ok("wake control is a checkbox, not an ambiguous button",
   /<input type="checkbox" id="btnWake">/.test(html));
ok("wake control has a stateful label", /id="wakeLabel"/.test(html));
ok("label states the resting state", /Screen may sleep/.test(html));
ok("label states the active state", /Screen staying on/.test(html));
ok("no stale aria-pressed button remains",
   !/id="btnWake" aria-pressed/.test(html));
ok("handler listens for change, not click",
   /getElementById\("btnWake"\)\.addEventListener\("change"/.test(html));
ok("syncWake drives the checkbox", /if\(b\) b\.checked=wakeWanted/.test(html));

/* ---- aria state on the toggle chips ---- */
console.log("\n[a11y]");
for (const [id, label] of [["mute", "Mute"], ["solo", "Solo"], ["tv", "Visualise"]]) {
  ok(label + " chip exposes aria-pressed",
     new RegExp(`id="${id}_'\\+L\\.uid\\+'" aria-pressed="false"`).test(html));
  ok(label + " chip updates aria-pressed",
     new RegExp(`${id === "tv" ? "tv" : id + "b?"}\\.setAttribute\\("aria-pressed"`).test(html)
     || new RegExp(`\\b(mb|sb|tv)\\.setAttribute\\("aria-pressed"`).test(html));
}

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
