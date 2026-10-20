// A09（性能・メモリ）の試験で共通に使う部品
//   launch()      … Chromium（dist/index.html）または Electron（main.js / 配布物）を起動し、計測の仕掛けを入れたページを返す
//   Mem           … 起動したプロセス（ブラウザ・画面・GPU など）の RSS / PSS を一定間隔で見張る（Linux の /proc。無ければ Electron の getAppMetrics）
//   heap()        … 画面とワーカーの JS ヒープ（CDP の Runtime.getHeapUsage。ArrayBuffer の分 backingStorageSize も）
//   gc()          … 画面とワーカーで GC を走らせる
//   openFiles()   … #fileInput にファイルを入れて、読み込み・点の間隔・水平補正が終わるまで待つ
//   closeAll()    … 一覧の × を全部押す
// 環境変数: PAGE（Chromium で開くページ）、APPDIR（Electron のアプリのフォルダ）、ELECTRON（Electron の実行ファイル。配布物の exe なども可）
const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(cp.execSync('npm root -g').toString().trim() + '/playwright'); }

const HAS_PROC = fs.existsSync('/proc/self/statm');
const PAGESZ = 4096;

// ページに入れる計測の仕掛け: ワーカーとのやりとりの時刻、進み具合の表示の変化、長いタスク、フレームの間隔
const INIT = () => {
  const P = window.__perf = { t0: performance.now(), msgs: [], sent: [], prog: [], longtasks: [], frames: { n: 0, last: 0, maxGap: 0, gaps100: 0, gaps500: 0, gapsList: [] }, files: [], statMsgs: [], errors: [] };
  const OW = window.Worker;
  window.Worker = function (...a) {
    const w = new OW(...a);
    P.worker = w;
    w.addEventListener('message', e => {
      const m = e.data || {};
      const rec = [performance.now(), m.type, m.phase || '', m.p == null ? null : m.p, m.id == null ? null : m.id];
      if (m.type === 'error') rec.push(m.message);
      if (m.type === 'loaded') rec.push({ n: m.n, total: m.total, sampled: m.sampled });
      if (m.type === 'spacing') rec.push(m.spacing);
      P.msgs.push(rec);
    });
    const op = w.postMessage.bind(w);
    w.postMessage = (m, t) => { P.sent.push([performance.now(), m && m.type, m && m.id]); return op(m, t); };
    return w;
  };
  window.Worker.prototype = OW.prototype;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.longtasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* なし */ }
  const fr = now => {
    const F = P.frames;
    if (F.last) { const g = now - F.last; if (g > F.maxGap) F.maxGap = g; if (g > 100) { F.gaps100++; if (F.gapsList.length < 200) F.gapsList.push([Math.round(F.last), Math.round(g)]); } if (g > 500) F.gaps500++; }
    F.last = now; F.n++;
    const S = window.__pcd && window.__pcd.S;
    // 一覧が変わった時刻は、rAF の時刻（フレームの始まり）ではなく、実際にこの処理が動いた時刻で記録する
    if (S && S.files.length !== P.files.length) { P.files = S.files.map(f => f.id); P.filesAt = P.filesAt || []; P.filesAt.push([performance.now(), S.files.length]); }
    requestAnimationFrame(fr);
  };
  requestAnimationFrame(fr);
  const watch = () => {
    const bar = document.getElementById('progressBar'), box = document.getElementById('progress'), txt = document.getElementById('progressText'), msg = document.getElementById('statMsg');
    if (!bar || !box || !msg) { setTimeout(watch, 20); return; }
    const rec = () => P.prog.push([performance.now(), box.hidden ? -1 : parseFloat(bar.style.width) || 0, txt.textContent]);
    new MutationObserver(rec).observe(bar, { attributes: true, attributeFilter: ['style'] });
    new MutationObserver(rec).observe(box, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(() => P.statMsgs.push([performance.now(), msg.textContent, !!msg.style.color])).observe(msg, { childList: true, characterData: true, subtree: true, attributes: true });
  };
  watch();
  window.addEventListener('error', e => P.errors.push('error: ' + e.message));
  window.addEventListener('unhandledrejection', e => P.errors.push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));
};

