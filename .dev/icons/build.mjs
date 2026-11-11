/* Build every icon the app ships from three SVG sources.

   Run from the repo root:  node .dev/icons/build.mjs
   Needs Chrome (to rasterise) and ffmpeg (to resample). Writes the finished
   files into the repo root, replacing what is there.

   Rasterise ONCE at 512, then downscale. An earlier version rendered every
   size in its own Chrome viewport, which produced mush at 32px and worse at
   16: Chrome has a minimum window size, so a 16x16 viewport is not really
   honoured, and the results came back with colour fringing. */
import { Browser } from
  'file:///C:/Users/rowle/AppData/Local/hermes/skills/creative/taste-skill/scripts/lib/cdp.mjs';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO = 'C:/Users/rowle/ambience-mixer';
const TMP  = process.env.LOCALAPPDATA + '/Temp/icons';
fs.mkdirSync(TMP, { recursive: true });

/* Shipped files go to the repo root; only the 16 and 48 used inside the
   .ico stay in temp, because nothing else references them. */
const SHIPPED=['icon-192.png','apple-touch-icon.png','favicon-32.png'];
const OUT=(n)=> SHIPPED.includes(n) ? REPO+'/'+n : path.join(TMP,n);

const SRC = {
  standard: fs.readFileSync(REPO + '/icon.svg', 'utf8'),
  maskable: fs.readFileSync(REPO + '/.dev/icons/icon-maskable.svg', 'utf8'),
  /* a pixel-aligned redraw for 16 and 32, where the full mark turns to mush */
  small: fs.readFileSync(REPO + '/.dev/icons/icon-small.svg', 'utf8')
};

function wrapper(svg){
  return '<!DOCTYPE html><meta charset="utf-8">' +
    '<style>html,body{margin:0;padding:0;overflow:hidden;background:#131211}' +
    'svg{display:block;width:100vw;height:100vh}</style>' + svg;
}

const browser = await Browser.launch({ width: 512, height: 512 });
for (const [name, svg] of Object.entries(SRC)){
  const html = path.join(TMP, name + '.html');
  fs.writeFileSync(html, wrapper(svg));
  const p = await browser.newPage({ width: 512, height: 512 });
  await p.goto('file:///' + html.replace(/\\/g, '/'), { settleMs: 500 });
  await p.screenshot({ path: path.join(TMP, 'master-' + name + '.png') });
  console.log('rasterised ' + name + ' at 512');
}
await browser.close();

function scale(from, to, size, flag){
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(TMP, from),
    '-vf', 'scale=' + size + ':' + size + ':flags=' + (flag || 'lanczos'),
    OUT(to)]);
  return Math.round(fs.statSync(OUT(to)).size / 102.4) / 10;
}

fs.copyFileSync(path.join(TMP,'master-standard.png'), REPO+'/icon-512.png');
fs.copyFileSync(path.join(TMP,'master-maskable.png'), REPO+'/icon-maskable-512.png');
console.log('icon-512.png'.padEnd(24) + '512px');
console.log('icon-maskable-512.png'.padEnd(24) + '512px');

const DERIVED = [
  ['master-standard.png', 'icon-192.png', 192, 'lanczos'],
  ['master-standard.png', 'apple-touch-icon.png', 180, 'lanczos'],
  ['master-standard.png', 'ico-48.png', 48, 'lanczos'],
  /* The small design is drawn on a 16 unit grid and rasterised at 512, an
     exact 32x. Box-averaging it back down lands every edge on a pixel
     boundary, which is why these stay crisp where a lanczos reduction of
     the full mark did not. */
  ['master-small.png', 'favicon-32.png', 32, 'area'],
  ['master-small.png', 'ico-16.png', 16, 'area']
];
for (const [from, to, size, flag] of DERIVED){
  console.log(to.padEnd(24) + size + 'px  ' + scale(from, to, size, flag) + ' KB');
}

/* favicon.ico: a small directory followed by whole PNG files */
function ico(entries){
  const imgs = entries.map(e => ({ size: e.size, data: fs.readFileSync(path.join(TMP, e.file)) }));
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(imgs.length, 4);
  const dir = Buffer.alloc(16 * imgs.length);
  let offset = head.length + dir.length;
  imgs.forEach((im, i) => {
    const b = i * 16;
    dir.writeUInt8(im.size >= 256 ? 0 : im.size, b);
    dir.writeUInt8(im.size >= 256 ? 0 : im.size, b + 1);
    dir.writeUInt8(0, b + 2);
    dir.writeUInt8(0, b + 3);
    dir.writeUInt16LE(1, b + 4);
    dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(im.data.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += im.data.length;
  });
  return Buffer.concat([head, dir, ...imgs.map(i => i.data)]);
}

const buf = ico([
  { size: 16, file: 'ico-16.png' },
  { size: 32, file: 'favicon-32.png' },
  { size: 48, file: 'ico-48.png' }
]);
fs.writeFileSync(REPO+'/favicon.ico', buf);
console.log('favicon.ico'.padEnd(24) + '16/32/48  ' + Math.round(buf.length / 102.4) / 10 + ' KB');
