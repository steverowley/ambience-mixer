/* Why is Pause all not visible in the theatre bar?
   Renders the bar in the stub DOM and measures it at real viewport widths. */
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// --- 1. Is the element in the markup, and in the right place? ---
const bar = (html.match(/<div class="tbar" id="tbar">([\s\S]*?)<\/div>\s*\n\s*<div class="dock">/) || [])[1] || "";
const ids = [...bar.matchAll(/id="(\w+)"/g)].map(m => m[1]);
console.log("tbar children, in order:", ids.join(" → "));
console.log("tall present in markup:", ids.includes("tall"));

// --- 2. Does any rule hide it? ---
const hides = [];
const reBlocks = /@media \(max-width:(\d+)px\)\{([\s\S]*?)\n  \}/g;
let m;
while ((m = reBlocks.exec(html))) {
  const w = +m[1], body = m[2];
  if (/#tallLabel\{display:none\}/.test(body)) hides.push(`${w}px: the words "Pause all" are hidden, icon only`);
  if (/#tall\{display:none\}/.test(body)) hides.push(`${w}px: the whole button is hidden`);
}
console.log("\nresponsive rules touching it:");
hides.forEach(h => console.log("  " + h));

// --- 3. Where does the bar wrap, and what lands on which line? ---
const CH = 7.4;                       // px per char at 13px
function pill(text, ico, fs = 13, pad = 18) {
  return (ico ? 14 + 8 : 0) + text.length * (CH * fs / 13) + pad * 2 + 2;
}
function layout(vw) {
  let gap, pad, nameW, slider, fsz, ppad, labelOn, nameOn, capOn, exitW;
  if (vw <= 430) { gap = 8; pad = 12; fsz = 11.5; ppad = 10; labelOn = false; nameOn = false; capOn = false; exitW = 26; }
  else if (vw <= 520) { gap = 10; pad = 16; fsz = 12; ppad = 13; labelOn = true; nameOn = true; capOn = true; exitW = pill("Exit ✕", false, 12, 13); }
  else { gap = 18; pad = 28; fsz = 13; ppad = 18; labelOn = true; nameOn = true; capOn = true; exitW = pill("Exit ✕", false, 13, 18); }
  slider = vw <= 520 ? 66 : 104;
  nameW = vw <= 520 ? 120 : 220;
  const cap = capOn ? 11 * 5.5 + 10 : 0;
  const items = [
    ["play", 42],
    ...(nameOn ? [["name", nameW]] : []),
    ["volume", cap + slider],
    ["dim", cap + slider],
    ["tall", pill(labelOn ? "Pause all" : "", true, fsz, ppad)],
    ["Fit", pill("Fit", false, fsz, ppad)],
    ["Exit", exitW]
  ];
  const avail = vw - pad * 2;
  let line = 1, used = 0, lines = { 1: [] };
  for (const [name, w] of items) {
    const need = used ? used + gap + w : w;
    if (need > avail && used) { line++; lines[line] = []; used = w; }
    else used = need;
    lines[line].push(name);
  }
  return { avail, lines };
}

console.log("\nwhere each control lands:");
for (const vw of [1440, 1280, 1024, 820, 700, 600, 540, 500, 430, 390, 360]) {
  const { avail, lines } = layout(vw);
  const rows = Object.values(lines);
  const tallRow = rows.findIndex(r => r.includes("tall")) + 1;
  const flag = rows.length > 1 ? `  ⚠ ${rows.length} rows, Pause all on row ${tallRow}` : "";
  console.log(`  ${String(vw).padStart(4)}px (${Math.round(avail)} usable): ` +
    rows.map(r => r.join("+")).join(" | ") + flag);
}
