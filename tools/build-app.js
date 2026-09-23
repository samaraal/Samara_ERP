#!/usr/bin/env node
/*
 * Samara ERP - build app.js from the small files in src/app/
 *
 *   node tools/build-app.js          -> rebuilds app.js
 *   node tools/build-app.js --check  -> only checks that app.js matches src/app (changes nothing)
 *
 * The files in src/app/ are joined top-to-bottom in the order listed in
 * src/app/manifest.json. They all share ONE closure, so a helper defined in one
 * file can be used by any file listed after it (exactly as in the old app.js).
 * If the joined result has a JavaScript syntax error, app.js is NOT written,
 * so a broken edit can never reach the live site through this script.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src', 'app');
const outFile = path.join(root, 'app.js');
const checkOnly = process.argv.includes('--check');

const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
const listed = new Set(manifest.files.map(f => f.file));

// Every .js file in src/app must be listed (catches a new file that was forgotten)
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const unlisted = walk(srcDir).filter(f => f.endsWith('.js'))
  .map(f => path.relative(srcDir, f).split(path.sep).join('/'))
  .filter(f => !listed.has(f));
if (unlisted.length) fail(`These files are in src/app but not in manifest.json:\n  ${unlisted.join('\n  ')}`);

let output = '';
for (const { file } of manifest.files) {
  const p = path.join(srcDir, file);
  if (!fs.existsSync(p)) fail(`manifest.json lists ${file} but the file does not exist`);
  output += fs.readFileSync(p, 'utf8');
}

// Syntax check without running anything
try { new vm.Script(output, { filename: 'app.js' }); }
catch (e) {
  const line = (e.stack.match(/app\.js:(\d+)/) || [])[1];
  fail(`Syntax error in joined app.js${line ? ' at or just before line ' + line + ' (' + whichFile(+line) + ')' : ''}:\n  ${e.message}`);
}

// Version consistency check
const v = (output.match(/const APP_VERSION = '([^']+)'/) || [])[1];
const warn = [];
for (const f of ['index.html', 'service-worker.js', 'bootstrap-error.js']) {
  const fp = path.join(root, f);
  if (v && fs.existsSync(fp) && !fs.readFileSync(fp, 'utf8').includes(v)) warn.push(`${f} does not mention version ${v}`);
}

if (checkOnly) {
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  if (current !== output) fail('app.js does NOT match src/app. Someone edited app.js directly, or forgot to run the build.\nRun: node tools/build-app.js');
  console.log(`OK: app.js matches src/app (${manifest.files.length} files, version ${v}).`);
} else {
  fs.writeFileSync(outFile, output);
  console.log(`Built app.js from ${manifest.files.length} files (${output.split('\n').length} lines, version ${v}).`);
}
warn.forEach(w => console.warn('WARNING: ' + w));

function whichFile(lineNo) {
  let n = 0;
  for (const { file } of manifest.files) {
    const c = fs.readFileSync(path.join(srcDir, file), 'utf8').split('\n').length - 1;
    if (lineNo <= n + c) return `src/app/${file}, line ${lineNo - n}`;
    n += c;
  }
  return 'unknown file';
}
function fail(msg) { console.error('BUILD FAILED: ' + msg); process.exit(1); }