function descendants(root) {
  const kids = new Map();
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const s = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      const ppid = +s.slice(s.lastIndexOf(')') + 2).split(' ')[1];
      if (!kids.has(ppid)) kids.set(ppid, []);
      kids.get(ppid).push(+d);
    } catch (e) { /* 消えた */ }
  }
  const out = [], st = [root];
  while (st.length) { const x = st.pop(); for (const c of kids.get(x) || []) { out.push(c); st.push(c); } }
  return out;
}
function kindOf(pid) {
  try {
    let c = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    if (c.length === 1) c = c[0].split(' '); // Chromium は子プロセスのコマンド行を 1 本の文字列に書き換える
    const exe = path.basename(c[0] || '');
    const t = (c.find(a => a.startsWith('--type=')) || '').slice(7);
    if (/xvfb|Xvfb/.test(exe)) return 'xvfb';
    if (!/chrom|electron|headless|lidar|LiDAR/i.test(exe) && !t) return 'other:' + exe;
    if (!t) return 'browser';
    if (t === 'renderer') return c.some(a => a.startsWith('--extension-process')) ? 'ext' : 'renderer';
    if (t === 'gpu-process') return 'gpu';
    if (t === 'utility') { const s = (c.find(a => a.startsWith('--utility-sub-type=')) || '').slice(19); return 'utility:' + s.split('.').pop(); }
    if (t === 'zygote') return 'zygote';
    return t;
  } catch (e) { return '?'; }
}
const rssOf = pid => { try { return +fs.readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1] * PAGESZ; } catch (e) { return 0; } };
const pssOf = pid => { try { const m = /Pss:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8')); return m ? +m[1] * 1024 : 0; } catch (e) { return 0; } };
const hwmOf = pid => { try { const m = /VmHWM:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8')); return m ? +m[1] * 1024 : 0; } catch (e) { return 0; } };
const MB = b => Math.round(b / 1048576);

// プロセスごとのメモリを見張る。peak は「その種類のプロセスの合計」の最大
class Mem {
  constructor(rootPid, getMetrics) { this.root = rootPid; this.getMetrics = getMetrics; this.reset(); this.timer = null; this.pssEvery = 5; this.k = 0; }
  reset() { this.peakRss = {}; this.peakPss = {}; this.peakTotalPss = 0; this.peakTotalRss = 0; this.series = []; }
  snapshot(withPss = true) {
    const by = {}, pss = {};
    let tr = 0, tp = 0;
    for (const pid of descendants(this.root)) {
      const k = kindOf(pid);
      if (k.startsWith('other:') || k === 'xvfb') continue;
      const r = rssOf(pid); by[k] = (by[k] || 0) + r; tr += r;
      if (withPss) { const p = pssOf(pid); pss[k] = (pss[k] || 0) + p; tp += p; }
    }
    return { t: Date.now(), rss: by, pss: withPss ? pss : null, totalRss: tr, totalPss: withPss ? tp : null };
  }
  tick() {
    const s = this.snapshot((this.k++ % this.pssEvery) === 0);
    for (const [k, v] of Object.entries(s.rss)) this.peakRss[k] = Math.max(this.peakRss[k] || 0, v);
    if (s.pss) { for (const [k, v] of Object.entries(s.pss)) this.peakPss[k] = Math.max(this.peakPss[k] || 0, v); this.peakTotalPss = Math.max(this.peakTotalPss, s.totalPss); }
    this.peakTotalRss = Math.max(this.peakTotalRss, s.totalRss);
    if (this.series.length < 20000) this.series.push([s.t, MB(s.rss.renderer || 0), MB(s.rss.gpu || 0), MB(s.rss.browser || 0), MB(s.totalRss)]);
    return s;
  }
  start(ms = 200) { if (!HAS_PROC) return; this.stop(); this.timer = setInterval(() => this.tick(), ms); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  hwm() { const o = {}; if (!HAS_PROC) return o; for (const pid of descendants(this.root)) { const k = kindOf(pid); if (k.startsWith('other:') || k === 'xvfb') continue; o[k] = Math.max(o[k] || 0, hwmOf(pid)); } return o; }
  peaksMB() { const f = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, MB(v)])); return { rss: f(this.peakRss), pss: f(this.peakPss), totalRss: MB(this.peakTotalRss), totalPss: MB(this.peakTotalPss) }; }
  nowMB() { if (!HAS_PROC) return null; const s = this.snapshot(true); const f = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, MB(v)])); return { rss: f(s.rss), pss: f(s.pss), totalRss: MB(s.totalRss), totalPss: MB(s.totalPss) }; }
}

