/* A check that has never failed proves nothing. Reintroduce the real bugs
   into a throwaway copy and confirm the browser checks catch each one. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'index.html');
const TMP = os.tmpdir();
const html = fs.readFileSync(SRC, 'utf8');

const MUTANTS = [
  { name: 'paintWave deletes the control class (shipped in PR #43 to #46)',
    from: 'w.className=L.volume>0?"band":"band off";',
    to:   'w.className=L.volume>0?"wave":"wave off";' },
  { name: 'the visualiser hides the page that holds its video (shipped in PR #45)',
    from: 'body.theatre-on .page > :not(.sounds){display:none}',
    to:   'body.theatre-on .page{display:none}' }
];

let caught = 0;
for (const m of MUTANTS){
  if (!html.includes(m.from)){ console.log('SKIP  anchor gone: ' + m.name); continue; }
  const file = path.join(TMP, 'mutant-' + Math.abs(m.name.length * 7919) + '.html');
  fs.writeFileSync(file, html.replace(m.from, m.to));

  let out = '', code = 0;
  try {
    out = execFileSync('node', [path.resolve(__dirname, 'browser.js'),
      'file:///' + file.replace(/\\/g, '/')], { encoding: 'utf8', timeout: 180000 });
  } catch (e){ out = (e.stdout || '') + (e.stderr || ''); code = e.status || 1; }

  const fails = (out.match(/^\s*FAIL/gm) || []).length;
  if (code !== 0 && fails > 0){
    caught++;
    const first = (out.match(/^\s*FAIL.*$/m) || [''])[0].trim();
    console.log('CAUGHT  ' + m.name);
    console.log('        ' + fails + ' failures, first: ' + first.slice(0, 96));
  } else {
    console.log('MISSED  ' + m.name + '   (exit ' + code + ', ' + fails + ' failures)');
  }
  fs.unlinkSync(file);
}

console.log('\n' + caught + '/' + MUTANTS.length + ' known bugs caught');
process.exit(caught === MUTANTS.length ? 0 : 1);
