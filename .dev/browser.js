/* Layout and behaviour checks that need a real browser.
 *
 * Why this exists. verify.js, layout.js, ios.js and audit.js all read the
 * source, and the preview harness writes markup by hand. Every one of them
 * passed while the shipped app was visibly broken, three separate times:
 *
 *   the level control was a <button>, so a generic button{height:44px} rule
 *   centred and clipped it and the waveform vanished on every row;
 *
 *   paintWave rewrote the control's class to "wave" on first paint, deleting
 *   .band from the element, so the name, the distance and the waveform
 *   collapsed onto one 30px line;
 *
 *   body.theatre-on .page{display:none} hid the page, and the visualiser's
 *   video is a descendant of the page, so the visualiser showed nothing.
 *
 * None of those are visible in the source. All three are obvious the moment
 * something measures a laid-out box. That is the entire job of this file.
 *
 * No dependencies: Chrome is driven over the DevTools protocol using the
 * WebSocket and fetch that Node already ships with.
 *
 * Usage:  node .dev/browser.js [url]      default: the local index.html
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 9411;
const TARGET = process.argv[2] ||
  'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
function ok(name, cond, detail){
  if (cond){ pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  :: ' + detail : '')); }
}

function findChrome(){
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const guesses = process.platform === 'win32'
    ? [ process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe' ]
    : [ '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser', '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ];
  return guesses.find(p => p && fs.existsSync(p)) || null;
}

/* The smallest usable DevTools client. */
function connect(url){
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    const waiting = new Map();
    const events = [];
    let next = 1;
    ws.onopen = () => res({
      send(method, params){
        const id = next++;
        ws.send(JSON.stringify({ id, method, params: params || {} }));
        return new Promise((done, no) => {
          waiting.set(id, { done, no });
          setTimeout(() => {
            if (waiting.has(id)){ waiting.delete(id); no(new Error(method + ' timed out')); }
          }, 20000);
        });
      },
      events,
      close(){ try { ws.close(); } catch (e){} }
    });
    ws.onerror = () => rej(new Error('cannot open ' + url));
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && waiting.has(msg.id)){
        const w = waiting.get(msg.id); waiting.delete(msg.id);
        if (msg.error) w.no(new Error(msg.error.message)); else w.done(msg.result);
      } else if (msg.method) events.push(msg);
    };
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main(){
  const chrome = findChrome();
  if (!chrome){
    const msg = 'Chrome not found. Set CHROME_PATH to run these checks.';
    if (process.env.CI){ console.log('  FAIL  ' + msg); process.exit(1); }
    console.log('\n  SKIP  ' + msg + '\n');
    return;
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'murmur-cdp-'));
  const proc = spawn(chrome, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--disable-extensions', '--mute-audio', '--window-size=1280,900',
    '--allow-file-access-from-files', 'about:blank'
  ], { stdio: 'ignore' });

  try {
    let page = null;
    for (let i = 0; i < 60 && !page; i++){
      await sleep(250);
      try {
        const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
        page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch (e){ /* not up yet */ }
    }
    if (!page) throw new Error('Chrome did not expose a page target');

    const cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const evaluate = async (expr) => {
      const r = await cdp.send('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' +
        ((r.exceptionDetails.exception || {}).description || ''));
      return r.result.value;
    };

    console.log('\n=== murmur browser checks ===');
    console.log('  ' + TARGET + '\n');

    await cdp.send('Page.navigate', { url: TARGET });
    await sleep(2500);

    /* The empty state. */
    const empty = await evaluate('(() => {' +
      'const m = document.getElementById("masterVol");' +
      'const r = m && m.getBoundingClientRect();' +
      'return { rows: document.querySelectorAll("#grid li").length,' +
      ' masterOnPage: !!m && !m.closest(".sheet"),' +
      ' masterVisible: !!r && r.width > 40,' +
      ' bodyHeight: Math.round(document.body.getBoundingClientRect().height),' +
      ' viewport: innerHeight };})()');
    ok('the empty state has no rows', empty.rows === 0, 'rows=' + empty.rows);
    ok('master level is on the player, not inside a sheet', empty.masterOnPage);
    ok('master level is actually visible', empty.masterVisible);
    ok('the empty page does not leave a tall void',
      empty.bodyHeight < empty.viewport * 1.2,
      'body ' + empty.bodyHeight + 'px vs viewport ' + empty.viewport + 'px');

    /* A preset loads. */
    await evaluate('(() => { document.getElementById("btnOpenMixes").click(); return 1; })()');
    await sleep(500);
    const presetName = await evaluate('(() => {' +
      'const p = document.querySelector("#presets .preset"); if (!p) return null;' +
      'const n = p.textContent.trim().split("\\n")[0]; p.click(); return n; })()');
    ok('a starter preset can be loaded', !!presetName, 'got ' + presetName);
    await sleep(3000);

    /* Every row is laid out rather than collapsed. This is the check that
       would have caught all three of the shipped bugs above. */
    const rows = await evaluate('(() => {' +
      'return [...document.querySelectorAll("#grid li")].map((li, i) => {' +
      ' const g = (sel) => { const el = li.querySelector(sel); if (!el) return null;' +
      '  const r = el.getBoundingClientRect();' +
      '  return { tag: el.tagName, top: Math.round(r.top), bottom: Math.round(r.bottom),' +
      '   w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display }; };' +
      ' return { i, band: g(".band"), cap: g(".cap"), wave: g(".wave"),' +
      '  strokes: li.querySelectorAll(".strokes i").length,' +
      '  overflows: li.scrollWidth > li.clientWidth + 1 };});})()');

    ok('the preset produced rows', rows.length > 0, rows.length + ' rows');
    rows.forEach(r => {
      const n = 'row ' + (r.i + 1);
      ok(n + ': the level control exists', !!r.band);
      if (!r.band) return;
      ok(n + ': the control is not a button', r.band.tag !== 'BUTTON', 'is a ' + r.band.tag);
      ok(n + ': the control is tall enough for two lines', r.band.h >= 50, r.band.h + 'px');
      ok(n + ': the title and the waveform are stacked, not collapsed',
        !!r.cap && !!r.wave && r.wave.top >= r.cap.bottom - 1,
        r.cap && r.wave ? 'cap ends ' + r.cap.bottom + ', wave starts ' + r.wave.top : 'missing');
      ok(n + ': the waveform has its full height', !!r.wave && r.wave.h >= 24,
        r.wave ? r.wave.h + 'px' : 'missing');
      ok(n + ': the waveform drew its strokes', r.strokes > 100, r.strokes + ' strokes');
      ok(n + ': a long title does not overflow the row', !r.overflows);
    });

    /* The visualiser actually shows the video. */
    await evaluate('(() => {' +
      'const row = document.querySelector("#grid li");' +
      'const chev = row && row.querySelector(".more"); if (chev) chev.click();' +
      'const tv = row && row.querySelector("[id^=tv_]"); if (tv) tv.click(); return 1; })()');
    await sleep(2500);
    const th = await evaluate('(() => {' +
      'const t = document.querySelector(".thumb.theatre"); if (!t) return { present: false };' +
      'const r = t.getBoundingClientRect();' +
      'return { present: true, display: getComputedStyle(t).display,' +
      ' w: Math.round(r.width), h: Math.round(r.height),' +
      ' hasFrame: !!t.querySelector("iframe"), vw: innerWidth, vh: innerHeight };})()');
    ok('the visualiser puts the video on screen',
      th.present && th.display !== 'none', JSON.stringify(th));
    ok('the visualised video fills the viewport',
      th.present && th.w >= th.vw * 0.9 && th.h >= th.vh * 0.9,
      th.present ? th.w + 'x' + th.h + ' in ' + th.vw + 'x' + th.vh : 'absent');
    ok('the visualiser keeps the player rendered', !!th.hasFrame);

    await evaluate('(() => { const x = document.getElementById("texit"); if (x) x.click(); return 1; })()');
    await sleep(1200);
    const back = await evaluate('(() => ({ gone: !document.querySelector(".thumb.theatre"),' +
      ' rows: [...document.querySelectorAll("#grid li")]' +
      '  .filter(el => getComputedStyle(el).display !== "none").length }))()');
    ok('leaving the visualiser restores every row',
      back.gone && back.rows === rows.length, JSON.stringify(back));

    /* The surface took the time of night. */
    const night = await evaluate('(() => { const s = document.documentElement.style;' +
      ' return { ground: s.getPropertyValue("--night").trim(),' +
      '  ink: s.getPropertyValue("--ink").trim() };})()');
    ok('the surface has taken the time of night',
      /^#[0-9a-f]{6}$/i.test(night.ground) && /^#[0-9a-f]{6}$/i.test(night.ink),
      JSON.stringify(night));

    /* Nothing threw. A file:// run cannot load the YouTube iframe, which is
       a property of the test setup rather than a fault in the app. */
    const thrown = cdp.events
      .filter(e => e.method === 'Runtime.exceptionThrown')
      .map(e => (e.params.exceptionDetails.exception || {}).description ||
                 e.params.exceptionDetails.text)
      .filter(t => !/frame|X-Frame|refused to (display|connect)/i.test(String(t)));
    ok('no uncaught exceptions', thrown.length === 0, thrown.slice(0, 2).join(' | '));

    cdp.close();
  } finally {
    try { proc.kill(); } catch (e){}
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  if (fail) process.exit(1);
}

main().catch(e => {
  console.error('\n  browser checks could not run: ' + e.message + '\n');
  process.exit(1);
});
