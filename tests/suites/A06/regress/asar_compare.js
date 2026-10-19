// 配布物（app.asar）の中の画面のファイルが、いまの dist と同じか（古いまま固めていないか）
const asar = require('/home/claude/pcd-viewer/node_modules/@electron/asar');
const fs = require('fs'), crypto = require('crypto');
const h = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
for (const rel of ['linux-unpacked/resources/app.asar', 'linux-arm64-unpacked/resources/app.asar', 'win-unpacked/resources/app.asar', 'mac/LiDAR Viewer.app/Contents/Resources/app.asar', 'mac-arm64/LiDAR Viewer.app/Contents/Resources/app.asar']) {
  const a = '/home/claude/pcd-viewer/release/' + rel;
  if (!fs.existsSync(a)) { console.log(rel, 'なし'); continue; }
  const res = {};
  for (const f of ['dist/index.html', 'dist/styles.css', 'dist/app.js', 'main.js', 'preload.js', 'package.json']) {
    try { const b = asar.extractFile(a, f); const cur = fs.readFileSync('/home/claude/pcd-viewer/' + f); res[f] = h(b) === h(cur) ? '同じ' : `違う（asar ${b.length} / 今 ${cur.length}）`; } catch (e) { res[f] = '読めない ' + e.message; }
  }
  console.log(rel, JSON.stringify(res));
}