// /proc のない OS（Windows・mac）では、Electron の app.getAppMetrics() を 0.5 秒ごとに見る
//   rss の代わりに workingSetSize、pss の代わりに privateBytes（Windows のみ。無ければ workingSetSize）
class AMem {
  constructor(app) { this.app = app; this.reset(); this.last = null; this.timer = null; this.poll(); this.bg = setInterval(() => this.poll(), 500); }
  reset() { this.peakRss = {}; this.peakPss = {}; this.peakTotalPss = 0; this.peakTotalRss = 0; this.series = []; this.hw = {}; }
  async poll() {
    if (!this.app) return;
    const ms = await this.app.evaluate(({ app }) => app.getAppMetrics().map(m => ({ type: m.type, ws: m.memory.workingSetSize, peak: m.memory.peakWorkingSetSize, priv: m.memory.privateBytes || 0 }))).catch(() => null);
    if (!ms) return;
    const map = { Browser: 'browser', Tab: 'renderer', GPU: 'gpu', Zygote: 'zygote' };
    const rss = {}, pss = {};
    let tr = 0, tp = 0;
    for (const m of ms) {
      const k = map[m.type] || ('utility:' + m.type);
      rss[k] = (rss[k] || 0) + m.ws * 1024; pss[k] = (pss[k] || 0) + (m.priv || m.ws) * 1024; tr += m.ws * 1024; tp += (m.priv || m.ws) * 1024;
      this.hw[k] = Math.max(this.hw[k] || 0, m.peak * 1024);
    }
    this.last = { t: Date.now(), rss, pss, totalRss: tr, totalPss: tp };
    if (this.timer) this.tick();
  }
  tick() {
    const s = this.last; if (!s) return null;
    for (const [k, v] of Object.entries(s.rss)) this.peakRss[k] = Math.max(this.peakRss[k] || 0, v);
    for (const [k, v] of Object.entries(s.pss)) this.peakPss[k] = Math.max(this.peakPss[k] || 0, v);
    this.peakTotalPss = Math.max(this.peakTotalPss, s.totalPss); this.peakTotalRss = Math.max(this.peakTotalRss, s.totalRss);
    return s;
  }
  start() { this.timer = true; }
  stop() { this.timer = null; }
  hwm() { return { ...this.hw }; }
  peaksMB() { const f = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, MB(v)])); return { rss: f(this.peakRss), pss: f(this.peakPss), totalRss: MB(this.peakTotalRss), totalPss: MB(this.peakTotalPss) }; }
  nowMB() { const s = this.last; if (!s) return null; const f = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, MB(v)])); return { rss: f(s.rss), pss: f(s.pss), totalRss: MB(s.totalRss), totalPss: MB(s.totalPss) }; }
  close() { clearInterval(this.bg); this.app = null; }
}

