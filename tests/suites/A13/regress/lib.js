// 0.4.1 から: 画面には全部の点を持たない（f.positions はなく、先頭 20 万点の標本 f.sample だけ。点は読み込み時に混ぜてあるので無作為な標本）
// A13 試作ページ（アーティファクト version）の試験で共通に使う道具
//  ・claude.ai の枠の再現: 親（http://localhost:8830）と子（http://127.0.0.1:8831、アーティファクト役）の 2 つの http サーバー
//    子は CSP（下の CSP_PROFILES）と Permissions-Policy をヘッダーで返す。親は sandbox 付きの iframe で子を読む
//  ・Chromium の起動（WebGL は SwiftShader）、読み込みが終わるまで待つ、点群の統計を取る、など
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');
const PW_ROOT = process.env.PW_ROOT || execSync('npm root -g').toString().trim();
const pw = require(PW_ROOT + '/playwright');

const T = process.env.T || '/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv';
const W = process.env.W || path.join(T, 'work/A13');
const ART = process.env.ART || '/home/claude/pcd-viewer/dist-artifact/pcd-viewer.html';
const APP = process.env.APP || 'http://127.0.0.1:8740/abs/home/claude/pcd-viewer/dist/index.html';
const OUT = process.env.OUT || path.join(W, 'out');
fs.mkdirSync(OUT, { recursive: true });

const PARENT_PORT = +(process.env.PARENT_PORT || 8830), CHILD_PORT = +(process.env.CHILD_PORT || 8831);
const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`, CHILD_ORIGIN = `http://127.0.0.1:${CHILD_PORT}`;
const CDNS = 'https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com https://code.jquery.com';
// 公開記事（Pluto Security「Inside Claude Artifacts」）で分かっている部分:
//   default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'self' https://claude.ai …
// 分からない部分（style-src・img-src・font-src）は、アーティファクトで普通に使えている範囲で補った
const base = (o = {}) => [
  `default-src 'self'`,
  `script-src 'self' ${o.noEval ? '' : `'unsafe-eval'`} 'unsafe-inline' blob: ${CDNS}`,
  ...(o.workerSrc ? [`worker-src ${o.workerSrc}`] : []),
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `img-src ${o.img || `'self' data: blob:`}`,
  `media-src 'self' data: blob:`,
  `connect-src ${o.connect || `'self'`}`,
  `form-action 'self'`, `object-src 'none'`,
  `frame-ancestors 'self' ${PARENT_ORIGIN}`,
].join('; ');
const CSP_PROFILES = {
  none: null,                                   // CSP なし（ファイルを直接開いたときに近い）
  claude: base(),                               // 既知の部分 + 補った部分（いちばん本物に近いと思われるもの）
  claude_noblobimg: base({ img: `'self' data:` }), // 画像に blob: を許さない場合
  nowasm: base({ noEval: true }),               // eval / wasm を許さない場合（コードが想定している「wasm が使えない」）
  noworker: base({ workerSrc: `'none'` }),      // 別スレッド（Worker）を許さない場合
};
const PERMISSIONS_POLICY = 'fullscreen=(), clipboard-read=(), clipboard-write=(), camera=(), microphone=(), geolocation=(), display-capture=()';
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';

const SKEL_HEAD = fs.readFileSync(path.join(__dirname, 'claude_skeleton_head.html'));
const SKEL_TAIL = fs.readFileSync(path.join(__dirname, 'claude_skeleton_tail.html'));
let artCache = null;
function artHtml() { if (!artCache) artCache = fs.readFileSync(ART); return artCache; }

