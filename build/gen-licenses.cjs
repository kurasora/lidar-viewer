// 同梱しているライブラリの使用許諾をまとめて build/THIRD_PARTY_LICENSES.txt を作る（配布物に同梱）
// 使い方: node build/gen-licenses.cjs   （ライブラリを入れ替えたら作り直す）
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
// 画面（dist/）に埋め込むもの・主プロセスで使うもの
const PKGS = ['three', 'fflate', 'geotiff', '@petamoriken/float16', 'lerc', 'pako', 'parse-headers', 'quick-lru',
  'web-worker', 'xml-utils', 'zstddec', 'laz-perf', 'draco3d', 'occt-import-js', 'web-ifc', 'ws'];
const SRC = {
  'occt-import-js': 'https://github.com/kovacsv/occt-import-js（OpenCASCADE: https://dev.opencascade.org/）',
  'web-ifc': 'https://github.com/ThatOpen/engine_web-ifc',
  'laz-perf': 'https://github.com/hobuinc/laz-perf',
  'draco3d': 'https://github.com/google/draco',
};
const COMMON = { 'Apache-2.0': 'Apache-2.0', 'MPL-2.0': 'MPL-2.0', 'LGPL-2.1': 'LGPL-2.1' };
const out = [
  'LiDAR Viewer — 同梱しているソフトウェアの使用許諾 / Third-party software licenses',
  '',
  'LiDAR Viewer は以下のオープンソースのソフトウェアを含みます。Electron と Chromium の使用許諾は',
  '同じフォルダの LICENSE.electron.txt と LICENSES.chromium.html にあります。',
  'LGPL-2.1（occt-import-js / OpenCASCADE）と MPL-2.0（web-ifc）の部品は、元のソースを下の入手先から得られます。',
  '',
];
for (const name of PKGS) {
  const dir = path.join(root, 'node_modules', name);
  let pj;
  try { pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { continue; }
  const lic = typeof pj.license === 'string' ? pj.license : (pj.license && pj.license.type) || '不明';
  const repo = SRC[name] || (pj.repository && (pj.repository.url || pj.repository)) || pj.homepage || '';
  out.push('='.repeat(78), `${pj.name} ${pj.version}  (${lic})`, repo ? `入手先 / Source: ${String(repo).replace(/^git\+/, '')}` : '', '-'.repeat(78));
  const f = fs.readdirSync(dir).find(n => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n));
  let text = f ? fs.readFileSync(path.join(dir, f), 'utf8') : '';
  if (!text && COMMON[lic]) {
    try { text = fs.readFileSync('/usr/share/common-licenses/' + COMMON[lic], 'utf8'); } catch { /* なし */ }
  }
  out.push(text.trim() || `License: ${lic}`, '');
}
fs.writeFileSync(path.join(__dirname, 'THIRD_PARTY_LICENSES.txt'), out.join('\n'));
console.log('wrote build/THIRD_PARTY_LICENSES.txt', PKGS.length, 'packages');