async function launch(opts = {}) {
  const electron = !!opts.electron;
  let app = null, browser = null, page;
  const vw = opts.viewport || { width: 1280, height: 800 };
  if (!electron) {
    const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--enable-precise-memory-info', ...(opts.args || [])];
    browser = await pw.chromium.launch({ executablePath: opts.chromium || process.env.CHROMIUM || '/opt/pw-browsers/chromium', args });
    page = await browser.newPage({ viewport: vw });
    await page.addInitScript(INIT);
    await page.goto(opts.page || process.env.PAGE || 'http://127.0.0.1:8740/abs/home/claude/pcd-viewer/dist/index.html');
  } else {
    const appdir = opts.appdir || process.env.APPDIR || '/home/claude/pcd-viewer';
    const exe = opts.electronPath || process.env.ELECTRON || '/home/claude/pcd-viewer/node_modules/electron/dist/electron';
    const packaged = !/node_modules[\\/]electron[\\/]dist/.test(exe);
    const args = packaged ? [] : [path.join(appdir, 'main.js')];
    if (process.platform === 'linux') args.unshift('--no-sandbox');
    app = await pw._electron.launch({ executablePath: exe, args: [...args, ...(opts.args || [])], env: { ...process.env, PCDV_USERDATA: opts.userData || path.join(os.tmpdir(), 'pcdv-a09-' + process.pid) } });
    page = await app.firstWindow();
    await app.context().addInitScript(INIT);
    await page.waitForLoadState('domcontentloaded');
    await page.reload();
    if (opts.viewport) await app.evaluate(({ BrowserWindow }, v) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(v.width, v.height); }, vw).catch(() => {});
  }
  await page.waitForFunction(() => window.__pcd && window.__perf, null, { timeout: 120000 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const crash = { at: null };
  page.on('crash', () => { crash.at = Date.now(); errors.push('CRASH: 画面のプロセスが落ちた'); });
  // CDP: 画面とワーカーのヒープ
  const cdp = await page.context().newCDPSession(page);
  const W = { session: null, id: 0, pending: new Map() };
  cdp.on('Target.attachedToTarget', ev => { if (ev.targetInfo.type === 'worker' && !W.session) W.session = ev.sessionId; });
  cdp.on('Target.detachedFromTarget', ev => { if (ev.sessionId === W.session) W.session = null; });
  cdp.on('Target.receivedMessageFromTarget', ev => { try { const m = JSON.parse(ev.message); const cb = W.pending.get(m.id); if (cb) { W.pending.delete(m.id); cb(m.error ? { error: m.error.message } : m.result); } } catch (e) { /* 無視 */ } });
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false }).catch(e => errors.push('autoAttach: ' + e.message));
  const wsend = (method, params = {}, timeout = 20000) => new Promise(res => {
    if (!W.session) return res({ error: 'no worker session' });
    const id = ++W.id; W.pending.set(id, res);
    setTimeout(() => { if (W.pending.has(id)) { W.pending.delete(id); res({ error: 'timeout' }); } }, timeout);
    cdp.send('Target.sendMessageToTarget', { sessionId: W.session, message: JSON.stringify({ id, method, params }) }).catch(e => { W.pending.delete(id); res({ error: e.message }); });
  });
  for (let i = 0; i < 50 && !W.session; i++) await new Promise(r => setTimeout(r, 100));
  // プロセスの根: Chromium は自分（node）の子、Electron も自分の子
  const mem = HAS_PROC ? new Mem(process.pid) : new AMem(app);
  const ctx = {
    electron, app, browser, page, cdp, wsend, errors, mem, crash,
    async heap() {
      const m = await cdp.send('Runtime.getHeapUsage').catch(e => ({ error: e.message }));
      const w = await wsend('Runtime.getHeapUsage', {}, 15000);
      const f = r => r && !r.error ? { used: MB(r.usedSize), total: MB(r.totalSize), ab: r.backingStorageSize == null ? null : MB(r.backingStorageSize), emb: r.embedderHeapUsedSize == null ? null : MB(r.embedderHeapUsedSize) } : r;
      return { main: f(m), worker: f(w) };
    },
    async gc() {
      await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
      await wsend('HeapProfiler.collectGarbage', {}, 30000);
      await page.waitForTimeout(300);
      await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    },
    async appMetrics() {
      if (!app) return null;
      return app.evaluate(({ app }) => app.getAppMetrics().map(m => ({ type: m.type, pid: m.pid, ws: Math.round(m.memory.workingSetSize / 1024), peak: Math.round(m.memory.peakWorkingSetSize / 1024), priv: m.memory.privateBytes ? Math.round(m.memory.privateBytes / 1024) : null, cpu: m.cpu && +m.cpu.percentCPUUsage.toFixed(1) }))).catch(e => ({ error: e.message }));
    },
    async setCap(v) { await page.evaluate(v => { const s = document.getElementById('capSel'); if (![...s.options].some(o => o.value === String(v))) { const o = document.createElement('option'); o.value = String(v); o.textContent = String(v); s.append(o); } s.value = String(v); s.dispatchEvent(new Event('change', { bubbles: true })); }, v); },
    async closeAll() { await page.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); }); },
    async perf() { return page.evaluate(() => { const P = window.__perf; return { t0: P.t0, msgs: P.msgs, sent: P.sent, prog: P.prog, longtasks: P.longtasks, frames: P.frames, filesAt: P.filesAt || [], statMsgs: P.statMsgs, errors: P.errors }; }); },
    async resetPerf() { await page.evaluate(() => { const P = window.__perf; P.msgs = []; P.sent = []; P.prog = []; P.longtasks = []; P.frames = { n: 0, last: 0, maxGap: 0, gaps100: 0, gaps500: 0, gapsList: [] }; P.filesAt = []; P.statMsgs = []; P.errors = []; }); },
    async close() { mem.stop(); if (mem.close) mem.close(); try { if (app) await app.close(); else await browser.close(); } catch (e) { /* 落ちている */ } },
  };
  return ctx;
}