// 子（アーティファクト役）: /art.html?csp=claude&wrap=skeleton|raw&charset=1|0&pp=1|0
//   wrap=skeleton … claude.ai が公開のときに付ける「文書の骨組み」（doctype・charset・viewport-fit=cover・安全領域の余白）を付けた形
//   wrap=raw      … ビルドしたファイルそのまま（doctype・charset・viewport なし）
function childHandler(req, res) {
  const u = new URL(req.url, CHILD_ORIGIN);
  if (u.pathname === '/art.html') {
    const csp = CSP_PROFILES[u.searchParams.get('csp') || 'claude'];
    const wrap = u.searchParams.get('wrap') || 'skeleton';
    const charset = u.searchParams.get('charset') !== '0';
    let body = artHtml();
    // strip=padfix … ビルドが付ける「:root { padding: 0 !important; }」を外した version（骨組みの安全領域の余白が効くようにした比較用）
    if (u.searchParams.get('strip') === 'padfix') body = Buffer.from(body.toString('utf8').replace(':root { padding: 0 !important; }', ''), 'utf8');
    // claude.ai が公開のときに付ける骨組み（公開中のページを読んで、そのまま写したもの: claude_skeleton_head.html / _tail.html）
    if (wrap === 'skeleton') body = Buffer.concat([SKEL_HEAD, body, SKEL_TAIL]);
    const h = { 'content-type': 'text/html' + (charset ? '; charset=utf-8' : ''), 'cache-control': 'no-store' };
    if (csp) h['content-security-policy'] = csp;
    if (u.searchParams.get('pp') !== '0') h['permissions-policy'] = PERMISSIONS_POLICY;
    res.writeHead(200, h); res.end(body); return;
  }
  if (u.pathname === '/blank.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<!doctype html><title>blank</title>'); return; }
  res.writeHead(404); res.end('not found');
}
// 親（claude.ai 役）: /parent.html?<子への引数>&sandbox=<空白区切り|none>&w=幅&h=高さ
function parentHandler(req, res) {
  const u = new URL(req.url, PARENT_ORIGIN);
  if (u.pathname === '/parent.html') {
    const q = new URLSearchParams(u.searchParams);
    const sb = q.get('sandbox'); q.delete('sandbox');
    const allow = q.get('allow'); q.delete('allow');
    const w = q.get('w'), hh = q.get('h'); q.delete('w'); q.delete('h');
    const src = `${CHILD_ORIGIN}/art.html?${q.toString()}`;
    const sandboxAttr = sb === 'none' ? '' : ` sandbox="${(sb || SANDBOX).replace(/"/g, '')}"`;
    const allowAttr = allow ? ` allow="${allow.replace(/"/g, '')}"` : '';
    const size = w ? `width:${w}px;height:${hh || 600}px` : 'width:100%;height:100%';
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>claude.ai 役</title>
<style>html,body{margin:0;height:100%;background:#f5f4ef} iframe{border:0;display:block;${size}}</style></head>
<body><iframe id="art" title="artifact" src="${src}"${sandboxAttr}${allowAttr}></iframe></body></html>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(html); return;
  }
  res.writeHead(404); res.end('not found');
}
async function startServers() {
  const servers = [];
  const listen = (handler, port, host) => new Promise((ok, ng) => { const s = http.createServer(handler); s.on('error', ng); s.listen(port, host, () => { servers.push(s); ok(); }); });
  await listen(childHandler, CHILD_PORT, '127.0.0.1');
  await listen(parentHandler, PARENT_PORT, '127.0.0.1');
  try { await listen(parentHandler, PARENT_PORT, '::1'); } catch (e) { /* IPv6 がなくてもよい */ }
  return { close: () => Promise.all(servers.map(s => new Promise(r => { s.closeAllConnections?.(); s.close(() => r()); }))) };
}
const parentURL = (params = {}) => `${PARENT_ORIGIN}/parent.html?${new URLSearchParams(params).toString()}`;
const childURL = (params = {}) => `${CHILD_ORIGIN}/art.html?${new URLSearchParams(params).toString()}`;

async function launch(extraArgs = []) {
  return pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--allow-file-access-from-files', ...extraArgs],
  });
}

// どの枠でも最初に動かす計測: alert などの呼び出し、CSP の違反、a.download のクリック、長いタスク
const INSTRUMENT = `(() => {
  if (window.__a13) return;
  const L = window.__a13 = { log: [], longtasks: [] };
  const push = o => { try { L.log.push(Object.assign({ t: Math.round(performance.now()) }, o)); } catch (e) {} };
  for (const k of ['alert', 'confirm', 'prompt', 'print']) {
    const orig = window[k];
    try { window[k] = function (...a) { push({ k, a: a.map(x => String(x).slice(0, 80)) }); return orig ? orig.apply(this, a) : undefined; }; } catch (e) {}
  }
  document.addEventListener('securitypolicyviolation', e => push({ k: 'csp', dir: e.violatedDirective, uri: String(e.blockedURI).slice(0, 60), src: (e.sourceFile || '').slice(-40), line: e.lineNumber }), true);
  const oc = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { push({ k: 'a.click', download: this.download, href: String(this.href || '').slice(0, 30) }); return oc.call(this); };
  for (const [o, m] of [[Element.prototype, 'requestFullscreen'], [window, 'open']]) {
    const f = o[m]; if (!f) continue;
    o[m] = function (...a) { push({ k: m }); return f.apply(this, a); };
  }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) L.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
})();`;

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, deviceScaleFactor: opts.dpr || 1, isMobile: !!opts.isMobile, hasTouch: !!opts.hasTouch, colorScheme: opts.colorScheme || 'dark', acceptDownloads: true, ...(opts.ctx || {}) });
  await ctx.addInitScript(INSTRUMENT);
  if (opts.init) for (const s of [].concat(opts.init)) await ctx.addInitScript(s);
  const page = await ctx.newPage();
  const logs = { console: [], pageerror: [], downloads: [], popups: [], dialogs: [], requestsFailed: [], http: [] };
  page.on('response', r => { if (r.status() >= 400) logs.http.push(`${r.status()} ${r.url().slice(0, 100)}`); });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.console.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => logs.pageerror.push(String(e.message).slice(0, 300)));
  page.on('download', d => logs.downloads.push(d.suggestedFilename()));
  page.on('popup', p => logs.popups.push(p.url()));
  page.on('dialog', d => { logs.dialogs.push(`${d.type()}: ${d.message()}`); d.dismiss().catch(() => {}); });
  page.on('requestfailed', r => logs.requestsFailed.push(`${r.url().slice(0, 80)} ${r.failure() && r.failure().errorText}`));
  page.on('worker', w => { try { w.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.console.push(`[worker ${m.type()}] ${m.text().slice(0, 300)}`); }); } catch (e) {} });
  return { ctx, page, logs };
}

