// el.js — Electron（LiDAR Viewer）を Playwright で動かす部品（A07）。スクリプトはアプリと同じ netns の中で動かすこと
'use strict';
const pw = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('node:path');
const fs = require('node:fs');
const H = require('./h.js');

async function launch(name, { appDir = process.env.APPDIR || '/home/claude/pcd-viewer', env = {}, fresh = true } = {}) {
  const ud = path.join(H.W, 'ud', name);
  if (fresh) fs.rmSync(ud, { recursive: true, force: true });
  const app = await pw._electron.launch({
    executablePath: '/home/claude/pcd-viewer/node_modules/electron/dist/electron',
    args: ['--no-sandbox', path.join(appDir, 'main.js')],
    env: { ...process.env, PCDV_USERDATA: ud, ...env },
    timeout: 90000,
  });
  const page = await app.firstWindow();
  const errors = []; // 画面の例外と console.error だけ（SwiftShader・CSP の警告は試験環境・既知のものなので数えない）
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.${m.type()}: ` + m.text()); });
  const mainLog = [];
  app.process().stdout.on('data', d => mainLog.push(String(d)));
  app.process().stderr.on('data', d => mainLog.push(String(d)));
  await page.waitForFunction(() => window.__pcd, null, { timeout: 90000 });
  // 右上の知らせ（#statMsg）の変化をすべて記録する
  await page.evaluate(() => {
    window.__msgs = [];
    const el = document.getElementById('statMsg');
    new MutationObserver(() => window.__msgs.push({ t: performance.now(), text: el.textContent, err: !!el.style.color })).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  });
  return { app, page, errors, mainLog, name };
}

const ui = page => page.evaluate(() => {
  const $ = id => document.getElementById(id);
  return {
    devices: [...$('liveDevices').querySelectorAll('li')].map(li => li.innerText.replace(/\n/g, ' | ')),
    peers: [...$('livePeers').querySelectorAll('li')].map(li => li.innerText.replace(/\n/g, ' | ')),
    now: !$('liveNow').hidden, pick: !$('livePick').hidden,
    src: $('liveSrc').textContent, rate: $('liveRate').textContent, dot: $('liveDot').className,
    err: $('liveErr').hidden ? '' : $('liveErr').textContent,
    msg: $('statMsg').textContent, msgErr: !!$('statMsg').style.color,
    shareBox: !$('liveShareBox').hidden, share: $('liveShare').checked, clients: $('liveShareClients').textContent,
    files: window.__pcd.S.files.map(f => ({ name: f.name, n: f.n, visible: f.points.visible })),
  };
});

// 主プロセスの資源（ハンドル・タイマー・メモリ）
const mainRes = app => app.evaluate(() => {
  const hs = process._getActiveHandles();
  const kinds = {};
  for (const h of hs) { const k = h.constructor ? h.constructor.name : typeof h; kinds[k] = (kinds[k] || 0) + 1; }
  const socks = hs.filter(h => h.constructor && h.constructor.name === 'Socket' && h.type === undefined).length;
  const m = process.memoryUsage();
  return { handles: hs.length, kinds, requests: process._getActiveRequests().length, rss: Math.round(m.rss / 1048576), heap: Math.round(m.heapUsed / 1048576), ext: Math.round(m.external / 1048576), ab: Math.round(m.arrayBuffers / 1048576), socks };
});
// 主プロセスの開いている UDP/TCP（ss で、この netns の electron の pid を数える）
function ssOf(pid) { return H.shq(`ss -uatnp 2>/dev/null | grep 'pid=${pid},' || true`).trim().split('\n').filter(Boolean).map(s => s.replace(/\s+/g, ' ')); }
function procMem(pid) { try { const s = fs.readFileSync(`/proc/${pid}/status`, 'utf8'); return Math.round(+(/VmRSS:\s+(\d+)/.exec(s) || [0, 0])[1] / 1024); } catch (e) { return -1; } }
// 画面（renderer）のプロセスの pid と RSS
async function rendererPid(app) { return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getOSProcessId()); }
async function openLive(page) { await page.click('[data-open="live"]'); await page.waitForTimeout(300); }
async function waitUi(page, pred, ms = 10000, step = 200) { const t = Date.now(); let u; while (Date.now() - t < ms) { u = await ui(page); if (pred(u)) return u; await page.waitForTimeout(step); } return null; }
const msgs = page => page.evaluate(() => window.__msgs.splice(0));

module.exports = { pw, launch, ui, mainRes, ssOf, procMem, rendererPid, openLive, waitUi, msgs };