// ファイルを開いて、落ち着くまで待つ。戻り値: 時刻（ページの performance.now 基準）と結果
//   終わりの判定: 進み具合が消えている ＋ ワーカーからの知らせが quietMs 止まっている ＋（点群が増えた or 赤い知らせ）
async function openFiles(ctx, files, { timeout = 1500000, quietMs = 2500, onTick = null } = {}) {
  const { page } = ctx;
  const nBefore = await page.evaluate(() => window.__pcd.S.files.length);
  const tStart = await page.evaluate(() => performance.now());
  await page.setInputFiles('#fileInput', files);
  const tEnd = Date.now() + timeout;
  let st;
  // 画面のプロセスが落ちると page.evaluate が返らないことがあるので、落ちた印と時間切れで抜ける
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate timeout')), ms))]);
  while (true) {
    await new Promise(r => setTimeout(r, 250));
    if (ctx.crash && ctx.crash.at) { st = { crashed: true, error: 'page crashed' }; break; }
    st = await withTimeout(page.evaluate(([n0, ts]) => {
      const P = window.__perf, S = window.__pcd.S, last = P.msgs.length ? P.msgs[P.msgs.length - 1][0] : ts;
      const msg = document.getElementById('statMsg');
      // 読み込んだファイル（loaded）ごとに、点の間隔（spacing）か誤り（error）が来たか。最初のファイルで自動水平補正なら analyzed も待つ
      const m = P.msgs.filter(x => x[0] >= ts);
      const loadedIds = m.filter(x => x[1] === 'loaded').map(x => x[4]);
      const pendingIdx = loadedIds.filter(id => !m.some(x => (x[1] === 'spacing' || x[1] === 'error') && x[4] === id));
      const wantLevel = n0 === 0 && document.getElementById('autoLevel').checked && loadedIds.length > 0;
      // 水平補正の結果: 成功（analyzed）か、「水平補正…」の知らせ（失敗も含む）がこれまでに一度でも出たか
      const levelDone = !wantLevel || m.some(x => x[1] === 'analyzed') || P.statMsgs.some(x => x[0] >= ts && /水平補正/.test(x[1]));
      return { now: performance.now(), lastMsg: Math.max(last, ts), hidden: document.getElementById('progress').hidden, nFiles: S.files.length, n0, err: !!msg.style.color, msg: msg.textContent, pendingIdx: pendingIdx.length, levelDone, crashed: false,
        lastWorker: P.msgs.length ? P.msgs[P.msgs.length - 1].slice(0, 6) : null, prog: document.getElementById('progressText').textContent + ' ' + document.getElementById('progressBar').style.width };
    }, [nBefore, tStart]), 60000).catch(e => ({ crashed: /closed|crash/i.test(e.message), stuck: /timeout/.test(e.message), error: e.message }));
    if (st.stuck) { if (Date.now() > tEnd) { st.timedOut = true; break; } continue; }
    if (st.crashed) break;
    if (onTick) await onTick(st);
    const quiet = st.now - st.lastMsg > quietMs;
    if (st.hidden && quiet && ((st.nFiles >= nBefore + files.length && !st.pendingIdx && st.levelDone) || st.err)) break;
    if (Date.now() > tEnd) { st.timedOut = true; break; }
  }
  return { tStart, st };
}