// 子の枠（アーティファクト）を探す
async function artFrame(page, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const f = page.frames().find(fr => fr.url().startsWith(CHILD_ORIGIN + '/art.html'));
    if (f) return f;
    await page.waitForTimeout(100);
  }
  throw new Error('アーティファクトの枠が見つかりません');
}

// 起動直後の読み込み（地図＋軌跡＋自動の水平補正）が終わるまで待つ。終わったときの performance.now() も返す
async function waitStartup(frame, limit = 180000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < limit) {
    const s = await frame.evaluate(() => {
      const P = window.__pcd; if (!P) return { ready: false, now: performance.now() };
      const S = P.S;
      return { ready: true, files: S.files.length, trajs: S.trajs.length, level: !!S.levelInfo, progress: !document.getElementById('progress').hidden, msg: document.getElementById('statMsg').textContent, err: !!document.getElementById('statMsg').style.color, now: performance.now() };
    }).catch(e => ({ ready: false, error: e.message }));
    last = s;
    if (s.ready && s.files >= 1 && s.trajs >= 1 && s.level && !s.progress) return s;
    if (s.ready && s.err) return s;
    await new Promise(r => setTimeout(r, 100));
  }
  return { ...last, timedOut: true };
}

// 読み込みが終わるまで待つ: 進み具合の表示が消え、[ファイル数・軌跡数・知らせ・seq] が stableMs 変わらない
async function waitIdle(frame, { limit = 120000, stableMs = 1200, seq0 = null } = {}) {
  const t0 = Date.now();
  let last = '', since = Date.now();
  while (true) {
    const s = await frame.evaluate(() => { const S = window.__pcd.S; const m = document.getElementById('statMsg'); return JSON.stringify([document.getElementById('progress').hidden, S.files.length, S.trajs.length, m.textContent, S.seq, !!m.style.color]); });
    if (s !== last) { last = s; since = Date.now(); }
    const a = JSON.parse(s);
    const started = seq0 == null || a[4] > seq0 || a[5];
    if (a[0] && started && Date.now() - since > stableMs) return { ms: Date.now() - t0, timedOut: false };
    if (Date.now() - t0 > limit) return { ms: Date.now() - t0, timedOut: true, last: a };
    await new Promise(r => setTimeout(r, 150));
  }
}

// 開いている点群の統計（座標は offset を足し戻した値。水平補正の行列は掛けない）
async function fileStats(frame, ids = null) {
  return frame.evaluate(async (ids) => {
    const S = window.__pcd.S, o = S.offset || [0, 0, 0];
    const list = S.files.filter(f => !ids || ids.includes(f.id));
    // 全部の座標は別スレッドから借りる（f.sample は先頭 20 万点だけ）
    const bufs = {}; for (const f of list) bufs[f.id] = (await window.__pcd.call({ type: 'buffers', id: f.id })).positions;
    const files = list.map(f => {
      const P = bufs[f.id], n = f.n;
      const m = [0, 0, 0], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      const ax = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = P[3 * i + k] + o[k]; ax[k][i] = v; m[k] += v; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
      // 座標の細かさ: 並べた値の、0 でない隣どうしの差の最小（量子化されていると 0.0625 や 0.25 になる）
      const minGap = ax.map(a => { const s = Float64Array.from(a.subarray(0, Math.min(n, 200000))).sort(); let g = Infinity; for (let i = 1; i < s.length; i++) { const d = s[i] - s[i - 1]; if (d > 0 && d < g) g = d; } return g === Infinity ? null : +g.toPrecision(3); });
      return { id: f.id, name: f.name, n, total: f.total, sampled: !!f.sampled, fmt: f.header && f.header.data, note: f.header && f.header.note, fields: f.header && f.header.fields && f.header.fields.join(' '), rgb: f.hasRgb, mean: m.map(v => +(v / Math.max(1, n)).toFixed(4)), min: lo.map(v => +v.toFixed(4)), max: hi.map(v => +v.toFixed(4)), minGap };
    });
    const el = document.getElementById('statMsg');
    return { files, trajs: S.trajs.map(t => ({ name: t.name, count: t.count })), offset: S.offset, msg: el.textContent, msgIsError: !!el.style.color };
  }, ids);
}

