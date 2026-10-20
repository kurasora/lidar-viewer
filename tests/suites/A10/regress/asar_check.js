// app.asar の中身を点検する
//   node asar_check.js <app.asar> [期待する asar 完全性の値（Info.plist / exe の INTEGRITY）]
// 出力: JSON（files: 一覧、checks: 点検結果）
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ASAR = process.env.ASAR_MOD || '/home/claude/pcd-viewer/node_modules/@electron/asar';
const asar = require(ASAR);

const file = process.argv[2];
const expectIntegrity = process.argv[3] || null;
const hdr = asar.getRawHeader(file);
const files = [];
(function walk(node, p) {
  for (const [name, n] of Object.entries(node.files || {})) {
    const q = p ? p + '/' + name : name;
    if (n.files) walk(n, q);
    else files.push({ path: q, size: n.size || 0, unpacked: !!n.unpacked, link: n.link || null, executable: !!n.executable, integrity: !!n.integrity });
  }
})(hdr.header, '');

// asar の完全性: ヘッダー（JSON 文字列）の sha256（Electron の ElectronAsarIntegrity と同じ求め方）
const headerHash = crypto.createHash('sha256').update(hdr.headerString).digest('hex');
const pkg = JSON.parse(asar.extractFile(file, 'package.json').toString());
const total = files.reduce((a, f) => a + f.size, 0);
const nm = [...new Set(files.filter(f => f.path.startsWith('node_modules/')).map(f => f.path.split('/').slice(0, f.path.split('/')[1].startsWith('@') ? 3 : 2).join('/')))];
const checks = [];
const bad = (ok, what, detail) => checks.push({ ok, what, detail });
// 0.4.0 から実行時の依存はない（以前は ws だけ）。node_modules が入っていないこと
bad(nm.length === 0, 'node_modules が入っていない（実行時の依存なし）', nm);
bad(!files.some(f => /\.map$/.test(f.path)), 'ソースマップ（*.map）がない', files.filter(f => /\.map$/.test(f.path)).map(f => f.path));
const devish = files.filter(f => /(^|\/)(src|tools|sample|samples|test|tests|build|release|dist-artifact|\.git|\.vscode)\//.test(f.path) && !f.path.startsWith('node_modules/') || /(^|\/)(build\.mjs|package-lock\.json|\.env|README\.md|CLAUDE\.md|\.DS_Store)$/.test(f.path) && !f.path.startsWith('node_modules/'));
bad(devish.length === 0, '開発用のファイル（src/ tools/ sample/ build.mjs など）が入っていない', devish.map(f => f.path));
const big = files.filter(f => f.size > 5e6).map(f => `${f.path} ${(f.size / 1e6).toFixed(1)} MB`);
bad(true, '5 MB を超えるファイル（参考）', big);
bad(!('devDependencies' in pkg) && !('scripts' in pkg) && !('build' in pkg), 'asar の package.json に devDependencies / scripts / build が残っていない', Object.keys(pkg));
bad(pkg.name === 'lidar-viewer' && pkg.productName === 'LiDAR Viewer', 'package.json の name / productName', { name: pkg.name, productName: pkg.productName, version: pkg.version, desktopName: pkg.desktopName || null });
const need = ['main.js', 'preload.js', 'dist/index.html', 'dist/app.js', 'dist/styles.css', 'assets/icon.png', 'package.json'];
bad(need.every(n => files.some(f => f.path === n)), '必要なファイルがそろっている', need.filter(n => !files.some(f => f.path === n)));if (expectIntegrity) bad(headerHash === expectIntegrity, 'asar の完全性の値（ヘッダーの sha256）が埋め込みの値と一致', { header: headerHash, embedded: expectIntegrity });
// 中のテキストに旧名が残っていないか（ファイルごとの出現数）
const oldName = [];
for (const f of files) {
  if (f.unpacked || f.link || f.size > 30e6) continue;
  const buf = asar.extractFile(file, f.path);
  const s = buf.toString('latin1');
  const m = s.match(/PCD ?Viewer|pcd-viewer|pcdviewer|PCDViewer/gi);
  if (m) oldName.push({ path: f.path, count: m.length, samples: [...new Set(m)].slice(0, 5) });
}
bad(true, '旧名（PCD Viewer / pcd-viewer / pcdviewer）の出現（参考）', oldName);
console.log(JSON.stringify({ file, headerSize: hdr.headerString.length, headerHash, totalBytes: total, count: files.length, node_modules: nm, pkg, files, checks }, null, 1));