// ワーカーの知らせの列から各段階の時刻（読み込み開始からのミリ秒）を出す
function phases(perf, tStart) {
  const rel = t => t == null ? null : Math.round(t - tStart);
  const m = perf.msgs.filter(x => x[0] >= tStart);
  const first = (pred) => { const x = m.find(pred); return x ? x[0] : null; };
  const last = (pred) => { const x = [...m].reverse().find(pred); return x ? x[0] : null; };
  const loadedMsg = m.find(x => x[1] === 'loaded');
  const t = {
    firstProgress: rel(first(x => x[1] === 'progress')),
    readEnd: rel(first(x => x[1] === 'progress' && x[2] === '並べ替え')),
    loaded: rel(first(x => x[1] === 'loaded')),
    shown: rel(perf.filesAt && perf.filesAt.length ? perf.filesAt.find(x => x[0] >= tStart)?.[0] : null),
    spacing: rel(first(x => x[1] === 'spacing')),
    analyzed: rel(first(x => x[1] === 'analyzed')),
    lastMsg: rel(last(() => true)),
  };
  // 進み具合（ワーカーの知らせ）: 同じ段階の中で p が下がったら記録
  const regress = [];
  let prev = null;
  for (const x of m) if (x[1] === 'progress') { if (prev && prev[2] === x[2] && x[3] < prev[3] - 1e-9) regress.push([rel(x[0]), prev[3], x[3], x[2]]); prev = x; }
  const progMsgs = m.filter(x => x[1] === 'progress').length;
  // 進み具合の表示（DOM）: 幅の列
  const bars = perf.prog.filter(x => x[0] >= tStart).map(x => [rel(x[0]), x[1], x[2]]);
  let maxStall = 0, lastChange = null, lastW = null;
  for (const b of bars) { if (b[1] < 0) continue; if (lastW === null || b[1] !== lastW) { if (lastChange !== null) maxStall = Math.max(maxStall, b[0] - lastChange); lastChange = b[0]; lastW = b[1]; } }
  if (lastChange !== null && t.loaded != null) maxStall = Math.max(maxStall, t.loaded - lastChange);
  const errs = m.filter(x => x[1] === 'error').map(x => [rel(x[0]), x[4], x[5]]);
  const lt = perf.longtasks.filter(x => x[0] >= tStart);
  const fr = perf.frames || {};
  const frames = { n: fr.n, maxGap: Math.round(fr.maxGap || 0), gaps100: fr.gaps100, gaps500: fr.gaps500, gapsAfterStart: (fr.gapsList || []).filter(g => g[0] >= tStart).map(g => [rel(g[0]), g[1]]).slice(0, 60) };
  return { t, progMsgs, progRegress: regress.slice(0, 20), barSteps: bars.length, barMaxStallMs: maxStall, bars: bars.length > 60 ? [...bars.slice(0, 30), ['…'], ...bars.slice(-30)] : bars, workerErrors: errs, loadedInfo: loadedMsg ? loadedMsg[5] : null,
    longTasks: { count: lt.length, maxMs: Math.round(Math.max(0, ...lt.map(x => x[1]))), totalMs: Math.round(lt.reduce((a, x) => a + x[1], 0)), list: lt.slice(0, 40).map(x => [rel(x[0]), Math.round(x[1])]) }, frames, statMsgs: perf.statMsgs.filter(x => x[0] >= tStart).map(x => [rel(x[0]), x[1], x[2]]) };
}

module.exports = { pw, launch, openFiles, phases, Mem, MB, HAS_PROC, descendants, kindOf };