// 並べた座標（軸ごと）を取り出す（2 つの読み込み結果を点ごとに比べるため）
async function sortedAxes(frame, id, maxN = 200000) {
  return frame.evaluate(async ([id, maxN]) => {
    const S = window.__pcd.S, o = S.offset || [0, 0, 0];
    const f = S.files.find(x => x.id === id); if (!f) return null;
    const P = (await window.__pcd.call({ type: 'buffers', id: f.id })).positions;
    const n = Math.min(f.n, maxN), out = [];
    for (let k = 0; k < 3; k++) { const a = new Float64Array(f.n); for (let i = 0; i < f.n; i++) a[i] = P[3 * i + k] + o[k]; a.sort(); out.push(Array.from(a.subarray(0, n))); }
    return out;
  }, [id, maxN]);
}

async function closeAll(frame, keepIds = []) {
  await frame.evaluate((keep) => {
    // 1 つ閉じると一覧が作り直される（前に取った要素は外れる）ので、毎回取り直して、閉じる物がなくなるまで続ける
    //（以前は 2 つ目以降が残り、そのシフトが次のファイルに使われていた）
    const next = () => [...document.querySelectorAll('#fileList li')].find(li => !keep.includes(+li.dataset.id) && li.querySelector('[data-act=remove]'));
    for (let i = 0, li; i < 200 && (li = next()); i++) li.querySelector('[data-act=remove]').click();
    for (let i = 0, x; i < 200 && (x = document.querySelector('#trajList [data-act=tremove]')); i++) x.click();
    document.getElementById('statMsg').textContent = '';
  }, keepIds);
}
async function closeFilesExcept(frame, keepIds) {
  await frame.evaluate((keep) => {
    const next = () => [...document.querySelectorAll('#fileList li')].find(li => !keep.includes(+li.dataset.id) && li.querySelector('[data-act=remove]'));
    for (let i = 0, li; i < 200 && (li = next()); i++) li.querySelector('[data-act=remove]').click();
    document.getElementById('statMsg').textContent = '';
  }, keepIds);
}

// 埋め込みサンプルのボタンの一覧
async function chipList(frame) {
  return frame.evaluate(() => [...document.querySelectorAll('#fmtSampleList button[data-sg]')].map(b => ({ group: b.dataset.sg, index: +b.dataset.si, label: b.textContent })));
}

// /proc から、ある PID の子孫プロセスの RSS 合計（MB）
function treeRssMB(rootPid) {
  const kids = {}; const rss = {};
  for (const p of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(p)) continue;
    try {
      const st = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); const r = st.slice(st.lastIndexOf(')') + 2).split(' ');
      (kids[+r[1]] = kids[+r[1]] || []).push(+p);
      rss[+p] = +fs.readFileSync(`/proc/${p}/statm`, 'utf8').split(' ')[1] * 4096;
    } catch (e) { /* 消えた */ }
  }
  let tot = rss[rootPid] || 0; const st = [rootPid];
  while (st.length) { const x = st.pop(); for (const c of kids[x] || []) { tot += rss[c] || 0; st.push(c); } }
  return Math.round(tot / 1048576);
}

function writeJSON(name, obj) { const p = path.join(OUT, name); fs.writeFileSync(p, JSON.stringify(obj, null, 1)); return p; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { pw, T, W, ART, APP, OUT, PARENT_ORIGIN, CHILD_ORIGIN, CSP_PROFILES, PERMISSIONS_POLICY, SANDBOX, startServers, parentURL, childURL, launch, newPage, artFrame, waitStartup, waitIdle, fileStats, sortedAxes, closeAll, closeFilesExcept, chipList, treeRssMB, writeJSON, sleep, INSTRUMENT };
