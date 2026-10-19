// LiDAR Viewer の画面と操作
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SAMPLE_GROUPS } from './samples.js';
import { extractMcap } from './trajectory.js';
import { Gunzip } from 'fflate';

THREE.ColorManagement.enabled = false;
const $ = id => document.getElementById(id);
const fmtN = n => n.toLocaleString('ja-JP');
// 丸めた結果が 0 のときは符号を付けない（-0.00 と出さない）
const fmt = (v, d = 2) => { if (v == null || !Number.isFinite(v)) return '—'; const s = v.toFixed(d); return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s; };
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ------------------------------------------------------------------ 別スレッド
// 試作ページ版は別スレッドのコードを gzip して埋め込んでいるので、展開してから起動する（それまでの送信は順に待たせる）
const worker = (() => {
  // アプリ版: 横に置いた worker.js から起動する（blob: から作ると画面の CSP を受け継ぎ、STEP の部品が使う文字列の実行のために
  // 画面本体にも 'unsafe-eval' が要る。ファイルから作れば別スレッドだけで済む。S3-005・S1-007）
  if (!__WORKER_GZ__) return new Worker('worker.js');
  // 別スレッドが使えない（DecompressionStream が無い・枠の CSP が blob: の Worker を禁じる）ときは「止まった」とし、
  // 以後の送信には原因の文で失敗を返す（黙って捨てると「開いています」のまま止まる。R14-002・R14-003）
  let dead = null, onMsg = null, onErr = null, cspWorker = false;
  addEventListener('securitypolicyviolation', e => { if (/^(worker|script|child)-src/.test(e.effectiveDirective || '') && /^blob/.test(e.blockedURI || '')) cspWorker = true; });
  const fail = m => { if (m.type !== 'remove' && onMsg) onMsg({ data: { type: 'error', id: m.id, req: m.req, message: dead } }); };
  const die = msg => {
    if (dead) return;
    dead = msg;
    for (const [k, p] of pending) { pending.delete(k); p.reject(new Error(msg)); }
    if (onErr) onErr({ message: msg });
    else { hideProgress(); status(msg, true); }
  };
  const ready = (async () => {
    if (typeof DecompressionStream === 'undefined') throw new Error('このブラウザは古いため、この画面では点群を開けません（DecompressionStream がありません）。新しいブラウザ（Chrome・Edge・Firefox 113 以降・Safari 16.4 以降）で開いてください');
    const gz = Uint8Array.from(atob(__WORKER_GZ__), c => c.charCodeAt(0));
    const code = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).blob();
    const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    w.onmessage = e => { if (onMsg) onMsg(e); };
    w.onerror = e => {
      // 文の無い error は Worker そのものが動けない（起動できない・落ちた）
      if (e && !e.message) {
        if (e.preventDefault) e.preventDefault();
        setTimeout(() => die(cspWorker ? 'この画面の設定では別スレッド（Worker）が使えないため、ファイルを開けません。アプリ版では開けます' : '読み込みの処理が止まりました。メモリが足りない可能性があります。「表示」の「読み込む最大点数」を減らしてから、ページを読み直してください'), 100);
        return;
      }
      if (onErr) onErr(e);
    };
    return w;
  })();
  ready.catch(e => setTimeout(() => die(e.message || String(e)), 0));
  let chain = ready;
  return {
    postMessage(m, t) {
      if (dead) { setTimeout(() => fail(m), 0); return; }
      chain = chain.then(w => { if (dead || !w) setTimeout(() => fail(m), 0); else w.postMessage(m, t); return w; }, () => { setTimeout(() => fail(m), 0); });
    },
    set onmessage(f) { onMsg = f; },
    set onerror(f) { onErr = f; },
  };
})();
// 別スレッドの英語の誤りを、対処の分かる日本語にする（元の文は括弧に残す）
function jaError(msg) {
  const s = String(msg || '');
  if (/allocation failed|Invalid (typed )?array length|out of memory|Array buffer|RangeError: (Array|Invalid)/i.test(s)) return 'メモリが足りません。「表示」の「読み込む最大点数」を減らしてから開き直してください';
  if (/Maximum call stack/i.test(s)) return `処理が深くなりすぎて止まりました（${s.slice(0, 60)}）`;
  // 大きすぎるファイル（約 2 GB 超）を丸ごと読もうとしたとき、Chromium は「権限の問題」の文を返す（R12-002）
  if (/could not be read|NotReadableError/i.test(s)) return 'ファイルを読めませんでした。大きすぎる（約 2 GB 超）か、開いている間にファイルが動かされた・消された可能性があります';
  return s;
}
// 読み込み中のファイルが開けなかったとき: 名前を付けて知らせ、別スレッドに残った分を消し、順番待ちを先へ進める
function loadFailed(message) {
  const info = S.loadingFile;
  hideProgress();
  if (info) worker.postMessage({ type: 'remove', id: info.id });
  const name = info ? info.name : 'ファイル';
  if (info && info.cancelled) { S.loadingFile = null; loadNext(); return; } // すべて閉じたあとに失敗が届いた
  // 中身で軌跡と判定したのに軌跡として読めなかったら、点群として開き直す（R8-001）
  // .mcap・.tum は点群にならないので開き直さず、本当の理由を出す（R12-003）
  if (info && info.auto && info.kind === 'traj' && info.file && /^(txt|csv)$/.test(extOf(info.name))) {
    S.loadingFile = null;
    queue.unshift({ file: info.file, kind: 'cloud', parts: info.parts, auto: false });
    loadNext();
    return;
  }
  loadBatch.failed.push({ name, message: jaError(message) });
  status(`${name} を開けませんでした: ${jaError(message)}`, true);
  S.loadingFile = null;
  loadNext();
}
let reqSeq = 0;
const pending = new Map();
function call(msg, transfer = []) {
  const req = ++reqSeq;
  return new Promise((resolve, reject) => { pending.set(req, { resolve, reject }); worker.postMessage({ ...msg, req }, transfer); });
}
worker.onmessage = e => {
  const m = e.data;
  if (m.req && pending.has(m.req)) {
    const p = pending.get(m.req); pending.delete(m.req);
    m.type === 'error' ? p.reject(new Error(m.message)) : p.resolve(m);
    return;
  }
  if (m.type === 'progress') showProgress(null, m.p, m.phase);
  else if (m.type === 'loaded') onLoaded(m);
  else if (m.type === 'traj') onTraj(m);
  else if (m.type === 'spacing') { const f = S.files.find(x => x.id === m.id); if (f) { f.spacing = m.spacing; f.spacingReason = m.reason || ''; updatePivotSize(); updateInfo(); } }
  else if (m.type === 'status') status(m.text);
  else if (m.type === 'error') {
    if (loading && S.loadingFile && (m.id == null || m.id === S.loadingFile.id)) loadFailed(m.message);
    else status(jaError(m.message), true);
  }
};
// 別スレッドそのものが止まった（メモリ不足など）ときも、知らせて次のファイルへ進む
worker.onerror = e => {
  if (e && e.preventDefault) e.preventDefault();
  const msg = (e && e.message) || '読み込みの処理が止まりました。メモリが足りない可能性があります。「表示」の「読み込む最大点数」を減らしてください';
  // 返事を待っている問い合わせ（点の選択・補正・色分けの値など）は待たせたままにしない（R11-006）
  for (const p of pending.values()) p.reject(new Error(msg));
  pending.clear();
  if (loading && S.loadingFile) loadFailed(msg);
  else status(jaError(msg), true);
};

// ------------------------------------------------------------------ 配色
const CMAPS = {
  turbo: x => [
    0.13572138 + x * (4.61539260 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943)))),
    0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604)))),
    0.10667330 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973)))),
  ],
  viridis: (() => {
    const s = [[68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37]];
    return x => { const f = x * (s.length - 1), i = Math.min(s.length - 2, Math.floor(f)), t = f - i; return [0, 1, 2].map(k => (s[i][k] + (s[i + 1][k] - s[i][k]) * t) / 255); };
  })(),
  rainbow: x => {
    // 青 → 水色 → 緑 → 黄 → 赤（jet に近い）
    const f = (c) => Math.min(1, Math.max(0, 1.5 - Math.abs(4 * x - c)));
    return [f(3), f(2), f(1)];
  },
  gray: x => [0.15 + 0.8 * x, 0.15 + 0.8 * x, 0.15 + 0.8 * x],
};
const CAT_COLORS = ['#d9483a', '#c98a2e', '#4f7fd6', '#2e9a7f', '#3fb8a8', '#8e6bd1', '#d16bb0', '#7a9a2e', '#e0c341', '#5aa0e0', '#a0522d', '#8c8c8c'];
const FILE_COLORS = ['#4f8fe0', '#e0814f', '#3fbf8f', '#c76bd1', '#d9b23a', '#e05a6b'];

function cmapTexture(name) {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const c = CMAPS[name](i / 255);
    for (let k = 0; k < 3; k++) data[4 * i + k] = Math.round(255 * Math.min(1, Math.max(0, c[k])));
    data[4 * i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
function catTexture() {
  const data = new Uint8Array(64 * 4);
  for (let i = 0; i < 64; i++) {
    const c = new THREE.Color(CAT_COLORS[i % CAT_COLORS.length]);
    data[4 * i] = c.r * 255; data[4 * i + 1] = c.g * 255; data[4 * i + 2] = c.b * 255; data[4 * i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, 64, 1, THREE.RGBAFormat); t.needsUpdate = true;
  return t;
}
// 均等化の対応表（線形の位置 t → 色の位置）。床や天井のように点が集中する高さで色が
// 変わらなくなるのを防ぐため、点の分布（累積の割合）に合わせて色を割り当てる。
// ただし山を 4 倍で頭打ちにして、ひとつの山が色をほとんど使い切らないようにする
const eqData = new Uint8Array(1024 * 4);
const eqTex = new THREE.DataTexture(eqData, 1024, 1, THREE.RGBAFormat);
eqTex.magFilter = THREE.LinearFilter; eqTex.minFilter = THREE.LinearFilter;
function updateEq(sample, lo, hi) {
  const NB = 256, h = new Float64Array(NB);
  let n = 0;
  if (sample && hi > lo) {
    for (let i = 0; i < sample.length; i++) {
      const v = sample[i];
      if (v < lo || v > hi) continue;
      h[Math.min(NB - 1, Math.floor((v - lo) / (hi - lo) * NB))]++; n++;
    }
  }
  if (n < 10) { for (let i = 0; i < 1024; i++) { eqData[4 * i] = Math.round(255 * i / 1023); eqData[4 * i + 3] = 255; } eqTex.needsUpdate = true; return; }
  for (let it = 0; it < 3; it++) {
    const lim = 4 * n / NB; let ex = 0;
    for (let i = 0; i < NB; i++) if (h[i] > lim) { ex += h[i] - lim; h[i] = lim; }
    for (let i = 0; i < NB; i++) h[i] += ex / NB;
  }
  const cdf = new Float64Array(NB + 1);
  for (let i = 0; i < NB; i++) cdf[i + 1] = cdf[i] + h[i];
  for (let i = 0; i < 1024; i++) {
    const x = i / 1023 * NB, k = Math.min(NB - 1, Math.floor(x)), f = x - k;
    const v = (cdf[k] + (cdf[k + 1] - cdf[k]) * f) / cdf[NB];
    eqData[4 * i] = Math.round(255 * v); eqData[4 * i + 3] = 255;
  }
  eqTex.needsUpdate = true;
}
updateEq(null, 0, 1);
const cssGradient = name => `linear-gradient(90deg, ${Array.from({ length: 11 }, (_, i) => { const c = CMAPS[name](i / 10).map(v => Math.round(255 * Math.min(1, Math.max(0, v)))); return `rgb(${c}) ${i * 10}%`; }).join(',')})`;

// ------------------------------------------------------------------ 3D の土台
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(window.devicePixelRatio || 1);
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const world = new THREE.Group(); // 点群・軌跡・計測はここに入れる（水平補正はこの行列で行う）
world.matrixAutoUpdate = false;
scene.add(world);
const axes = new THREE.AxesHelper(1);
scene.add(axes);

const persp = new THREE.PerspectiveCamera(50, 1, 0.02, 20000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -20000, 20000);
for (const c of [persp, ortho]) { c.up.set(0, 0, 1); c.position.set(-10, -10, 10); }
let cam = persp;
const controls = new OrbitControls(cam, renderer.domElement);
controls.zoomToCursor = false; // ホイールでは回転の中心を動かさない（中心に向かって近づく・離れる）
controls.screenSpacePanning = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };

const shared = {
  uSize: { value: 2 }, uPixelRatio: { value: renderer.getPixelRatio() },
  uWorldSize: { value: 0 }, uViewportH: { value: 1 },
  uMapMode: { value: 1 }, uEq: { value: eqTex }, uBand: { value: 0.5 },
  uMin: { value: 0 }, uMax: { value: 1 },
  uCmap: { value: cmapTexture('turbo') }, uCat: { value: catTexture() }, uCatMin: { value: 0 },
  uCeilN: { value: new THREE.Vector3(0, 0, 1) }, uCeilD: { value: 1e9 },
  uClipMin: { value: new THREE.Vector3(-1e9, -1e9, -1e9) }, uClipMax: { value: new THREE.Vector3(1e9, 1e9, 1e9) },
};
const VERT = `
attribute float scalar;
attribute vec3 rgbc;
uniform float uSize, uPixelRatio, uMin, uMax, uCatMin, uWorldSize, uViewportH, uBand;
uniform int uMode, uMapMode;
uniform sampler2D uCmap, uCat, uEq;
uniform vec3 uColor, uClipMin, uClipMax, uCeilN;
uniform float uCeilD;
varying vec3 vColor;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  if (any(lessThan(w.xyz, uClipMin)) || any(greaterThan(w.xyz, uClipMax)) || dot(uCeilN, w.xyz) > uCeilD) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return;
  }
  if (uMode == 3) vColor = uColor;
  else if (uMode == 4) vColor = rgbc;
  else if (uMode == 2) {
    float idx = clamp(floor(scalar - uCatMin + 0.5), 0.0, 63.0);
    vColor = texture2D(uCat, vec2((idx + 0.5) / 64.0, 0.5)).rgb;
  } else {
    float v = uMode == 0 ? w.z : scalar;
    float t = clamp((v - uMin) / max(uMax - uMin, 1e-6), 0.0, 1.0);
    // 1: 点の分布に合わせて色を割り当てる（均等化）、2: 一定の間隔で色を繰り返す（しま模様）
    if (uMapMode == 1) t = texture2D(uEq, vec2(t * (1023.0 / 1024.0) + 0.5 / 1024.0, 0.5)).r;
    else if (uMapMode == 2) t = fract((v - uMin) / max(uBand, 1e-3));
    vColor = texture2D(uCmap, vec2(t, 0.5)).rgb;
  }
  vec4 mv = viewMatrix * w;
  gl_Position = projectionMatrix * mv;
  // 1 m が画面の何ピクセルか（平行投影では距離によらない）
  bool ortho = projectionMatrix[3][3] > 0.5;
  float pxPerM = uViewportH * 0.5 * projectionMatrix[1][1] / (ortho ? 1.0 : max(-mv.z, 1e-3));
  float size = uWorldSize > 0.0 ? uWorldSize * pxPerM : uSize * uPixelRatio;
  size = clamp(size, 1.0, 64.0);
  gl_PointSize = size;
}`;
const FRAG = `varying vec3 vColor; void main() { gl_FragColor = vec4(vColor, 1.0); }`;
function makeMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uMode: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: VERT, fragmentShader: FRAG,
  });
}

const overlay = new THREE.Group(); // 計測の印（world の座標系）
world.add(overlay);
// 印は四角ではなく丸で描く
const dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
})();
const pickMarker = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
  new THREE.PointsMaterial({ size: 11, sizeAttenuation: false, depthTest: false, transparent: true, map: dotTex, alphaTest: 0.5 }));
pickMarker.renderOrder = 10; pickMarker.visible = false;
pickMarker.frustumCulled = false; // 位置を後から書き換えるので、範囲外と判定されて消えないようにする
world.add(pickMarker);

// 回転の中心の印（3D 側: 床までの線と床の輪）。画面上での大きさが一定になるよう毎回縮尺を変える
const pivotDrop = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3)),
  new THREE.LineBasicMaterial({ depthTest: false, transparent: true, opacity: 0.7 }));
pivotDrop.renderOrder = 19;
const ringPts = [];
for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; ringPts.push(Math.cos(a), Math.sin(a), 0); }
const pivotRing = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ringPts, 3)),
  new THREE.LineBasicMaterial({ depthTest: false, transparent: true, opacity: 0.8 }));
pivotRing.renderOrder = 19;
scene.add(pivotDrop, pivotRing);

// ------------------------------------------------------------------ 状態
const S = {
  files: [], trajs: [], active: null, seq: 0,
  colorMode: 'height', field: null, cmap: 'turbo',
  tools: { info: false, measure: false }, measures: [], mPending: null,
  bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  levelInfo: null, interacting: false, hideCeil: true, ceilZ: null,
  offset: null, // 大きな座標から引いている値（グローバルシフト）。表示するときに足し戻す
};
let dirty = true;
const requestRender = () => { dirty = true; };
// 操作中の間引き: ドラッグの間だけでなく、ホイール・視点のアニメーション・中心の印のドラッグの間も間引く
//   （ホイールは start と end が同じイベントの中で続けて来るので、最後に動いてから少しの間は間引いたままにする）
let ctrlDragging = false, lodTimer = null;
function setInteracting(on) { if (S.interacting === on) return; S.interacting = on; applyLod(); }
function bumpInteract() {
  setInteracting(true);
  clearTimeout(lodTimer);
  lodTimer = setTimeout(function end() { if (ctrlDragging || anim || S.drag) lodTimer = setTimeout(end, 120); else setInteracting(false); }, 220);
}
controls.addEventListener('change', () => { requestRender(); bumpInteract(); });
controls.addEventListener('start', () => { ctrlDragging = true; bumpInteract(); });
controls.addEventListener('end', () => { ctrlDragging = false; bumpInteract(); });

// 1 点あたりのメモリを減らす（R5-003）: 点の座標・色・値は GPU に送ったら画面側の写しを捨てる。
// 計算に要る全点の写しは別スレッドが持っているので、画面側は無作為な標本（先頭の点。読み込みで混ぜてある）だけを持つ
const SAMPLE_N = 200000;
function freeAfterUpload(attr) { attr.onUpload(function () { this.array = new this.array.constructor(0); }); return attr; }
// GPU のリセットなどで WebGL の文脈が失われると、写しを捨てた点群は描き直せない。戻ったら別スレッドが持つ全点の写しを
// もう一度受け取って GPU に送り直す（開き直さないので、色・表示・ピン・計測・補正・付属ファイルの情報はそのまま。R11-003・R14-004・R15-005）
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); status('画面の描画が止まりました。戻ったら描き直します', true); });
renderer.domElement.addEventListener('webglcontextrestored', async () => {
  status('画面の描画が戻ったので、点群を描き直しています');
  const failed = [];
  for (const f of [...S.files]) {
    try {
      const r = await call({ type: 'buffers', id: f.id });
      if (!S.files.includes(f)) continue; // 待っている間に閉じられた
      f.geom.setAttribute('position', freeAfterUpload(new THREE.BufferAttribute(r.positions, 3)));
      if (r.rgb) f.geom.setAttribute('rgbc', freeAfterUpload(new THREE.BufferAttribute(r.rgb, 3, true)));
      if (f.fieldName) { const name = f.fieldName; f.fieldKey = null; f.geom.deleteAttribute('scalar'); await ensureField(f, name); }
    } catch (err) { failed.push(f.name); }
  }
  requestRender();
  status(failed.length ? `画面の描画は戻りましたが、${failed.join('、')} を描き直せませんでした。閉じて開き直してください` : '画面の描画が戻りました', !!failed.length);
});
function applyLod() {
  const budget = +$('lodSel').value;
  const vis = S.files.filter(f => f.visible);
  const total = vis.reduce((a, f) => a + f.n, 0);
  const ratio = (S.interacting && budget && total > budget) ? budget / total : 1;
  for (const f of S.files) f.geom.setDrawRange(0, Math.ceil(f.n * ratio));
  updateStatus(ratio);
  requestRender();
}

// ------------------------------------------------------------------ 範囲のスライダー（2 つつまみ）
function makeDual(el, label, unit, onChange, shift = () => 0, format = null) {
  el.innerHTML = `<span class="dlabel">${label}</span><span class="dval"></span>
    <div class="dtrack"><input type="range" min="0" max="1000" step="1" value="0" aria-label="${label}の下限"><input type="range" min="0" max="1000" step="1" value="1000" aria-label="${label}の上限"></div>`;
  // 2 つの丸は自由にすれ違える（小さい方が下限、大きい方が上限）。重なっても、どちらの向きにも引き離せる
  const [ta, tb] = el.querySelectorAll('input');
  const val = el.querySelector('.dval');
  let bmin = 0, bmax = 1;
  const toV = s => bmin + (bmax - bmin) * s / 1000;
  const toS = v => Math.round(Math.min(1000, Math.max(0, (v - bmin) / ((bmax - bmin) || 1) * 1000)));
  const ss = () => { const x = +ta.value, y = +tb.value; return x <= y ? [x, y] : [y, x]; };
  const get = () => ss().map(toV);
  const track = el.querySelector('.dtrack');
  const show = () => {
    const [a, b] = get(), sh = shift(); val.textContent = format ? `${format(a)} 〜 ${format(b)}` : `${fmt(a + sh)} 〜 ${fmt(b + sh)}${unit}`;
    const [sa, sb] = ss();
    track.style.setProperty('--a', `${sa / 10}%`); track.style.setProperty('--b', `${sb / 10}%`);
    const aLow = +ta.value <= +tb.value;
    ta.setAttribute('aria-label', `${label}の${aLow ? '下限' : '上限'}`); tb.setAttribute('aria-label', `${label}の${aLow ? '上限' : '下限'}`);
  };
  // 最後に触った丸を上にする（重なったときにつかめる丸が片方に固定されない）
  for (const [x, y] of [[ta, tb], [tb, ta]]) {
    const top = () => { x.style.zIndex = 2; y.style.zIndex = 1; };
    x.addEventListener('pointerdown', top); x.addEventListener('focus', top);
    x.addEventListener('input', () => { top(); show(); onChange(); });
  }
  const put = (a, b) => { ta.value = a; tb.value = b; };
  return {
    // 範囲が変わったとき: 切り出していない（いっぱいの）つまみは、新しい範囲でもいっぱいのままにする
    setBounds(a, b, reset) { const [s0, s1] = ss(); const wasFull = s0 === 0 && s1 === 1000; const [va, vb] = get(); bmin = a; bmax = b; if (reset || wasFull) put(0, 1000); else put(toS(va), toS(vb)); show(); },
    set(a, b) { put(toS(a), toS(b)); show(); },
    get, full: () => { const [s0, s1] = ss(); return s0 === 0 && s1 === 1000; },
  };
}
const clipZ = makeDual($('clipZ'), '高さ z', ' m', updateClip, () => disp(2));
const clipX = makeDual($('clipX'), 'x', ' m', updateClip, () => disp(0));
const clipY = makeDual($('clipY'), 'y', ' m', updateClip, () => disp(1));
const clipD = [clipX, clipY, clipZ];
const colorRange = makeDual($('colorRange'), '色の範囲', '', () => { const [a, b] = colorRange.get(); shared.uMin.value = a; shared.uMax.value = b; refreshEq(); drawLegend(); requestRender(); }, () => valueShift(), v => fmtColorVal(v));
function colorSample() {
  if (S.colorMode === 'height') return S.zSample;
  if (S.colorMode !== 'field') return null;
  if (S.fieldSample && S.fieldSample.name === S.field) return S.fieldSample.values;
  const vals = [];
  const vis = S.files.filter(f => f.fieldName === S.field);
  for (const f of vis) {
    const a = f.fieldSampleVals || [], m = Math.min(a.length, Math.floor(300000 / vis.length));
    for (let i = 0; i < m; i++) vals.push(a[i]);
  }
  S.fieldSample = { name: S.field, values: vals };
  return vals;
}
function refreshEq() { updateEq(colorSample(), shared.uMin.value, shared.uMax.value); }

// ------------------------------------------------------------------ 範囲（水平補正後の座標）
function sampleWorld(f, maxN = 200000) {
  const P = f.sample, m = Math.min(P.length / 3, maxN), e = world.matrix.elements;
  const out = new Float32Array(m * 3);
  for (let i = 0; i < m; i++) {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    out[3 * i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[3 * i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[3 * i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  return out;
}
// 中心の丸の実際の大きさ（m）: 点群で表せるいちばん細かい大きさ（隣の点までの距離の中央値）の 10 倍
const PIVOT_TIMES_SPACING = 10;
function updatePivotSize() {
  const sp = S.files.filter(f => f.visible && f.spacing).map(f => f.spacing);
  S.pivotWorld = sp.length ? PIVOT_TIMES_SPACING * Math.min(...sp) : 0.3;
  requestRender();
}
function percentile(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0; }
function updateBounds(resetClip) {
  const vis = S.files.filter(f => f.visible);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const axes3 = [[], [], []];
  S.zSample = [];
  S.worldSample = [];
  const flo = [Infinity, Infinity, Infinity], fhi = [-Infinity, -Infinity, -Infinity], o = S.offset || [0, 0, 0];
  // 情報に出す本当の範囲（余白なし・全点）。ファイルの座標は別スレッドが全点で求めた箱、回した座標は全点を回して求める
  const tlo = [Infinity, Infinity, Infinity], thi = [-Infinity, -Infinity, -Infinity], e = world.matrix.elements;
  for (const f of vis) {
    for (let k = 0; k < 3; k++) { flo[k] = Math.min(flo[k], f.bbox.min[k] + o[k]); fhi[k] = Math.max(fhi[k], f.bbox.max[k] + o[k]); }
    if (!S.levelInfo) { for (let k = 0; k < 3; k++) { tlo[k] = Math.min(tlo[k], f.bbox.min[k]); thi[k] = Math.max(thi[k], f.bbox.max[k]); } continue; }
    // 回した座標の全点の範囲は別スレッドで求める（画面側は全点を持たない。R5-003）。届くまでは箱の 8 つの角を回した範囲（少し広め）
    const key = Array.from(e, v => v.toFixed(9)).join(',');
    let tb = f.tbox && f.tbox.key === key ? f.tbox : null;
    if (!tb) {
      const c = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
      for (let j = 0; j < 8; j++) {
        const x = j & 1 ? f.bbox.max[0] : f.bbox.min[0], y = j & 2 ? f.bbox.max[1] : f.bbox.min[1], z = j & 4 ? f.bbox.max[2] : f.bbox.min[2];
        for (let k = 0; k < 3; k++) { const v = e[k] * x + e[4 + k] * y + e[8 + k] * z + e[12 + k]; c.lo[k] = Math.min(c.lo[k], v); c.hi[k] = Math.max(c.hi[k], v); }
      }
      tb = c;
      if (!f.tboxReq || f.tboxReq !== key) {
        f.tboxReq = key;
        call({ type: 'tbounds', id: f.id, M: Array.from(e) }).then(r => {
          if (!S.files.includes(f) || f.tboxReq !== key) return;
          f.tbox = { key, lo: r.lo, hi: r.hi };
          if (Array.from(world.matrix.elements, v => v.toFixed(9)).join(',') === key) {
            updateBounds(false); updateInfo();
            // 高さの色の範囲スライダーも、仮の広い範囲から本当の範囲で作り直す（R10-001）
            if (S.colorMode === 'height' && !S.files.some(x => x.visible && x.tboxReq && (!x.tbox || x.tbox.key !== x.tboxReq))) applyColor(true);
          }
        }).catch(() => {});
      }
    }
    for (let k = 0; k < 3; k++) { tlo[k] = Math.min(tlo[k], tb.lo[k]); thi[k] = Math.max(thi[k], tb.hi[k]); }
  }
  S.boundsFile = { min: flo, max: fhi };
  S.boundsTrue = { min: tlo, max: thi };
  placeOriginAxes();
  for (const f of vis) {
    // 点は読み込み時に混ぜてあるので、先頭の点が無作為な標本になる
    // 標本の合計は約 40 万点まで（ファイルが多くても、閉じる・切り替えるたびに固まらないように。R5-002）。範囲は全点の箱から
    const s = sampleWorld(f, Math.max(2000, Math.floor(400000 / vis.length)));
    S.worldSample.push(s);
    for (let i = 0; i < s.length; i += 3) for (let k = 0; k < 3; k++) axes3[k].push(s[i + k]);
  }
  if (!vis.length) return;
  for (let k = 0; k < 3; k++) { lo[k] = tlo[k]; hi[k] = thi[k]; }
  for (let k = 0; k < 3; k++) { const m = (hi[k] - lo[k]) * 0.01 + 0.01; lo[k] -= m; hi[k] += m; axes3[k] = Float64Array.from(axes3[k]).sort(); }
  S.zSample = axes3[2];
  updateCeiling();
  S.bounds = { min: lo, max: hi };
  // 視点を合わせるときは、外れた点（0.5% ずつ）を除いた範囲を使う
  S.fit = { min: axes3.map(a => percentile(a, 0.005)), max: axes3.map(a => percentile(a, 0.995)) };
  updatePivotSize();
  clipD.forEach((d, k) => d.setBounds(lo[k], hi[k], resetClip));
  updateSection(); updateClip(); drawHist(); updateInfo();
}

// 天井を隠す面。高さは「水平に直した座標」で調べる。水平補正を元に戻したあとも、前に調べた傾きを使って
// 傾いた天井に沿った面で隠す（そのままの z で切ると、傾いた地図が途中で切れてしまう）
function levelMatrix(r) {
  const M = new THREE.Matrix4();
  if (!r) return M;
  const R = $('alignCorr').checked ? r.R : r.R1;
  M.set(R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, 0, 0, 0, 1);
  if ($('floorZero').checked && r.floorZ != null) M.premultiply(new THREE.Matrix4().makeTranslation(0, 0, -r.floorZ));
  return M;
}
function updateCeiling() {
  S.ceil = null; S.ceilZ = null;
  // world が水平補正済みならそのまま、元に戻した状態なら前に調べた補正を当てて高さを出す
  const L = S.levelInfo ? new THREE.Matrix4() : levelMatrix(S.lastLevel);
  const e = L.elements, n = new THREE.Vector3(e[2], e[6], e[10]), tz = e[14];
  const xs = [], ys = [], z = [];
  for (const smp of S.worldSample || []) for (let i = 0; i < smp.length; i += 3) { xs.push(smp[i]); ys.push(smp[i + 1]); z.push(n.x * smp[i] + n.y * smp[i + 1] + n.z * smp[i + 2] + tz); }
  // 水平補正で床が分かっていれば、その高さ（この座標で）を床とする
  const r = S.levelInfo || S.lastLevel;
  const floorHint = r && r.floorZ != null ? ($('floorZero').checked ? 0 : r.floorZ) : null;
  // 水平かどうか分からない地図（一度も水平補正していない）では、天井の面がはっきりしているときだけ使う
  const c = findCeiling(z, xs, ys, floorHint, !r);
  if (!c) return;
  S.ceilZ = c.z;
  S.ceil = { n, d: c.z - tz };
}
// 天井の高さ: 高さの層（10 cm ごと）を「覆う広さ」（点のある 0.5 m 角のマスの数。壁の分は前後 ±0.5 m の最小を引く）で比べ、
//   床から 1.8 m 以上上にあり、床と同じくらい広く覆う（床の 4 割以上。水平か分からないときは 6 割以上）層で最も低いものを天井とする
//   （部屋ごとに天井の高さが違っても全部隠れる）。屋外の木の葉のように狭いものは天井にしない。
//   隠れる点が全体の半分を超えるとき（2 階建てなど）は隠さない
function findCeiling(z, xs, ys, floorHint = null, strict = false) {
  const m = z ? z.length : 0;
  if (m < 1000) return null;
  const pr = a => { const s = Float64Array.from(a).sort(); return [s[Math.floor(0.001 * (m - 1))], s[Math.floor(0.999 * (m - 1))]]; };
  const [lo, hi] = pr(z), [x0, x1] = pr(xs), [y0, y1] = pr(ys);
  if (!(hi - lo >= 1.2)) return null;
  const g = 0.5, bw = Math.max(0.1, (hi - lo) / 20000);
  const gx = Math.floor((x1 - x0) / g) + 1, gy = Math.floor((y1 - y0) / g) + 1, nb = Math.floor((hi - lo) / bw) + 1;
  if (!(gx * gy * nb < 2 ** 52)) return null;
  const cov = new Float64Array(nb), seen = new Set(), foot = new Set(); // foot: 点のある xy のマス（地図の広さ）
  for (let i = 0; i < m; i++) {
    const v = z[i];
    if (v < lo || v > hi || xs[i] < x0 || xs[i] > x1 || ys[i] < y0 || ys[i] > y1) continue;
    const c = Math.floor((xs[i] - x0) / g) * gy + Math.floor((ys[i] - y0) / g), b = Math.floor((v - lo) / bw), key = b * gx * gy + c;
    if (!seen.has(key)) { seen.add(key); cov[b]++; foot.add(c); }
  }
  const W = Math.max(1, Math.round(0.5 / bw)), sm = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    let mn = Infinity;
    for (let k = -W; k <= W; k++) if (b + k >= 0 && b + k < nb) mn = Math.min(mn, cov[b + k]);
    sm[b] = cov[b] - mn;
  }
  let mx = 0;
  for (let b = 0; b < nb; b++) if (sm[b] > mx) mx = sm[b]; // 引数に広げない（本数が多いと例外になる）
  if (mx < 20) return null;
  const peaks = [];
  for (let b = 0; b < nb; b++) {
    const left = b > 0 ? sm[b - 1] : -1, right = b < nb - 1 ? sm[b + 1] : -1;
    if (sm[b] >= 0.05 * mx && sm[b] >= left && sm[b] > right) peaks.push({ z: lo + (b + 0.5) * bw, a: sm[b] });
  }
  let floor = floorHint;
  if (floor == null) { const p = peaks.find(q => q.a >= 0.5 * mx); if (!p) return null; floor = p.z; }
  const near = peaks.filter(q => Math.abs(q.z - floor) <= 0.3);
  const floorA = near.length ? Math.max(...near.map(q => q.a)) : mx;
  const ceil = peaks.find(q => q.z - floor >= 1.8 && q.a >= (strict ? 0.6 : 0.4) * floorA && q.a >= (strict ? 0.5 : 0.3) * foot.size);
  if (!ceil) return null;
  const cz = ceil.z - 0.2;
  let hid = 0;
  for (let i = 0; i < m; i++) if (z[i] > cz) hid++;
  if (hid > 0.5 * m) return null;
  return { z: cz, share: hid / m };
}
// 天井より下にある点の高さ（色の範囲を決める用）
function visibleZ() {
  const { n, d } = S.ceil, out = [];
  for (const smp of S.worldSample || []) for (let i = 0; i < smp.length; i += 3) {
    if (n.x * smp[i] + n.y * smp[i + 1] + n.z * smp[i + 2] <= d) out.push(smp[i + 2]);
  }
  return out.sort((a, b) => a - b);
}
function updateClip() {
  const mn = [-1e9, -1e9, -1e9], mx = [1e9, 1e9, 1e9];
  clipD.forEach((d, k) => { if (!d.full()) { const [a, b] = d.get(); mn[k] = a; mx[k] = b; } });
  const useCeil = S.hideCeil && S.ceil;
  if (useCeil) shared.uCeilN.value.copy(S.ceil.n);
  shared.uCeilD.value = useCeil ? S.ceil.d : 1e9;
  const cb = $('btnCeil');
  // 天井が見つからない点群では「入」の見た目にしない（押せない見た目にする）
  // 点群を開く前は、入・切の設定をそのまま見せる
  const noCeil = !S.ceil && S.files.length > 0, pressed = !!S.hideCeil && !noCeil;
  cb.classList.toggle('on', pressed);
  cb.classList.toggle('na', noCeil); cb.setAttribute('aria-disabled', String(noCeil)); cb.setAttribute('aria-pressed', String(pressed));
  if ($('secOn').checked) {
    const ax = +$('secAxis').value, [a, b] = sectionRange();
    mn[ax] = Math.max(mn[ax], a); mx[ax] = Math.min(mx[ax], b);
  }
  shared.uClipMin.value.set(...mn); shared.uClipMax.value.set(...mx);
  drawHist(); updateStatus();
  requestRender();
}
function sectionRange() {
  const ax = +$('secAxis').value;
  const p = S.bounds.min[ax] + (S.bounds.max[ax] - S.bounds.min[ax]) * +$('secPos').value;
  const t = +$('secThick').value;
  return [p - t / 2, p + t / 2];
}
function updateSection() {
  const ax = +$('secAxis').value;
  const p = S.bounds.min[ax] + (S.bounds.max[ax] - S.bounds.min[ax]) * +$('secPos').value;
  $('secPosVal').textContent = `${'xyz'[ax]} = ${fmt(p + disp(ax))} m`;
}

// ------------------------------------------------------------------ 色
function fieldNames() {
  const s = new Set();
  for (const f of S.files) Object.keys(f.stats).forEach(k => s.add(k));
  return [...s];
}
// 値の欄の基準値: double の欄（時刻など）は読み込みで基準値を引いて float で持つ（fieldBase）。
//   色の計算（GPU）は「最初のファイルの基準値」からの差で行い、画面に出す数は基準値を足し戻す
const fieldBaseOf = (f, name) => (f.fieldBase && f.fieldBase[name]) || 0;
function fieldSummary(name) {
  let min = Infinity, max = -Infinity, p1 = Infinity, p99 = -Infinity, categorical = true, values = new Set(), base = null;
  for (const f of S.files) {
    const st = f.stats[name];
    if (!st) continue;
    const b = fieldBaseOf(f, name);
    if (base === null) base = b;
    const d = b - base; // 値はこのファイルの基準値からの差なので、最初のファイルの基準値からの差に直す
    min = Math.min(min, st.min + d); max = Math.max(max, st.max + d); p1 = Math.min(p1, st.p1 + d); p99 = Math.max(p99, st.p99 + d);
    if (!st.categorical) categorical = false; else st.values.forEach(v => values.add(v + b));
  }
  return { min, max, p1, p99, categorical, values: [...values].sort((a, b) => a - b), base: base || 0 };
}
// 色の目盛り・範囲に出す数に足す値（高さは座標の基準、値の欄は基準値）
function valueShift() {
  if (S.colorMode === 'height') return disp(2);
  if (S.colorMode === 'field' && S.field) return fieldSummary(S.field).base;
  return 0;
}
// 色の目盛り・範囲に出す 1 つの数。時刻の欄（livox の timestamp の ns など、桁の大きいもの）は「最初の点からの秒」で出す（R7-010）
function timeView() {
  if (S.colorMode !== 'field' || !S.field || !/time|stamp|^t$/i.test(S.field)) return null;
  const sum = fieldSummary(S.field);
  const big = Math.max(Math.abs(sum.min + sum.base), Math.abs(sum.max + sum.base));
  if (!(big >= 1e6)) return null;
  const scale = big > 1e17 ? 1e-9 : big > 1e14 ? 1e-6 : big > 1e11 ? 1e-3 : 1; // ns・µs・ms・s
  return { ref: sum.min, scale };
}
function fmtColorVal(v, withUnit = true) {
  const tv = timeView();
  if (tv) return `+${fmt((v - tv.ref) * tv.scale, 3)}${withUnit ? ' s' : ''}`;
  return `${fmt(v + valueShift())}${withUnit && S.colorMode === 'height' ? ' m' : ''}`;
}
// 色分けの値を GPU に送る。種類（整数の値）の色分けでは、値ごとの番号（凡例の順）を送る（値が 64 以上離れても色が重ならない）
async function ensureField(f, name, sum = fieldSummary(name)) {
  if (!f.stats[name]) return false;
  const key = name + (sum.categorical ? '#' + sum.values.join(',') : '@' + sum.base);
  if (f.fieldKey === key) return true;
  let raw = f.fieldRaw && f.fieldRaw.name === name ? f.fieldRaw.values : null;
  if (!raw) {
    const r = await call({ type: 'field', id: f.id, name });
    if (!S.files.includes(f)) return false; // 待っている間に閉じられた
    raw = r.values; f.fieldRaw = { name, values: raw };
  }
  const b = fieldBaseOf(f, name);
  let vals = raw;
  if (sum.categorical) {
    const idx = new Map(sum.values.map((v, i) => [v, i]));
    vals = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) { const j = idx.get(raw[i] + b); vals[i] = j === undefined ? 63 : j; }
  } else if (b !== sum.base) {
    vals = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) vals[i] = raw[i] + (b - sum.base);
  }
  f.fieldSampleVals = vals.slice(0, SAMPLE_N); // 色の範囲を決める標本だけ残す
  // 前の項目の GPU バッファは使い回す（置き換えると three.js は古いバッファを消さない。R17-003）
  const old = f.geom.getAttribute('scalar');
  if (old && old.count === vals.length) { old.array = vals.constructor === old.array.constructor ? vals : new old.array.constructor(vals); old.needsUpdate = true; }
  else f.geom.setAttribute('scalar', freeAfterUpload(new THREE.BufferAttribute(vals, 1)));
  f.fieldName = name; f.fieldKey = key; f.fieldRaw = null;
  return true;
}
async function applyColor(resetRange = true) {
  const mode = $('colorMode').value;
  if (resetRange) S.fieldSample = null;
  const gen = S.colorGen = (S.colorGen || 0) + 1; // 項目の値を待っている間に色分けが切り替わったら、古い呼び出しは何もしない（R11-002）
  if (S.colorMode === 'rgb' && mode !== 'rgb') status('');
  S.colorMode = mode;
  const names = fieldNames();
  $('rowField').hidden = mode !== 'field';
  $('rowCmap').hidden = !(mode === 'height' || mode === 'field');
  $('rangeBox').hidden = !(mode === 'height' || (mode === 'field' && !(S.field && fieldSummary(S.field).categorical)));
  if (mode === 'field') {
    if (!names.length) { status('この点群には色分けできる項目がありません'); $('colorMode').value = 'height'; return applyColor(); }
    S.field = $('fieldSel').value || names[0];
    const sum = fieldSummary(S.field);
    $('rangeBox').hidden = sum.categorical;
    for (const f of [...S.files]) {
      const has = await ensureField(f, S.field, sum);
      if (gen !== S.colorGen) return;
      f.mat.uniforms.uMode.value = has ? (sum.categorical ? 2 : 1) : 3;
    }
    shared.uCatMin.value = 0; // 種類の色分けでは、値ではなく番号（0, 1, 2, …）を送っている
    if (resetRange && !sum.categorical) { colorRange.setBounds(sum.min, sum.max, true); colorRange.set(sum.p1, sum.p99); }
  } else if (mode === 'height') {
    for (const f of S.files) f.mat.uniforms.uMode.value = 0;
    if (resetRange && S.zSample && S.zSample.length) {
      colorRange.setBounds(S.bounds.min[2], S.bounds.max[2], true);
      // 天井を隠しているときは、見えている点だけで色の範囲を決める
      const zs = S.hideCeil && S.ceil ? visibleZ() : S.zSample;
      colorRange.set(percentile(zs, 0.01), percentile(zs, 0.99));
    }
  } else if (mode === 'single') {
    for (const f of S.files) f.mat.uniforms.uMode.value = 3;
  } else if (mode === 'rgb') {
    for (const f of S.files) f.mat.uniforms.uMode.value = f.hasRgb ? 4 : 3;
    if (S.files.length && !S.files.some(f => f.hasRgb)) status('RGB の色を持つファイルがないので、単色で表示しています');
  }
  const [a, b] = colorRange.get(); shared.uMin.value = a; shared.uMax.value = b;
  $('rowMap').hidden = !(mode === 'height' || (mode === 'field' && !(S.field && fieldSummary(S.field).categorical)));
  $('rowBand').hidden = $('rowMap').hidden || shared.uMapMode.value !== 2;
  refreshEq();
  drawLegend();
  syncSegs();
  requestRender();
}
function drawLegend() {
  const el = $('legend'), mode = S.colorMode;
  if (mode === 'single' || mode === 'rgb') {
    el.innerHTML = `<div class="cats">${S.files.map(f => `<span><i style="background:${f.color}"></i>${escapeHtml(f.name)}</span>`).join('')}</div>`;
    return;
  }
  if (mode === 'field' && S.field && fieldSummary(S.field).categorical) {
    const sum = fieldSummary(S.field);
    el.innerHTML = `<div class="cats">${sum.values.map((v, i) => `<span><i style="background:${CAT_COLORS[i % CAT_COLORS.length]}"></i>${escapeHtml(S.field)} = ${v}</span>`).join('')}</div>`;
    return;
  }
  const [a, b] = colorRange.get();
  const unit = mode === 'height' ? ' m' : '';
  const mm = shared.uMapMode.value;
  let ticks;
  if (mm === 2) {
    const band = shared.uBand.value;
    ticks = [0, 0.5, 1].map(q => `${q ? '+' : ''}${fmt(q * band)}${unit}`);
    const tv = timeView();
    if (tv) ticks[1] = `+${fmt(0.5 * band * tv.scale, 3)} s`;
    ticks[0] = fmtColorVal(a); ticks[2] = tv ? `${fmt(band * tv.scale, 3)} s ごと` : `${fmt(band)}${unit} ごと`;
  } else {
    // 均等化では色の位置と値が比例しないので、色の 0・25・50・75・100% にあたる値を出す
    const at = q => {
      if (mm !== 1) return a + (b - a) * q;
      for (let i = 0; i < 1024; i++) if (eqData[4 * i] >= q * 255 - 0.5) return a + (b - a) * i / 1023;
      return b;
    };
    ticks = [0, 0.25, 0.5, 0.75, 1].map(q => fmtColorVal(at(q), q === 1));
    if (timeView()) ticks[0] += '（最初の点から）';
  }
  el.innerHTML = `<div class="bar" style="background:${cssGradient(S.cmap)}"></div>
    <div class="ticks">${ticks.map(t => `<span>${t}</span>`).join('')}</div>`;
}
function refreshFieldSelect() {
  const names = fieldNames();
  const sel = $('fieldSel'), cur = sel.value;
  sel.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (names.includes(cur)) sel.value = cur;
  else if (names.includes('label')) sel.value = 'label';
  else if (names.includes('intensity')) sel.value = 'intensity';
}

// ------------------------------------------------------------------ ファイルの読み込み
const queue = [];
let loading = false;
const extOf = n => { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i + 1).toLowerCase(); };
const IMAGE_EXT = /^(bmp|cur|gif|icns|ico|jpe?g|pbm|pgm|png|ppm|svgz?|tga|wbmp|webp|xbm|xpm|tiff?)$/;
// 軌跡のファイルか（ドラッグや種類を決めずに開いたとき）。名前では決めず、中身で厳しく判定する
//   ・.mcap .tum は軌跡
//   ・.txt .csv は、見出しに姿勢の列（qx qy qz qw、または orientation.x〜w）がそろっている、
//     または数の行がすべて 8 列（TUM: t x y z qx qy qz qw）で、時刻が増えていき、四元数の長さが 1 に近いときだけ軌跡
//   迷うものは点群として開く（あとから一覧の「軌跡として開き直す」で変えられる）
async function isTrajectory(file) {
  const ext = extOf(file.name);
  if (ext === 'mcap' || ext === 'tum') return true;
  if (ext !== 'txt' && ext !== 'csv') return false;
  const head = await file.slice(0, 32768).text();
  const lines = head.split(/\r?\n/);
  if (file.size > 32768) lines.pop(); // 途中で切れた最後の行は使わない
  const body = lines.map(l => l.trim()).filter(l => l && !/^(#|\/\/|%)/.test(l));
  // 数の行（最初の 200 行）。列の数がそろっていなければ null
  const numRows = () => {
    const rows = [];
    for (const l of body) {
      if (/[a-df-z]/i.test(l.replace(/e[-+]?\d/gi, ''))) continue; // 見出しなどの文字の行
      const v = l.split(/[\s,;]+/).map(Number);
      if (!v.every(Number.isFinite) || (rows.length && v.length !== rows[0].length)) return null;
      rows.push(v);
      if (rows.length >= 200) break;
    }
    return rows.length >= 2 ? rows : null;
  };
  const timeUp = rows => rows.every((w, i) => !i || w[0] >= rows[i - 1][0]);
  // 位置（2〜4 列目）が少しずつ動くこと: 隣の行との距離の中央値が、全体の広がりの 5% 未満（x の順に並べた点群などを軌跡にしない）
  const smooth = rows => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], st = [];
    rows.forEach((w, i) => { for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], w[a + 1]); hi[a] = Math.max(hi[a], w[a + 1]); } if (i) st.push(Math.hypot(w[1] - rows[i - 1][1], w[2] - rows[i - 1][2], w[3] - rows[i - 1][3])); });
    st.sort((a, b) => a - b);
    const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    if (diag > 0 && !(st[st.length >> 1] < 0.05 * diag)) return false;
    // 動く速さがロボットらしいこと（時刻順に並んだ LiDAR の点は、0.01 秒で数百 m「動く」。R8-001）
    const t0 = rows[0][0], t1 = rows[rows.length - 1][0], big = Math.max(Math.abs(t0), Math.abs(t1));
    const dt = (t1 - t0) * (big > 1e17 ? 1e-9 : big > 1e14 ? 1e-6 : big > 1e11 ? 1e-3 : 1);
    const path = st.reduce((a, b) => a + b, 0);
    return !(path > 1) || (dt > 0 && path / dt < 30);
  };
  // 見出しの行: 先頭の行。それが「# exported by …」のような注釈で、次の行が見出しならそちら（R12-006）
  const textLines = lines.filter(l => l.trim()).slice(0, 2);
  const isWordy = l => l && /[a-z_぀-ヿ一-鿿]/i.test(l.replace(/e[-+]?\d/gi, ''));
  const first = /^\s*(#|\/\/|%)/.test(textLines[0] || '') && isWordy(textLines[1]) && !/^\s*(#|\/\/|%)/.test(textLines[1]) ? textLines[1] : textLines[0];
  if (isWordy(first)) {
    // 単位（「time [s]」「x (m)」）を外してから列に分ける
    const cols = first.replace(/^[#/%\s]+/, '').toLowerCase().replace(/\s*[[(（][^\])）]*[\])）]/g, '').split(/[\s,;\t]+/).map(c => c.replace(/^["']|["']$/g, ''));
    const q = ['x', 'y', 'z', 'w'];
    if (q.every(a => cols.includes('q' + a)) || q.every(a => cols.some(c => new RegExp(`orientation[._]${a}$`).test(c)))) return true;
    // 「t x y z」「timestamp x y z …」のように、先頭の列が時刻で続く 3 列が位置の見出し（時刻が増えていくこと）
    const pos = a => new RegExp(`^((t|p)|pos[._]?|position[._])?${a}(_m)?$`);
    if (/^(t|time|timestamp|stamp|sec|secs|gps_?time|時刻|時間)(_?(s|sec|ns|us|ms))?$/.test(cols[0]) && pos('x').test(cols[1]) && pos('y').test(cols[2]) && pos('z').test(cols[3])) {
      const rows = numRows();
      // 8 列なら 5〜8 列目が姿勢の名前であること（「timestamp,x,y,z,intensity,…」の点群を軌跡にしない。R8-001）
      if (rows && rows[0].length === 8 && !/^(q|orientation[._])?x$/.test(cols[4] || '')) return false;
      return !!rows && (rows[0].length === 4 || rows[0].length === 8) && timeUp(rows) && smooth(rows);
    }
  }
  const rows = numRows();
  if (!rows || rows[0].length < 8 || rows[0].length === 12) return false; // 12 列は KITTI（時刻なし）
  return timeUp(rows) && smooth(rows) && rows.every(w => Math.abs(Math.hypot(w[4], w[5], w[6], w[7]) - 1) < 0.05);
}
// 一緒に選んだ付属ファイル（.sbf.data / .shx .dbf / glTF の .bin・画像 など）は単独では開かない
//   .bin・画像は、一緒に選んだ glTF / GLB / .mtl / DAE / FBX が実際にその名前を使っているときだけ付属ファイルにする
//   （使われていない CloudCompare の .bin・GeoTIFF・写真は、普通に開く）
async function companionsOf(files) {
  const names = new Set(files.map(f => f.name.toLowerCase()));
  const base = n => n.toLowerCase().replace(/\.[^.]+$/, '');
  const leaf = s => { try { s = decodeURIComponent(s); } catch (e) { /* そのまま */ } return s.replace(/^.*[\\/]/, '').trim().toLowerCase(); };
  const cands = files.filter(f => { const e = extOf(f.name); return e === 'bin' || IMAGE_EXT.test(e); });
  const used = new Set();
  if (cands.length) for (const f of files) {
    const e = extOf(f.name);
    try {
      if (e === 'gltf' || e === 'glb') {
        let json;
        if (e === 'gltf') json = JSON.parse(await f.slice(0, 2e8).text());
        else { const h = new DataView(await f.slice(0, 20).arrayBuffer()); if (h.byteLength >= 20) json = JSON.parse(await f.slice(20, 20 + h.getUint32(12, true)).text()); }
        for (const x of [...(json?.buffers || []), ...(json?.images || [])]) if (x && x.uri && !x.uri.startsWith('data:')) used.add(leaf(x.uri));
      } else if (e === 'mtl') {
        for (const m of (await f.text()).matchAll(/^\s*(?:map_\w+|bump|disp|decal|refl|norm)\s+(.+?)\s*$/gim)) { const w = m[1].split(/\s+/); used.add(leaf(m[1])); used.add(leaf(w[w.length - 1])); }
      } else if (e === 'dae' || e === 'fbx') {
        const txt = (await f.slice(0, 5e8).text()).toLowerCase();
        for (const c of cands) if (txt.includes(c.name.toLowerCase())) used.add(c.name.toLowerCase());
      }
    } catch (err) { /* 読めない本体は、ここでは何も使わないとみなす（本体を開くときに知らせる） */ }
  }
  return f => {
    const n = f.name.toLowerCase(), e = extOf(n);
    if (n.endsWith('.sbf.data') && names.has(n.slice(0, -5))) return true;
    if (/^(shx|dbf|prj|cpg|sbn|sbx|qix)$/.test(e) && names.has(base(n) + '.shp')) return true;
    if (e === 'mtl') return files.some(g => extOf(g.name) === 'obj'); // .mtl だけを選んだときは、開けないことを知らせる
    if ((e === 'bin' || IMAGE_EXT.test(e)) && used.has(n)) return true;
    return false;
  };
}
// ひとまとまりの読み込み（順番待ちが空になるまで）で開けなかったファイル。最後にまとめて知らせる
const loadBatch = { total: 0, failed: [] };
function startBatchIfIdle() {
  if (loading || queue.length) return;
  loadBatch.total = 0; loadBatch.failed = [];
  msgIsError = false; // 新しい操作では、前の操作の赤い知らせに「開きました」を止めさせない（R7-001）
  const el = $('loadErrors'); if (el) { el.hidden = true; el.innerHTML = ''; }
}
function finishBatch() {
  // 順番待ちの間は省いた重い計算（範囲・色）を、最後に 1 回だけする
  if (S.refreshPending) { S.refreshPending = false; if (S.files.length) { updateBounds(false); applyColor(true); applyLod(); } }
  const fl = loadBatch.failed;
  if (fl.length) {
    const el = $('loadErrors');
    if (el) { el.hidden = false; el.innerHTML = `<b>開けなかったファイル</b><ul>${fl.map(x => `<li><span class="n">${escapeHtml(x.name)}</span>${escapeHtml(x.message)}</li>`).join('')}</ul>`; }
    if (loadBatch.total > 1) status(`${loadBatch.total} 個のうち ${fl.length} 個を開けませんでした（${fl.slice(0, 3).map(x => x.name).join('、')}${fl.length > 3 ? ' ほか' : ''}）`, true);
  }
  loadBatch.total = 0; loadBatch.failed = [];
}
async function enqueue(files, kind = null) {
  startBatchIfIdle();
  let added = 0; // 自分が積んだ数だけ数える（同時に走る別の enqueue の分を数えない。R11-001）
  const isPart = await companionsOf(files);
  const parts = {};
  for (const f of files) parts[f.name] = f;
  // .pov / .icm は、中に書かれた点群ファイルを開く（一緒に選んでおく必要がある）
  const viaMeta = new Set();
  for (const file of files) {
    const ext = extOf(file.name);
    if (ext !== 'pov' && ext !== 'icm') continue;
    const txt = await file.text();
    const refs = ext === 'pov' ? [...txt.matchAll(/^F\s+(.+?)\s*$/gm)].map(m => m[1]) : [...txt.matchAll(/^FILE_NAME=(.+?)\s*$/gm)].map(m => m[1]);
    const found = refs.map(r => files.find(f => f.name === r.replace(/^.*[\\/]/, '')));
    if (!refs.length) { status(`${file.name} に点群ファイルの名前が書かれていません`, true); continue; }
    if (found.some(f => !f)) { status(`${file.name} が使う ${refs.filter((r, i) => !found[i]).join(', ')} も一緒に選んでください`, true); continue; }
    for (const f of found) if (!viaMeta.has(f)) { viaMeta.add(f); queue.push({ file: f, kind: 'cloud', parts }); added++; }
    // .icm の画像の目録（.wrl）は点群ではないので開かない（一緒に選ばれていても黙って使わない）
    if (ext === 'icm') for (const m of txt.matchAll(/^IMAGES_DESCRIPTOR=(.+?)\s*$/gm)) { const w = files.find(f => f.name === m[1].replace(/^.*[\\/]/, '')); if (w) viaMeta.add(w); }
  }
  for (const file of files) {
    const ext = extOf(file.name);
    if (ext === 'pov' || ext === 'icm' || viaMeta.has(file)) continue; // viaMeta: 目録から開いた点群・使わない画像の目録
    if (kind !== 'traj' && isPart(file)) continue;
    const k = kind || (await isTrajectory(file) ? 'traj' : 'cloud');
    queue.push({ file, kind: k, parts, auto: !kind }); added++;
  }
  loadBatch.total += added;
  if (!loading) loadNext();
}
async function loadNext() {
  const item = queue.shift();
  if (!item) { loading = false; S.loadingFile = null; finishBatch(); return; }
  loading = true;
  const { file, kind, parts } = item;
  const id = ++S.seq;
  try {
    S.loadingFile = { id, name: file.name, size: file.size, file, auto: item.auto, kind, parts };
    showProgress(`${file.name} を開いています`, 0, '読み込み');
    if (kind === 'traj') {
      // .mcap は少しずつ読んで軌跡の記録だけを送る（数 GB の bag でも、丸ごと読まない。R12-002）
      const magic = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      const isMcap = magic.length === 5 && magic[0] === 0x89 && magic[1] === 0x4d && magic[2] === 0x43 && magic[3] === 0x41 && magic[4] === 0x50;
      const buffer = isMcap ? await extractMcap(file) : await file.arrayBuffer();
      worker.postMessage({ type: 'traj', id, buffer, name: file.name }, [buffer]);
      return;
    }
    const opts = { id, name: file.name, cap: maxPoints(), offset: S.offset, base: document.baseURI };
    const ext = extOf(file.name);
    if (ext === 'fbx' || ext === 'dae') {
      // FBX・COLLADA は three.js の読み込み部品を使う（画面側で読んで、三角形だけ別スレッドに送る）
      const mesh = await readWithThree(file, ext, parts);
      worker.postMessage({ type: 'load', ...opts, mesh }, [mesh.V.buffer, mesh.T.buffer, ...(mesh.C ? [mesh.C.buffer] : [])]);
      return;
    }
    if (ext === 'svg' || ext === 'svgz') {
      // SVG は画面側で画素にする（別スレッドでは描けないため）
      const pixels = await rasterizeSVG(file, ext);
      worker.postMessage({ type: 'load', ...opts, pixels }, [pixels.data.buffer]);
      return;
    }
    const companions = {};
    for (const [n, f] of Object.entries(parts || {})) if (f !== file) companions[n] = f;
    worker.postMessage({ type: 'load', ...opts, file, companions });
  } catch (err) {
    loadFailed(err && err.message || String(err));
  }
}
const MAX_SVG_BYTES = 100e6; // SVGZ を展開したあとの大きさの上限（100 MB）
async function rasterizeSVG(file, ext) {
  let blob = file;
  if (ext === 'svgz') { // 少しずつ展開して大きさを数え、上限を超えたら止める（小さなファイルが巨大に膨らむ「解凍爆弾」を防ぐ。S2-002）
    // ブラウザの DecompressionStream は渡した分を一度に全部展開してしまうので使わない。16 KB ずつ渡す（1 回の展開は最大 16 MB 程度）
    const parts = []; let total = 0, tooBig = false;
    const gz = new Gunzip(d => { if (tooBig) return; total += d.length; if (total > MAX_SVG_BYTES) { tooBig = true; parts.length = 0; } else parts.push(d); });
    try {
      for (let o = 0; o < file.size && !tooBig; o += 1 << 16) {
        const buf = new Uint8Array(await file.slice(o, o + (1 << 16)).arrayBuffer());
        for (let q = 0; q < buf.length && !tooBig; q += 1 << 14) gz.push(buf.subarray(q, q + (1 << 14)), o + q + (1 << 14) >= file.size);
      }
    } catch (e) { throw new Error('SVGZ を展開できませんでした（ファイルが壊れている可能性があります）'); }
    if (tooBig) throw new Error(`この SVGZ は展開すると大きすぎるため開けません（展開後 ${MAX_SVG_BYTES / 1e6} MB まで）`);
    blob = new Blob(parts);
  }
  const url = URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG を描けませんでした')); img.src = url; });
    let w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
    const s = Math.min(4, 2048 / Math.max(w, h)); // 小さな SVG は大きめに描く
    w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h).data;
    return { w, h, data: new Uint8ClampedArray(data.buffer), format: `画像（SVG、${w} × ${h} 画素に描画）` };
  } finally { URL.revokeObjectURL(url); }
}
async function readWithThree(file, ext, parts) {
  const urls = {};
  const manager = new THREE.LoadingManager();
  const partOf = n => parts[n] || Object.entries(parts).find(([k]) => k.toLowerCase() === n.toLowerCase())?.[1]; // 名前の大文字小文字は問わない
  // 模様の画像などの参照は、一緒に選んだファイルの中からだけ探す。ファイルに書かれた外の場所（file://・共有フォルダ・http・
  // 絶対パス）へは読みに行かない（S3-001・S3-003）。部品が中で作る blob:・data: はそのまま。見つからなければ 1 画素の空の画像
  const EMPTY_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  manager.setURLModifier(u => { if (/^(blob|data):/i.test(u)) return u; let n = String(u).replace(/[?#].*$/, '').replace(/^.*[\\/]/, ''); try { n = decodeURIComponent(n); } catch (e) { /* そのまま */ } const p = n && partOf(n); if (p) return urls[n] || (urls[n] = URL.createObjectURL(p)); return EMPTY_IMG; });
  let root;
  try {
    if (ext === 'fbx') {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      root = new FBXLoader(manager).parse(await file.arrayBuffer(), '');
    } else {
      const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
      root = new ColladaLoader(manager).parse(await file.text(), '')?.scene;
      // Z_UP のファイルに部品が付ける「Y を上にする回転」を外す（このアプリは Z が上。R15-007）
      if (root) root.rotation.set(0, 0, 0);
    }
  } catch (e) { // 部品の英語の例外は出さない
    for (const u of Object.values(urls)) URL.revokeObjectURL(u);
    if (/[぀-ヿ一-鿿]/.test(e?.message || '')) throw e;
    throw new Error(`${ext === 'fbx' ? 'FBX' : 'COLLADA（DAE）'} のファイルが壊れているか、対応していない版のため開けません`);
  }
  if (!root) throw new Error('COLLADA（DAE）のファイルが壊れているため開けません');
  root.updateMatrixWorld(true);
  const Vs = [], Ts = [], Cs = []; let nv = 0, hasC = false;
  root.traverse(o => {
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    const g = o.geometry, pos = g.attributes.position;
    if (!pos) return;
    const v = new THREE.Vector3();
    const V = new Float64Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); V[3 * i] = v.x; V[3 * i + 1] = v.y; V[3 * i + 2] = v.z; }
    const col = g.attributes.color;
    const C = new Uint8Array(pos.count * 3);
    // 部品が色を線形に直して返すので、ファイルに書かれた sRGB の値に戻してから 0〜255 にする（R15-006）
    const sc = new THREE.Color();
    if (col) { hasC = true; for (let i = 0; i < pos.count; i++) { sc.setRGB(col.getX(i), col.getY(i), col.getZ(i)).convertLinearToSRGB(); C[3 * i] = Math.round(sc.r * 255); C[3 * i + 1] = Math.round(sc.g * 255); C[3 * i + 2] = Math.round(sc.b * 255); } }
    else { const m = Array.isArray(o.material) ? o.material[0] : o.material; const c = m && m.color ? m.color.clone().convertLinearToSRGB() : new THREE.Color(0.8, 0.8, 0.8); C.fill(0); for (let i = 0; i < pos.count; i++) { C[3 * i] = Math.round(c.r * 255); C[3 * i + 1] = Math.round(c.g * 255); C[3 * i + 2] = Math.round(c.b * 255); } }
    const T = [];
    if (o.isMesh) {
      if (g.index) for (let i = 0; i < g.index.count; i++) T.push(g.index.getX(i) + nv);
      else for (let i = 0; i < pos.count; i++) T.push(i + nv);
    }
    Vs.push(V); Cs.push(C); Ts.push(T); nv += pos.count;
  });
  if (!nv) throw new Error('形（メッシュ）が見つかりません');
  const V = new Float64Array(nv * 3), C = new Uint8Array(nv * 3);
  let o = 0; Vs.forEach((a, i) => { V.set(a, o); C.set(Cs[i], o); o += a.length; });
  const T = Uint32Array.from(Ts.flat());
  for (const u of Object.values(urls)) URL.revokeObjectURL(u);
  void hasC;
  return { V, T, C, format: ext === 'fbx' ? `FBX（三角形 ${(T.length / 3).toLocaleString()} 個）` : `COLLADA（三角形 ${(T.length / 3).toLocaleString()} 個）` };
}
// 読み込む最大点数（これを超える点群は、ファイル全体から均等に間引いて読む）
function maxPoints() { return +$('capSel').value || 3e7; }
$('capSel').addEventListener('change', e => { try { localStorage.setItem('pcdviewer.cap', e.target.value); } catch (err) { /* 保存できなくても動かす */ } status('次に開くファイルから反映されます'); });
try { const v = localStorage.getItem('pcdviewer.cap'); if (v && [...$('capSel').options].some(o => o.value === v)) $('capSel').value = v; } catch (err) { /* 既定のまま */ }
// 使っていない色のうち最初のもの（全部使っていれば、いちばん使われていない色）
function freeColor(palette, used) {
  const cnt = palette.map(c => used.filter(u => u && u.toLowerCase() === c.toLowerCase()).length);
  return palette[cnt.indexOf(Math.min(...cnt))];
}
// 開いたあとの表示の準備で問題が起きても、順番待ちは止めない（次のファイルへ進む）
// 「すべて閉じる」のあとに届いた読み込み結果は捨てる（R5-004）
function droppedLoad(m) {
  if (!S.loadingFile || !S.loadingFile.cancelled) return false;
  worker.postMessage({ type: 'remove', id: m.id });
  hideProgress(); S.loadingFile = null; loadNext();
  return true;
}
function onLoaded(m) {
  if (droppedLoad(m)) return;
  const info = S.loadingFile || { name: 'ファイル', size: 0 };
  const n0 = S.files.length;
  try { onLoadedInner(m, info); }
  catch (err) {
    console.error(err);
    hideProgress();
    if (S.files.length === n0) { worker.postMessage({ type: 'remove', id: m.id }); loadBatch.failed.push({ name: info.name, message: jaError(err.message) }); }
    status(`${info.name} を表示する途中で問題が起きました: ${jaError(err.message)}`, true);
  }
  S.loadingFile = null;
  loadNext();
}
function onTraj(m) {
  if (droppedLoad(m)) return;
  const info = S.loadingFile || { name: '軌跡', size: 0 };
  try { onTrajInner(m, info); }
  catch (err) {
    console.error(err); hideProgress();
    loadBatch.failed.push({ name: info.name, message: jaError(err.message) });
    status(`${info.name} を開けませんでした: ${jaError(err.message)}`, true);
  }
  S.loadingFile = null;
  loadNext();
}
function onLoadedInner(m, info) {
  const color = freeColor(FILE_COLORS, S.files.map(f => f.color));
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', freeAfterUpload(new THREE.BufferAttribute(m.positions, 3)));
  if (m.rgb) geom.setAttribute('rgbc', freeAfterUpload(new THREE.BufferAttribute(m.rgb, 3, true)));
  const c = new THREE.Vector3((m.bbox.min[0] + m.bbox.max[0]) / 2, (m.bbox.min[1] + m.bbox.max[1]) / 2, (m.bbox.min[2] + m.bbox.max[2]) / 2);
  geom.boundingSphere = new THREE.Sphere(c, Math.hypot(m.bbox.max[0] - m.bbox.min[0], m.bbox.max[1] - m.bbox.min[1], m.bbox.max[2] - m.bbox.min[2]) / 2);
  const mat = makeMaterial(color);
  const points = new THREE.Points(geom, mat);
  world.add(points);
  if (!S.offset) S.offset = m.offset;
  const f = { id: m.id, name: info.name, size: info.size, n: m.n, total: m.total, sampled: m.sampled, skipped: m.skipped, header: m.header, bbox: m.bbox, stats: m.stats,
    sample: m.positions.slice(0, 3 * Math.min(m.n, SAMPLE_N)), hasRgb: !!m.rgb, geom, mat, points, color, visible: true, fieldName: null, file: info.file, fieldBase: m.fieldBase || {} };
  const dup = S.files.some(x => x.name === f.name && x.size === f.size); // 同じファイルを重ねて開いたことを知らせる（R11-007）
  S.files.push(f);
  S.active = f.id;
  hideProgress();
  $('empty').hidden = true;
  const first = S.files.length === 1;
  if (first) S.lastLevel = null; // 別の地図の傾きは使わない
  refreshFieldSelect();
  if (m.rgb && first) $('colorMode').value = 'rgb';
  renderFileList();
  // まだ順番待ちがあるときは、範囲・色の計算（全ファイル分）を最後の 1 回にまとめる（たくさん開くと 2 乗で遅くなるため）
  if (first || !queue.length) { S.refreshPending = false; updateBounds(first); applyColor(true); }
  else S.refreshPending = true;
  if (first) { setView('iso', false); showNavHint(); }
  // 平らなもの（画像など）は水平補正しない
  if (first && $('autoLevel').checked && (m.bbox.max[2] - m.bbox.min[2]) > 1e-6 * Math.max(1, m.bbox.max[0] - m.bbox.min[0], m.bbox.max[1] - m.bbox.min[1])) runLevel(true);
  status(`${info.name} を開きました（${m.sampled ? `全 ${fmtN(m.total)} 点のうち ${fmtN(m.n)} 点を表示` : `${fmtN(m.n)} 点`}${m.skipped ? `、座標のない ${fmtN(m.skipped)} 点を除外` : ''}）${dup ? '。同じファイルがすでに開いているので、重ねて表示しています' : ''}`, false, true);
  applyLod();
}
function onTrajInner(m, info) {
  const n = m.count, P = new Float32Array(n * 3);
  let len = 0;
  const cum = new Float64Array(n);
  // 点群と同じグローバルシフトを引いて持つ（地図座標の軌跡が地図と重なるように）。まだ点群がなく軌跡の座標が大きいときは、軌跡から決める
  if (!S.offset && n) { const o = [1, 2, 3].map(k => { const v = m.poses[k]; return Math.abs(v) >= 1e4 ? Math.round(v / 100) * 100 : 0; }); if (o.some(v => v)) S.offset = o; }
  const off = S.offset || [0, 0, 0], Q = m.poses;
  for (let i = 0; i < n; i++) {
    P[3 * i] = Q[8 * i + 1] - off[0]; P[3 * i + 1] = Q[8 * i + 2] - off[1]; P[3 * i + 2] = Q[8 * i + 3] - off[2];
    // 長さは double の元の値で測る（float に丸めた座標では階段状になって長く出る）
    if (i) len += Math.hypot(Q[8 * i + 1] - Q[8 * i - 7], Q[8 * i + 2] - Q[8 * i - 6], Q[8 * i + 3] - Q[8 * i - 5]);
    cum[i] = len;
  }
  // 1 本目は文字の色（色分けの turbo や 1 色の青と重ならない）。2 本目からは、点群の色と違う色を順に使う（比べて見分けられるように）
  const color = freeColor(TRAJ_COLORS, S.trajs.map(t => t.color));
  const line = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(P, 3)),
    new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
  line.renderOrder = 5;
  // 始点・終点の印も、ほかの印と同じ丸
  const ends = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...P.slice(0, 3), ...P.slice(-3)], 3)),
    new THREE.PointsMaterial({ color, size: 10, sizeAttenuation: false, depthTest: false, transparent: true, map: dotTex, alphaTest: 0.5 }));
  ends.renderOrder = 6;
  const g = new THREE.Group(); g.add(line, ends); g.visible = $('showTraj').checked;
  world.add(g);
  const dur = m.poses[8 * (n - 1)] - m.poses[0];
  S.trajs.push({ id: m.id, name: info.name, group: g, count: n, length: len, duration: dur, topic: m.topic, color, visible: true, P, cum, line, ends, file: info.file });
  updateTrajMove();
  hideProgress();
  renderFileList();
  const canCloud = info.file && /^(txt|csv)$/.test(extOf(info.name));
  status(`軌跡 ${info.name} を開きました（${m.topic}、${fmtN(n)} 姿勢、${fmt(len, 1)} m、${fmt(dur, 1)} 秒）${m.note ? `。${m.note}` : ''}${info.auto && canCloud ? '。点群なら「ファイル」の一覧で「点群として開き直す」を押してください' : ''}`, false, true);
  // 点群がないときは、軌跡が見えるように視点を合わせる
  if (!S.files.length && S.trajs.length === 1) setView('iso', false);
  $('empty').hidden = true;
  requestRender();
}
const TRAJ_COLORS = ['#e3e9ef', '#ffd166', '#ff6fb5', '#8be36b', '#66e0ff', '#ff9f43'];

function renderFileList() {
  // 何も開いていないときは、ファイルの一覧と情報の欄を出さない（カードを短くする）
  const has = S.files.length + S.trajs.length > 0;
  $('filesBox').hidden = !has; $('infoBox').hidden = !S.files.length; $('dropHint').hidden = has;
  // 文字の点群（.txt .csv）は、点群と軌跡のどちらとしても開き直せる（中身からの判定が外れたとき用）
  const textFile = x => x.file && /^(txt|csv)$/.test(extOf(x.name));
  $('fileList').innerHTML = S.files.map(f => `
    <li data-id="${f.id}" class="${f.id === S.active ? 'active' : ''}">
      <input type="checkbox" ${f.visible ? 'checked' : ''} aria-label="${escapeHtml(f.name)} を表示" data-act="vis">
      <input type="color" value="${f.color}" aria-label="1 色のときの色" data-act="color">
      <span class="name" data-act="select">${escapeHtml(f.name)}</span>
      <button type="button" class="x" aria-label="閉じる" data-act="remove">×</button>
      <span class="sub">${f.sampled ? `${fmtN(f.n)} / ${fmtN(f.total)}` : fmtN(f.n)} 点 ・ ${(f.size / 1048576).toFixed(1)} MB${textFile(f) ? ` <button type="button" class="reopen" data-act="reopen">軌跡として開き直す</button>` : ''}</span>
    </li>`).join('');
  $('trajList').innerHTML = S.trajs.map(t => `
    <li data-traj="${t.id}">
      <input type="checkbox" ${t.visible ? 'checked' : ''} aria-label="${escapeHtml(t.name)} を表示" data-act="tvis">
      <input type="color" value="${t.color}" aria-label="軌跡の色" data-act="tcolor">
      <span class="name">${escapeHtml(t.name)}</span>
      <button type="button" class="x" aria-label="閉じる" data-act="tremove">×</button>
      <span class="sub">軌跡 ・ ${fmtN(t.count)} 姿勢 ・ ${fmt(t.length, 1)} m ・ ${fmt(t.duration, 1)} 秒${textFile(t) ? ` <button type="button" class="reopen" data-act="treopen">点群として開き直す</button>` : ''}</span>
    </li>`).join('');
  $('dropHint').hidden = S.files.length > 0;
  $('btnCloseAll').hidden = S.files.length + S.trajs.length < 2;
}
// 点群を 1 つ閉じる。refresh = false のときは、範囲・色などの計算を呼ぶ側でまとめて 1 回だけする
function removeFile(f, refresh = true) {
  world.remove(f.points); f.geom.dispose(); f.mat.dispose();
  worker.postMessage({ type: 'remove', id: f.id });
  S.files = S.files.filter(x => x !== f);
  if (S.active === f.id) S.active = S.files.length ? S.files[S.files.length - 1].id : null;
  if (refresh) afterRemove();
}
function afterRemove() {
  $('empty').hidden = S.files.length + S.trajs.length > 0;
  // 色の付け方が残りのファイルで使えなくなったら、黙って高さの色分けに戻す（閉じたことに対して色の知らせは出さない）
  const mode = $('colorMode').value;
  if ((mode === 'rgb' && !S.files.some(x => x.hasRgb)) || (mode === 'field' && !S.files.some(x => Object.keys(x.stats).length))) {
    $('colorMode').value = 'height'; if (S.colorMode === mode) S.colorMode = 'height'; status('');
  }
  S.refreshPending = false;
  // 閉じたファイルの点の吹き出し・計測は消す（ほかのファイルが残っていても。R7-006）
  const alive = new Set(S.files.map(f => f.id));
  for (const p of [...S.pins]) if (p.fileId != null && !alive.has(p.fileId)) removePin(p);
  for (const m of [...S.measures]) if (m.files && m.files.some(id => id != null && !alive.has(id))) removeMeasure(m);
  if (S.mPending && S.mPendingFile != null && !alive.has(S.mPendingFile)) cancelMeasure();
  refreshFieldSelect(); renderFileList(); updateBounds(false); applyColor(S.files.length > 0); applyLod();
  if (!S.files.length) {
    // 点群がひとつもなくなったら、そのファイルに関する表示（情報・高さの分布・計測・水平補正）も消す
    S.zSample = []; S.worldSample = []; S.ceil = null; S.ceilZ = null;
    S.levelInfo = null; S.lastLevel = null; syncLevelBtn();
    if (!S.trajs.length) S.offset = null; // 軌跡が残っている間は、その座標の基準（シフト）を消さない（R6-002）
    world.matrix.identity(); world.updateMatrixWorld(true);
    $('levelResult').textContent = '';
    $('infoBox').open = false;
    hidePickInfo();
    for (const m of [...S.measures]) removeMeasure(m);
    cancelMeasure();
    updateClip();
    // 前の点群の数（色の目盛り・切り出し・断面の位置）を残さない（R3-006）
    $('legend').innerHTML = '';
    for (const el of document.querySelectorAll('.dual .dval')) el.textContent = '—';
    $('secPosVal').textContent = '—';
  }
  updateInfo(); drawHist(); requestRender();
}
function removeTraj(t, refresh = true) {
  world.remove(t.group); t.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  S.trajs = S.trajs.filter(x => x !== t);
  if (!S.files.length && !S.trajs.length) S.offset = null; // 何も残らなければシフトも消す（R6-001）
  if (refresh) { renderFileList(); updateTrajMove(); $('empty').hidden = S.files.length + S.trajs.length > 0; requestRender(); }
}
// ボタンを押した行が消えたあと、キーボードの位置を見失わないように次の場所へフォーカスを移す（R3-007・R8-008）
function focusAfterList() {
  const x = document.querySelector('#fileList [data-act=remove], #trajList [data-act=tremove]');
  (x || $('btnOpen')).focus({ preventScroll: true });
}
function onListEvent(e) {
  const li = e.target.closest('li');
  if (!li) return;
  const act = e.target.dataset.act;
  if (li.dataset.id) {
    const f = S.files.find(x => x.id === +li.dataset.id);
    if (!f) return;
    if (act === 'vis') { f.visible = e.target.checked; f.points.visible = f.visible; updateBounds(false); applyLod(); }
    else if (act === 'color') { f.color = e.target.value; f.mat.uniforms.uColor.value.set(f.color); drawLegend(); requestRender(); }
    else if (act === 'select') { S.active = f.id; renderFileList(); updateInfo(); }
    else if (act === 'remove') { removeFile(f); focusAfterList(); }
    else if (act === 'reopen') { const file = f.file; removeFile(f); enqueue([file], 'traj'); focusAfterList(); }
  } else if (li.dataset.traj) {
    const t = S.trajs.find(x => x.id === +li.dataset.traj);
    if (!t) return;
    if (act === 'tvis') { t.visible = e.target.checked; t.group.visible = t.visible && $('showTraj').checked; updateTrajMove(); requestRender(); }
    else if (act === 'tcolor') { t.color = e.target.value; t.line.material.color.set(t.color); t.ends.material.color.set(t.color); requestRender(); }
    else if (act === 'tremove') { removeTraj(t); focusAfterList(); }
    else if (act === 'treopen') { const file = t.file; removeTraj(t); enqueue([file], 'cloud'); focusAfterList(); }
  }
}
$('fileList').addEventListener('change', onListEvent);
$('fileList').addEventListener('input', e => { if (e.target.dataset.act === 'color') onListEvent(e); });
$('fileList').addEventListener('click', e => { const a = e.target.dataset.act; if (a === 'select' || a === 'remove' || a === 'reopen') onListEvent(e); if (a === 'select') $('infoBox').open = true; });
$('trajList').addEventListener('change', onListEvent);
$('trajList').addEventListener('input', e => { if (e.target.dataset.act === 'tcolor') onListEvent(e); });
$('trajList').addEventListener('click', e => { const a = e.target.dataset.act; if (a === 'tremove' || a === 'treopen') onListEvent(e); });
// すべて閉じる（1 つずつ閉じると、そのたびに全体の計算をやり直すので遅い）
$('btnCloseAll').addEventListener('click', () => {
  // 順番待ちのファイルも開かない。読み込み中のものは届いたら捨てる（R5-004）
  const skipped = queue.length; queue.length = 0;
  if (S.loadingFile) S.loadingFile.cancelled = true;
  if (skipped || S.loadingFile) loadBatch.total = Math.max(0, loadBatch.total - skipped - (S.loadingFile ? 1 : 0)); // 中断した読み込み中の 1 個も数えない（R11-005）
  for (const f of [...S.files]) removeFile(f, false);
  for (const t of [...S.trajs]) removeTraj(t, false);
  afterRemove(); updateTrajMove();
  status('すべて閉じました');
  $('btnOpen').focus({ preventScroll: true });
});

// ------------------------------------------------------------------ 視点
function clippedFit() {
  // 切り出し・断面の中に残る点（標本）の範囲。外れた点 0.5% ずつは除く
  const cmn = shared.uClipMin.value.toArray(), cmx = shared.uClipMax.value.toArray();
  if (cmn.every(v => v <= -1e8) && cmx.every(v => v >= 1e8)) return null;
  const axes3 = [[], [], []];
  for (const s of S.worldSample || []) {
    for (let i = 0; i < s.length; i += 3) {
      const x = s[i], y = s[i + 1], z = s[i + 2];
      if (x < cmn[0] || x > cmx[0] || y < cmn[1] || y > cmx[1] || z < cmn[2] || z > cmx[2]) continue;
      axes3[0].push(x); axes3[1].push(y); axes3[2].push(z);
    }
  }
  if (axes3[0].length < 30) return null;
  axes3.forEach(a => a.sort((p, q) => p - q));
  return { min: axes3.map(a => percentile(a, 0.005)), max: axes3.map(a => percentile(a, 0.995)) };
}
function visibleSphere() {
  const src = clippedFit() || S.fit || S.bounds;
  const mn = src.min.slice(), mx = src.max.slice();
  const cmn = shared.uClipMin.value, cmx = shared.uClipMax.value;
  for (let k = 0; k < 3; k++) { mn[k] = Math.max(mn[k], cmn.getComponent(k)); mx[k] = Math.min(mx[k], cmx.getComponent(k)); if (mn[k] > mx[k]) mn[k] = mx[k] = (mn[k] + mx[k]) / 2; }
  const c = new THREE.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
  const r = Math.max(0.5, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2);
  return { c, r };
}
const VIEW_DIRS = {
  top: [0, -1e-4, 1], front: [-1, 0, 0], side: [0, -1, 0], iso: [-1, -1.2, 1.1],
};
// 点群がなく軌跡だけのとき: 見えている軌跡の範囲
function trajSphere() {
  const ts = S.trajs.filter(t => t.visible).length ? S.trajs.filter(t => t.visible) : S.trajs;
  if (!ts.length) return null;
  world.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (const t of ts) for (let i = 0; i < t.P.length; i += 3) if (Number.isFinite(t.P[i] + t.P[i + 1] + t.P[i + 2])) box.expandByPoint(v.set(t.P[i], t.P[i + 1], t.P[i + 2]).applyMatrix4(world.matrixWorld)); // NaN の姿勢は範囲に入れない（R12-001）
  if (box.isEmpty()) return null;
  const c = box.getCenter(new THREE.Vector3());
  return { c, r: Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2) };
}
function setView(kind, animate = true) {
  if (!S.files.length && !S.trajs.length) return;
  const d = VIEW_DIRS[kind] ? new THREE.Vector3(...VIEW_DIRS[kind]) : cam.position.clone().sub(controls.target);
  setViewDir(d, animate);
}
function setViewDir(dir, animate = true) {
  const { c, r } = (!S.files.length && trajSphere()) || visibleSphere();
  if (![c.x, c.y, c.z, r].every(Number.isFinite)) return; // 範囲が壊れていたら視点を変えない（R12-001）
  dir = dir.clone().normalize();
  if (!Number.isFinite(dir.x + dir.y + dir.z) || dir.lengthSq() < 0.5) dir.set(...VIEW_DIRS.iso).normalize(); // 今の視点が NaN のとき「全体」は斜めから
  if (Math.abs(dir.z) > 0.9999) dir.set(0, dir.z > 0 ? -1e-4 : 1e-4, Math.sign(dir.z)).normalize(); // 真上・真下は少しずらす
  const dist = r / Math.sin(persp.fov * Math.PI / 360) * 1.02;
  const pos = c.clone().addScaledVector(dir, dist);
  animateCamera({ target: c, persp: pos, ortho: pos.clone(), orthoH: 2 * r * 1.05 }, animate ? 420 : 0);
}

// ------------------------------------------------------------------ 視点をなめらかに動かす
let anim = null;
function animateCamera(to, ms = 380) {
  let from = { target: controls.target.clone(), persp: persp.position.clone(), ortho: ortho.position.clone(), orthoH: (ortho.top - ortho.bottom) / ortho.zoom };
  // 今のカメラが NaN・Inf（壊れた姿勢などで）なら補間せず行き先へ直接（R12-001）
  const ok = p => p && Number.isFinite(p.x + p.y + p.z);
  if (!ok(from.target) || !ok(from.persp) || !ok(from.ortho) || !Number.isFinite(from.orthoH)) { from = { ...to, orthoH: to.orthoH || 1 }; ms = 0; }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) ms = 0;
  anim = { from, to, t0: performance.now(), ms };
  if (!ms) stepAnim(performance.now());
  requestRender();
}
function stepAnim(now) {
  if (!anim) return;
  const { from, to } = anim;
  const k = anim.ms ? Math.min(1, Math.max(0, (now - anim.t0) / anim.ms)) : 1;
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const tgt = from.target.clone().lerp(to.target, e);
  for (const [c, key] of [[persp, 'persp'], [ortho, 'ortho']]) {
    // 向きと距離を別々に補間する（位置をそのまま補間すると、途中で中心に近づきすぎる）
    const d0 = from[key].clone().sub(from.target), d1 = to[key].clone().sub(to.target);
    const l0 = d0.length(), l1 = d1.length();
    const dir = d0.normalize().lerp(d1.normalize(), e);
    if (dir.lengthSq() < 1e-8) dir.copy(d1);
    c.position.copy(tgt).addScaledVector(dir.normalize(), l0 + (l1 - l0) * e);
  }
  if (to.orthoH) { setOrthoHeight(from.orthoH + (to.orthoH - from.orthoH) * e); ortho.zoom = 1; ortho.updateProjectionMatrix(); }
  controls.target.copy(tgt);
  controls.update();
  if (k >= 1) anim = null;
  requestRender();
}
controls.addEventListener('start', () => { anim = null; hideNavHint(); });
// 中心の位置だけを動かす（向きと距離はそのまま）
function moveCenterTo(p, animate = true) {
  const d = p.clone().sub(controls.target);
  animateCamera({ target: p.clone(), persp: persp.position.clone().add(d), ortho: ortho.position.clone().add(d) }, animate ? 380 : 0);
}

// ------------------------------------------------------------------ 回転の中心の印
const pivotEl = $('pivot');
function pxToWorld(p) {
  const h = Math.max(1, stage.clientHeight);
  return cam === persp ? 2 * Math.tan(persp.fov * Math.PI / 360) * cam.position.distanceTo(p) / h : (ortho.top - ortho.bottom) / ortho.zoom / h;
}
function floorLevel() { return S.fit ? S.fit.min[2] : 0; }
function updatePivot() {
  const show = S.files.length > 0 && $('showPivot').checked;
  pivotEl.hidden = !show;
  pivotDrop.visible = pivotRing.visible = show;
  axes.visible = S.files.length > 0 && $('showAxes').checked;
  if (!show) { handlesEl.style.display = 'none'; return; }
  const p = S.drag ? S.drag.pos : controls.target;
  cam.updateMatrixWorld();
  const scr = p.clone().project(cam);
  const w = stage.clientWidth, h = stage.clientHeight;
  pivotEl.style.visibility = (scr.z > -1 && scr.z < 1) ? '' : 'hidden';
  pivotEl.style.transform = `translate(${((scr.x + 1) / 2 * w).toFixed(1)}px, ${((1 - scr.y) / 2 * h).toFixed(1)}px)`;
  // 丸は地図に固定した大きさで描く（近づくと大きく、離れると小さく見える）。見えなくなったり画面を覆ったりしないよう上下限をつける
  const dpx = Math.min(240, Math.max(10, (S.pivotWorld || 1) / pxToWorld(p)));
  S.pivotPx = dpx;
  Object.assign(pivotEl.style, { width: `${dpx}px`, height: `${dpx}px`, margin: `${-dpx / 2}px 0 0 ${-dpx / 2}px`, borderWidth: `${Math.max(1.5, Math.min(4, dpx * 0.06))}px` });
  const dot = Math.max(3, Math.min(12, dpx * 0.18));
  Object.assign(pivotEl.querySelector('.pdot').style, { width: `${dot}px`, height: `${dot}px` });
  const fz = Math.min(floorLevel(), p.z);
  const a = pivotDrop.geometry.attributes.position;
  a.setXYZ(0, p.x, p.y, p.z); a.setXYZ(1, p.x, p.y, fz); a.needsUpdate = true;
  pivotDrop.geometry.computeBoundingSphere();
  pivotRing.position.set(p.x, p.y, fz); pivotRing.scale.setScalar((S.pivotWorld || 1) * 0.5);
  const col = css('--accent');
  pivotDrop.material.color.set(col); pivotRing.material.color.set(col);
  $('pivotTip').textContent = !S.drag ? '' : S.drag.axis != null
    ? `${'xyz'[S.drag.axis]} 方向に ${S.drag.delta >= 0 ? '+' : ''}${fmt(S.drag.delta)} m`
    : S.drag.moved ? (() => { const d = dispShift(); return `x ${fmt(p.x + d[0])}  y ${fmt(p.y + d[1])}  z ${fmt(p.z + d[2])}`; })() : '点の上へドラッグ';
  updateHandles(p, scr, w, h);
}
function rayAt(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  cam.updateMatrixWorld();
  raycaster.setFromCamera(ndc, cam);
  return raycaster.ray;
}
function clampToBounds(q) {
  // 点群から遠く離れすぎないようにする
  const b = S.bounds, m = 0.2;
  for (let k = 0; k < 3; k++) {
    const span = b.max[k] - b.min[k];
    q.setComponent(k, Math.min(b.max[k] + span * m, Math.max(b.min[k] - span * m, q.getComponent(k))));
  }
  return q;
}
function startDrag(el, e, extra) {
  if (e.button !== 0) return false;
  e.preventDefault(); e.stopPropagation();
  el.setPointerCapture(e.pointerId);
  anim = null;
  S.drag = { pos: controls.target.clone(), start: controls.target.clone(), moved: false, ...extra };
  hideNavHint();
  bumpInteract(); // 印をドラッグしている間も間引いて描く
  requestRender();
  return true;
}
function endDrag() {
  if (!S.drag) return;
  const { pos, moved } = S.drag;
  S.drag = null;
  pivotEl.classList.remove('drag');
  document.querySelectorAll('.handles g').forEach(g => g.classList.remove('drag'));
  if (moved) { moveCenterTo(pos); const d = dispShift(); status(`回転の中心を（${fmt(pos.x + d[0])}, ${fmt(pos.y + d[1])}, ${fmt(pos.z + d[2])}）に動かしました`); } // 吹き出しと同じ座標の基準で（R3-003）
  requestRender();
}

// 案 4: 印をつかんで点の上を滑らせる（カーソルの下にある点に吸い付く。点のない所では止まる）
let snapBusy = false, snapNext = null;
async function snapTo(x, y) {
  if (snapBusy) { snapNext = [x, y]; return; }
  snapBusy = true;
  try {
    const hit = await pickAt(x, y, true);
    if (hit && S.drag && S.drag.axis == null) { S.drag.pos.copy(hit.world); S.drag.moved = true; requestRender(); }
  } finally {
    snapBusy = false;
    if (snapNext && S.drag) { const [nx, ny] = snapNext; snapNext = null; snapTo(nx, ny); }
  }
}
pivotEl.addEventListener('pointerdown', e => { if (startDrag(pivotEl, e, {})) pivotEl.classList.add('drag'); });
pivotEl.addEventListener('pointermove', e => { if (S.drag && S.drag.axis == null) snapTo(e.clientX, e.clientY); });
pivotEl.addEventListener('pointerup', endDrag);
pivotEl.addEventListener('pointercancel', endDrag);
pivotEl.addEventListener('wheel', e => { renderer.domElement.dispatchEvent(new WheelEvent('wheel', e)); e.preventDefault(); }, { passive: false });

// 案 5: 軸の矢印をつかんで、その軸の方向にだけ動かす
const AXIS_COLORS = ['#e5534b', '#46a758', '#4f8fe0'];
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const handlesEl = $('handles');
const SVGNS = 'http://www.w3.org/2000/svg';
const handleEls = AXES.map((_, k) => {
  const g = document.createElementNS(SVGNS, 'g');
  g.dataset.axis = k;
  g.style.setProperty('--c', AXIS_COLORS[k]);
  g.innerHTML = `<line class="hit"/><line class="shaft"/><polygon class="head"/><text class="lbl">${'xyz'[k]}</text>`;
  handlesEl.appendChild(g);
  g.addEventListener('pointerdown', e => {
    if (!startDrag(g, e, { axis: k, delta: 0 })) return;
    g.classList.add('drag');
    S.drag.s0 = axisParam(e.clientX, e.clientY, S.drag.start, AXES[k]);
  });
  g.addEventListener('pointermove', e => {
    if (!S.drag || S.drag.axis !== k) return;
    const sv = axisParam(e.clientX, e.clientY, S.drag.start, AXES[k]);
    if (sv == null || S.drag.s0 == null) return;
    const q = clampToBounds(S.drag.start.clone().addScaledVector(AXES[k], sv - S.drag.s0));
    S.drag.delta = q.getComponent(k) - S.drag.start.getComponent(k);
    S.drag.pos.copy(q); S.drag.moved = true;
    requestRender();
  });
  g.addEventListener('pointerup', endDrag);
  g.addEventListener('pointercancel', endDrag);
  return g;
});
// マウスの視線と軸の直線がいちばん近づく、軸の上の位置
function axisParam(x, y, p0, a) {
  const ray = rayAt(x, y), d = ray.direction, w0 = p0.clone().sub(ray.origin);
  const A = a.dot(a), B = a.dot(d), C = d.dot(d), D = a.dot(w0), E = d.dot(w0);
  const den = A * C - B * B;
  if (den < 1e-4) return null; // 軸がほぼ視線の向き
  return (B * E - C * D) / den;
}
function updateHandles(p, scr, w, h) {
  const show = S.files.length > 0 && $('showPivot').checked && $('showArrows').checked && scr.z > -1 && scr.z < 1;
  handlesEl.style.display = show ? '' : 'none';
  if (!show) return;
  const cx = (scr.x + 1) / 2 * w, cy = (1 - scr.y) / 2 * h;
  const rpx = (S.pivotPx || 34) / 2;
  const len = pxToWorld(p) * (rpx + 82); // 矢印は丸の外側に 82 px 出す
  AXES.forEach((a, k) => {
    const g = handleEls[k];
    const t = p.clone().addScaledVector(a, len).project(cam);
    let tx = (t.x + 1) / 2 * w, ty = (1 - t.y) / 2 * h;
    let dx = tx - cx, dy = ty - cy;
    const L = Math.hypot(dx, dy);
    // 軸が画面の奥に向いていて短く見えるときは、つかみにくいので隠す
    g.style.display = L < rpx + 18 || t.z < -1 || t.z > 1 ? 'none' : '';
    if (L < rpx + 18) return;
    dx /= L; dy /= L;
    const sx = cx + dx * (rpx + 3), sy = cy + dy * (rpx + 3); // 中心の丸の外から出す
    const hx = tx - dx * 12, hy = ty - dy * 12;
    const set = (el, attrs) => { for (const [kk, v] of Object.entries(attrs)) el.setAttribute(kk, v.toFixed ? v.toFixed(1) : v); };
    set(g.querySelector('.hit'), { x1: sx, y1: sy, x2: tx, y2: ty });
    set(g.querySelector('.shaft'), { x1: sx, y1: sy, x2: hx, y2: hy });
    g.querySelector('.head').setAttribute('points', [[tx, ty], [hx - dy * 6, hy + dx * 6], [hx + dy * 6, hy - dx * 6]].map(q => q.map(v => v.toFixed(1)).join(',')).join(' '));
    set(g.querySelector('.lbl'), { x: tx + dx * 11, y: ty + dy * 11 });
  });
}

// 案 2: 軌跡に沿って動かす（スライダーの位置 = 走り始めからの距離）
function trajForMove() { return S.trajs.find(t => t.visible) || S.trajs[0]; }
function trajPointAt(t, L) {
  const c = t.cum, P = t.P;
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= L) lo = m; else hi = m; }
  const f = c[hi] > c[lo] ? (L - c[lo]) / (c[hi] - c[lo]) : 0;
  const v = new THREE.Vector3(
    P[3 * lo] + (P[3 * hi] - P[3 * lo]) * f, P[3 * lo + 1] + (P[3 * hi + 1] - P[3 * lo + 1]) * f, P[3 * lo + 2] + (P[3 * hi + 2] - P[3 * lo + 2]) * f);
  world.updateMatrixWorld(true);
  return v.applyMatrix4(world.matrixWorld);
}
function updateTrajMove() {
  const t = trajForMove();
  $('trajMoveRow').hidden = !t;
  $('trajMoveHint').hidden = !!t;
  if (!t) return;
  $('trajPosVal').textContent = `${fmt(+$('trajPos').value / 1000 * t.length, 1)} m`;
}
$('trajPos').addEventListener('input', e => {
  const t = trajForMove();
  if (!t) return;
  const L = +e.target.value / 1000 * t.length;
  moveCenterTo(trajPointAt(t, L), false);
  updateTrajMove();
  hideNavHint();
});
$('showArrows').addEventListener('change', requestRender);

// ------------------------------------------------------------------ 下のドックから開く設定（ひとつずつ浮かべて出す）
const pop = $('pop');
const popStackEl = $('popStack');
let popName = null;
// 開いたカードは重ねて持っておく。上のカードを閉じると、下に隠れていたカードがまた出てくる
let popStack = [];
const popTabs = new Map();
const POP_STEP = 30;   // 下のカードの見出しをのぞかせる高さ
const POP_TITLES = { open: 'ファイル', view: '表示', color: '色', display: '表示', section: '断面・切り出し', level: '水平補正', measure: '距離', info: '座標' };
let lastBelowCount = 0;
let lastTop = null;
function renderPop() {
  popName = popStack[popStack.length - 1] || null;
  pop.hidden = !popName;
  pop.dataset.name = popName || '';
  if (popName) {
    $('popTitle').textContent = POP_TITLES[popName] || '設定';
    pop.querySelectorAll('[data-pop]').forEach(el => {
      const on = el.dataset.pop.split(' ').includes(popName);
      el.classList.toggle('show', on);
      if (on && el.tagName === 'DETAILS' && !el.dataset.collapsed) el.open = true;
    });
    // ひとつだけの設定なら、見出しが重ならないよう中の見出しを隠す
    pop.classList.toggle('single', pop.querySelectorAll('details.show').length === 1 && !pop.querySelector('section.show') && !pop.querySelector('.filesbox.show'));
    pop.scrollTop = 0;
  }
  // 下に重なっているカードは見出しだけ見せる。押すと手前に出てくる
  // 見出しは作り直さずに使い回し、位置だけ変えて（CSS で）滑らせる
  const below = popStack.slice(0, -1);
  for (const [n, t] of popTabs) if (!below.includes(n)) { t.remove(); popTabs.delete(n); }
  below.forEach((n, i) => {
    let t = popTabs.get(n);
    if (!t) {
      t = document.createElement('button');
      t.type = 'button'; t.className = 'ptab enter'; t.dataset.name = n;
      t.textContent = POP_TITLES[n];
      t.addEventListener('click', () => bringPop(n));
      t.style.top = (14 + i * POP_STEP) + 'px';
      popStackEl.append(t);
      popTabs.set(n, t);
      requestAnimationFrame(() => requestAnimationFrame(() => t.classList.remove('enter')));
    }
    t.style.top = (14 + i * POP_STEP) + 'px';
    t.style.zIndex = String(i);
  });
  // 手前のカードを閉じたときは、奥のカードがその場で前に出てくるだけにする（残りのカードを滑らせない）
  // 間のカードを閉じたときは、上のカードを滑らせる（開くときと同じ動き）
  const shrink = below.length < lastBelowCount && lastTop != null && !popStack.includes(lastTop);
  lastBelowCount = below.length; lastTop = popName;
  if (shrink) { pop.style.transition = 'none'; for (const t of popTabs.values()) t.style.transition = 'none'; }
  pop.style.top = (14 + below.length * POP_STEP) + 'px';
  if (shrink) requestAnimationFrame(() => requestAnimationFrame(() => { pop.style.transition = ''; for (const t of popTabs.values()) t.style.transition = ''; }));
  pop.style.maxHeight = `calc(100% - ${110 + below.length * POP_STEP}px)`;
  document.querySelectorAll('[data-open]').forEach(b => {
    b.classList.toggle('open', popStack.includes(b.dataset.open));
    b.setAttribute('aria-expanded', String(b.dataset.open === popName));
  });
  syncTools();
}
// カードを出したら、フォーカスをカードの見出しに移す（Tab ですぐ中の部品へ進める）
function focusPop() { if (popName) $('popTitle').focus({ preventScroll: true }); }
// 開けるカードは常に 1 枚。別のカードを開くと、それまでのカードは閉じ、そのメニューのボタンも解除される
function bringPop(name) {
  popStack = [name];
  renderPop();
  focusPop();
}
function removePop(name) { popStack = popStack.filter(n => n !== name); renderPop(); }
// ドックのボタン: 開いているなら（重なりのどこにあっても）閉じる、開いていなければ一番上に出す
function openPop(name) { if (popStack.includes(name)) removePop(name); else bringPop(name); }
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openPop(b.dataset.open)));
// 視点のカード: 基本／詳細のタブ（色・断面のカードと同じ）
for (const [tab, pane] of [['tabViewBasic', 'viewBasic'], ['tabViewDetail', 'viewMore']]) {
  $(tab).addEventListener('click', () => {
    for (const [t, p] of [['tabViewBasic', 'viewBasic'], ['tabViewDetail', 'viewMore']]) { const on = t === tab; $(t).setAttribute('aria-selected', String(on)); $(p).hidden = !on; }
  });
}
// 距離のカードを閉じたら、距離のボタンも切る。閉じたあとは、下に残ったカードか、そのカードを開いたドックのボタンへフォーカスを戻す
function closePop() {
  const name = popName;
  if (name) removePop(name);
  if (!name) return;
  if (popName) focusPop();
  else { const b = document.querySelector(`[data-open="${name}"]`) || document.querySelector(`[data-tool="${name}"]`); if (b) b.focus({ preventScroll: true }); }
}
$('popClose').addEventListener('click', closePop);

// ------------------------------------------------------------------ 操作の案内
let navHintTimer = null;
function showNavHint() {
  $('navHint').hidden = false;
  clearTimeout(navHintTimer);
  navHintTimer = setTimeout(hideNavHint, 15000);
}
function hideNavHint() { $('navHint').hidden = true; }

function setOrthoHeight(h) {
  const a = stage.clientWidth / Math.max(1, stage.clientHeight);
  ortho.top = h / 2; ortho.bottom = -h / 2; ortho.left = -h / 2 * a; ortho.right = h / 2 * a;
  ortho.updateProjectionMatrix();
}
function toggleProjection() {
  const dist = cam.position.distanceTo(controls.target);
  const tanH = Math.tan(persp.fov * Math.PI / 360);
  if (cam === persp) {
    ortho.position.copy(persp.position); ortho.zoom = 1;
    setOrthoHeight(2 * dist * tanH);
    cam = ortho;
  } else {
    const h = (ortho.top - ortho.bottom) / ortho.zoom;
    const dir = ortho.position.clone().sub(controls.target).normalize();
    persp.position.copy(controls.target).addScaledVector(dir, h / 2 / tanH);
    cam = persp;
  }
  controls.object = cam;
  controls.update();
  $('btnProj').textContent = cam === persp ? '透視' : '平行';
  $('btnProj').classList.toggle('on', cam === ortho);
  updateStatus();
  requestRender();
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('btnProj').addEventListener('click', toggleProjection);

// ------------------------------------------------------------------ クリックで点を選ぶ
const raycaster = new THREE.Raycaster();
// 画面の (x, y) から tol 画素以内に見えている軌跡の線があれば、その位置（world の外の座標）を返す（R17-005）
function trajAtScreen(clientX, clientY, tol) {
  const r = renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3();
  cam.updateMatrixWorld(); world.updateMatrixWorld(true);
  const toS = (P, i) => { v.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]).applyMatrix4(world.matrixWorld); const w = v.clone(); v.project(cam); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, ok: v.z > -1 && v.z < 1, w }; };
  let best = null;
  for (const t of S.trajs) {
    if (!t.visible || !t.group.visible) continue;
    let a = toS(t.P, 0);
    for (let i = 1; i < t.count; i++) {
      const b = toS(t.P, i);
      if (a.ok && b.ok) {
        const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
        const s = L ? Math.max(0, Math.min(1, ((clientX - a.x) * dx + (clientY - a.y) * dy) / L)) : 0;
        const dist = Math.hypot(a.x + s * dx - clientX, a.y + s * dy - clientY);
        if (dist <= tol && (!best || dist < best.dist)) best = { dist, t, world: a.w.clone().lerp(b.w, s) };
      }
      a = b;
    }
  }
  return best;
}
async function pickAt(clientX, clientY, quiet = false) {
  const vis = S.files.filter(f => f.visible);
  const tr = quiet ? null : trajAtScreen(clientX, clientY, Math.max(5, shared.uSize.value * 1.5));
  if (!vis.length) {
    // 軌跡だけのときは黙って戻らない（R17-005）
    if (!quiet && S.trajs.length) status(tr ? '座標と距離は点群の点を選びます。軌跡の位置は「軌跡に沿って動かす」で見られます' : 'その位置に点群の点がありません（座標と距離は点群の点を選びます）');
    return null;
  }
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  cam.updateMatrixWorld();
  raycaster.setFromCamera(ndc, cam);
  world.updateMatrixWorld(true);
  const inv = world.matrixWorld.clone().invert();
  const o = raycaster.ray.origin.clone().applyMatrix4(inv);
  const d = raycaster.ray.direction.clone().transformDirection(inv);
  const tolPx = Math.max(5, shared.uSize.value * 1.5);
  let tolA = 0, tolB = 0;
  if (cam === persp) tolA = tolPx * 2 * Math.tan(persp.fov * Math.PI / 360) / r.height;
  else tolB = tolPx * ((ortho.top - ortho.bottom) / ortho.zoom) / r.height;
  if (!quiet) status('点を探しています…');
  let res;
  try {
    res = await call({
      type: 'pick',
      queries: vis.map(f => ({ id: f.id, name: f.name, o: o.toArray(), d: d.toArray(), tolA, tolB, M: Array.from(world.matrixWorld.elements), scale: 1 })),
      clipMin: shared.uClipMin.value.toArray(), clipMax: shared.uClipMax.value.toArray(),
      ceil: S.hideCeil && S.ceil ? { n: S.ceil.n.toArray(), d: S.ceil.d } : null,
    });
  } catch (err) { if (!quiet) status('点を選べませんでした: ' + jaError(err.message), true); return null; }
  if (!quiet) status('');
  if (!res.hit) { if (!quiet) status('その位置に点が見つかりません'); return null; }
  const local = new THREE.Vector3(...res.hit.p);
  const file = S.files.find(f => f.id === res.hit.id);
  // 値の欄は基準値を足し戻した値にする（double の欄）
  if (file && res.hit.fields) for (const k of Object.keys(res.hit.fields)) res.hit.fields[k] += fieldBaseOf(file, k);
  const hw = local.clone().applyMatrix4(world.matrixWorld);
  // 軌跡の線は点群より手前に描かれるので、線の上をクリックすると奥の点群の点が選ばれる。離れていたら知らせる（R17-005）
  if (tr) { const dd = tr.world.distanceTo(hw); if (dd > 0.2) status(`軌跡の線の上ですが、選んだのは線から ${fmt(dd, 2)} m 離れた点群の点です（座標と距離は点群の点を選びます）`); }
  return { ...res.hit, local, world: hw, file };
}

let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
renderer.domElement.addEventListener('pointerup', async e => {
  if (!down || down.b !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down = null; return; }
  down = null;
  if (!S.tools.info && !S.tools.measure) return;
  const hit = await pickAt(e.clientX, e.clientY);
  if (!hit) return;
  if (S.tools.info) showPickInfo(hit);
  if (S.tools.measure) addMeasurePoint(hit, e.shiftKey);
});

function flashMarker(local) {
  pickMarker.geometry.attributes.position.setXYZ(0, local.x, local.y, local.z);
  pickMarker.geometry.attributes.position.needsUpdate = true;
  pickMarker.material.color.set(css('--accent'));
  pickMarker.visible = true;
  requestRender();
}
// ---- 座標: クリックした点のすぐ上に吹き出しを出す（画面の端では下・左に回り込む）
const PICK_AXIS = ['#ff8a80', '#7ee08a', '#8ab4ff'];
// 座標: クリックした点に番号付きの吹き出しを残す（距離と同じく、消すまで残る。何個でも）
S.pins = []; S.pinSel = null;
function pinValues(hit) {
  const w = hit.local.clone().applyMatrix4(world.matrixWorld), o = S.offset || [0, 0, 0], d = dispShift();
  return [0, 1, 2].map(k => (fileCoords() ? hit.local.getComponent(k) + o[k] : w.getComponent(k) + d[k]));
}
function pinHtml(p, i) {
  const v = pinValues(p.hit);
  const rows = ['x', 'y', 'z'].map((a, k) => `<b style="color:${PICK_AXIS[k]}">${a}</b><span>${fmt(v[k], 3)} m</span>`).join('');
  const sub = [`#${i + 1}`];
  if (p.hit.rgb) sub.push(`RGB ${p.hit.rgb.join(',')}`);
  sub.push(coordLabel());
  return `<div class="pc-xyz">${rows}</div><span class="pc-sub">${sub.join(' ・ ')}</span>`;
}
function showPickInfo(hit) {
  const el = document.createElement('div');
  el.className = 'pcall pin';
  el.innerHTML = '<span class="pc-dot"></span><span class="pc-stem"></span><div class="pc-box" role="status"></div>';
  $('labels').append(el); // 距離の吹き出しと同じ入れ物（前後の重なりを一緒に決める）
  const p = { hit, local: hit.local.clone(), el, fileId: hit.file ? hit.file.id : null };
  el.querySelector('.pc-box').addEventListener('click', e => { e.stopPropagation(); selectPin(p); });
  S.pins.push(p);
  S.pick = p.local; S.pickHit = hit;
  selectPin(p);
}
// 押した吹き出しを前に出す（座標・距離のどちらでも、最後に押したものがいちばん前）
let calloutZ = 10;
function bringFront(el) { el.style.zIndex = String(++calloutZ); }
function selectPin(p) { S.pinSel = p; bringFront(p.el); renderPins(); }
function renderPins() {
  S.pins.forEach((p, i) => { p.el.querySelector('.pc-box').innerHTML = pinHtml(p, i); p.el.classList.toggle('sel', p === S.pinSel); });
  const rows = S.pins.map((p, i) => {
    const v = pinValues(p.hit);
    return `<tr data-i="${i}" class="${p === S.pinSel ? 'sel' : ''}"><td><span class="mnum-s">${i + 1}</span></td>${v.map(x => `<td>${fmt(x, 3)}</td>`).join('')}<td><button type="button" class="x" data-del="${i}" aria-label="${i + 1} 番目の座標を消す">×</button></td></tr>`;
  }).join('');
  $('pinTable').hidden = !S.pins.length;
  $('pinTable').querySelector('tbody').innerHTML = rows;
  $('pinFoot').hidden = !S.pins.length;
  $('pinUnit').textContent = `単位 m ・ ${coordLabel()}`;
  $('pinHint').hidden = S.pins.length > 0;
  $('pinCount').textContent = S.pins.length ? `${S.pins.length} 個` : '';
  placePickInfo();
}
function removePin(p) {
  p.el.remove();
  S.pins = S.pins.filter(x => x !== p);
  if (S.pinSel === p) S.pinSel = S.pins[S.pins.length - 1] || null;
  if (!S.pins.length) { S.pick = null; S.pickHit = null; }
  renderPins(); requestRender();
}
// 全部消す（すべて閉じたとき・「すべて消す」）
function hidePickInfo() { for (const p of [...S.pins]) p.el.remove(); S.pins = []; S.pinSel = null; S.pick = null; S.pickHit = null; renderPins(); }
$('pinTable').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) { const p = S.pins[+del.dataset.del]; if (p) removePin(p); return; }
  const tr = e.target.closest('tr[data-i]');
  if (tr && S.pins[+tr.dataset.i]) selectPin(S.pins[+tr.dataset.i]);
});
$('btnPinClear').addEventListener('click', () => { hidePickInfo(); requestRender(); });
// 原点の印: 座標の 0,0,0 に白い丸を置く。押すと「原点」とだけ出す（もう一度押すと消える）
const originMark = document.createElement('div');
originMark.className = 'pcall origin';
originMark.innerHTML = '<button type="button" class="pc-dot" aria-label="原点"></button><span class="pc-stem" hidden></span><div class="pc-box" hidden>原点</div>';
$('labels').append(originMark);
originMark.querySelector('.pc-dot').addEventListener('click', e => { e.stopPropagation(); const bx = originMark.querySelector('.pc-box'); bx.hidden = !bx.hidden; originMark.querySelector('.pc-stem').hidden = bx.hidden; bringFront(originMark); });
function placeOrigin(w, h) {
  const has = S.files.length > 0 || S.trajs.length > 0;
  const scr = has ? axes.position.clone().project(cam) : null;
  const sx = scr ? (scr.x + 1) / 2 * w : 0, sy = scr ? (1 - scr.y) / 2 * h : 0;
  const on = has && scr.z > -1 && scr.z < 1 && sx >= 0 && sx <= w && sy >= 0 && sy <= h;
  originMark.style.visibility = on ? '' : 'hidden';
  if (on) originMark.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
}
function placePickInfo() {
  const w = stage.clientWidth, h = stage.clientHeight;
  placeOrigin(w, h);
  for (const p of S.pins) {
    const el = p.el;
    const scr = p.local.clone().applyMatrix4(world.matrixWorld).project(cam);
    const sx = (scr.x + 1) / 2 * w, sy = (1 - scr.y) / 2 * h;
    const onScreen = scr.z > -1 && scr.z < 1 && sx >= 0 && sx <= w && sy >= 0 && sy <= h;
    el.style.visibility = onScreen ? '' : 'hidden';
    if (!onScreen) continue;
    el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    const box = el.querySelector('.pc-box'), stem = el.querySelector('.pc-stem');
    const bw = box.offsetWidth, bh = box.offsetHeight, gap = 34;
    const above = sy - gap - bh > 56;                 // 上の案内とぶつかるなら下に出す
    stem.style.top = (above ? -gap : 7) + 'px';
    stem.style.height = (gap - 7) + 'px';
    box.style.top = (above ? -gap - bh : gap) + 'px';
    let left = sx + bw + 12 < w ? 0 : -bw + 1;        // 右端に入りきらないなら左に出す
    left = Math.max(left, 12 - sx);
    box.style.left = left + 'px';
  }
}

// ------------------------------------------------------------------ 距離の計測
// ---- 距離: 測っている途中はカーソルまで線を伸ばして長さを大きく出す。測った線は番号を付けて表にまとめる
const toWorld = v => v.clone().applyMatrix4(world.matrixWorld);
const toLocal = v => v.clone().applyMatrix4(world.matrixWorld.clone().invert());
// Shift を押していたら水平な距離（2 点目を 1 点目と同じ高さにそろえる）
function measureEnd(aLocal, hitLocal, horizontal) {
  if (!horizontal) return hitLocal.clone();
  const A = toWorld(aLocal), B = toWorld(hitLocal);
  B.z = A.z;
  return toLocal(B);
}
function measureNums(aLocal, bLocal) {
  const A = toWorld(aLocal), B = toWorld(bLocal), d = B.clone().sub(A);
  return { len: d.length(), hor: Math.hypot(d.x, d.y), dz: d.z };
}
const previewGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
const previewLine = new THREE.Line(previewGeo, new THREE.LineBasicMaterial({ depthTest: false, transparent: true, opacity: 0.8 }));
previewLine.renderOrder = 9; previewLine.visible = false;
overlay.add(previewLine);
function updateMeasureGuide() {
  // 上の短い案内（座標・距離を入れているときだけ）
  const g = $('mGuide');
  const parts = [];
  if (S.tools.measure) parts.push(S.mPending ? 'もう 1 点をクリック' : '2 点をクリックして距離を測る');
  if (S.tools.info) parts.push('点をクリックして座標を見る');
  g.hidden = !parts.length;
  g.textContent = parts.join(' ・ ');
  if (!S.mPending) { previewLine.visible = false; $('mLive').hidden = true; }
  requestRender();
}
let mBusy = false, mNext = null;
async function updateLive(x, y, shift) {
  if (!S.mPending || !S.tools.measure) return;
  if (mBusy) { mNext = [x, y, shift]; return; }
  mBusy = true;
  try {
    const hit = await pickAt(x, y, true);
    if (hit && S.mPending) {
      const b = measureEnd(S.mPending, hit.local, shift);
      const pa = previewGeo.attributes.position;
      pa.setXYZ(0, S.mPending.x, S.mPending.y, S.mPending.z); pa.setXYZ(1, b.x, b.y, b.z); pa.needsUpdate = true;
      previewGeo.computeBoundingSphere();
      previewLine.material.color.set(css('--accent'));
      previewLine.visible = true;
      const n = measureNums(S.mPending, b);
      const r = stage.getBoundingClientRect(), el = $('mLive');
      el.hidden = false;
      el.style.left = (x - r.left + 18) + 'px'; el.style.top = (y - r.top + 18) + 'px';
      el.innerHTML = `<span class="big">${fmt(n.len, 2)} <small>m</small></span><span class="sub">${shift ? '水平だけ' : `水平 ${fmt(n.hor, 2)} ・ 高さ ${n.dz >= 0 ? '+' : ''}${fmt(n.dz, 2)}`}</span>`;
      requestRender();
    }
  } finally {
    mBusy = false;
    if (mNext) { const [nx, ny, ns] = mNext; mNext = null; updateLive(nx, ny, ns); }
  }
}
// 1 点目のあとにカーソルについてくる仮の距離（線と数）は出さない（重く、邪魔になるため）
stage.addEventListener('pointerleave', () => { $('mLive').hidden = true; });
function cancelMeasure() { S.mPending = null; pickMarker.visible = false; updateMeasureGuide(); }

function addMeasurePoint(hit, shift = false) {
  flashMarker(hit.local);
  if (!S.mPending) { S.mPending = hit.local.clone(); S.mPendingFile = hit.file ? hit.file.id : null; updateMeasureGuide(); return; }
  const a = S.mPending, b = measureEnd(a, hit.local, shift);
  const fa = S.mPendingFile, fb = hit.file ? hit.file.id : null;
  S.mPending = null;
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const color = css('--accent');
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
  const dots = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 7, sizeAttenuation: false, depthTest: false, transparent: true, map: dotTex, alphaTest: 0.5 }));
  line.renderOrder = dots.renderOrder = 9;
  overlay.add(line, dots);
  // 距離の吹き出し（座標の吹き出しと同じ形。線の中央から細い線で出す）
  const tag = document.createElement('div');
  tag.className = 'mcall';
  $('labels').append(tag);
  const m = { a, b, line, dots, tag, files: [fa, fb] }; // どのファイルの点を測ったか（そのファイルを閉じたら消す。R7-006）
  tag.addEventListener('click', e => { e.stopPropagation(); selectMeasure(m); });
  S.measures.push(m);
  selectMeasure(m);
  pickMarker.visible = false;
  updateMeasureGuide();
}
function selectMeasure(m) {
  S.mSel = m;
  if (m && m.tag) bringFront(m.tag);
  const acc = css('--accent'), dim = css('--fg');
  for (const x of S.measures) {
    const on = x === m;
    x.line.material.color.set(on ? acc : dim); x.dots.material.color.set(on ? acc : dim);
    x.tag.classList.toggle('sel', on);
  }
  renderMeasures();
  requestRender();
}
function renderMeasures() {
  const rows = S.measures.map((m, i) => {
    const n = measureNums(m.a, m.b);
    m.tag.innerHTML = `<span class="mc-dot"></span><svg class="mc-stem" aria-hidden="true" viewBox="0 0 30 30"><line x1="0" y1="30" x2="30" y2="0"/></svg><button type="button" class="mc-box" aria-label="${i + 1} 番目の距離 ${fmt(n.len, 3)} m"><span class="mc-len">${fmt(n.len, 3)} m <small>#${i + 1}</small></span><span class="mc-sub">水平 ${fmt(n.hor, 3)} ・ 高さの差 ${n.dz >= 0 ? '+' : ''}${fmt(n.dz, 3)}</span></button>`;
    return `<tr data-i="${i}" class="${m === S.mSel ? 'sel' : ''}"><td><span class="mnum-s">${i + 1}</span></td><td class="b">${fmt(n.len, 3)}</td><td>${fmt(n.hor, 3)}</td><td>${n.dz >= 0 ? '+' : ''}${fmt(n.dz, 3)}</td><td><button type="button" class="x" data-del="${i}" aria-label="${i + 1} 番目を消す">×</button></td></tr>`;
  }).join('');
  $('measureTable').hidden = !S.measures.length;
  $('measureTable').querySelector('tbody').innerHTML = rows;
  $('measureFoot').hidden = !S.measures.length;
  $('measureHint').hidden = S.measures.length > 0;
  $('measureCount').textContent = S.measures.length ? `${S.measures.length} 本` : '';
}
function removeMeasure(m) {
  overlay.remove(m.line, m.dots); m.line.geometry.dispose(); m.tag.remove();
  S.measures = S.measures.filter(x => x !== m);
  if (S.mSel === m) S.mSel = S.measures[S.measures.length - 1] || null;
  if (S.mSel) selectMeasure(S.mSel); else renderMeasures();
  requestRender();
}
$('measureTable').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) { const m = S.measures[+del.dataset.del]; if (m) removeMeasure(m); return; }
  const tr = e.target.closest('tr[data-i]');
  if (tr && S.measures[+tr.dataset.i]) selectMeasure(S.measures[+tr.dataset.i]);
});
$('btnMeasureClear').addEventListener('click', () => {
  for (const m of [...S.measures]) removeMeasure(m);
  cancelMeasure();
  requestRender();
});
function updateLabels() {
  const w = stage.clientWidth, h = stage.clientHeight;
  for (const m of S.measures) {
    const mid = m.a.clone().add(m.b).multiplyScalar(0.5).applyMatrix4(world.matrixWorld).project(cam);
    const on = mid.z < 1 && mid.z > -1;
    const x = (mid.x + 1) / 2 * w, y = (1 - mid.y) / 2 * h;
    m.tag.style.display = on ? '' : 'none';
    m.tag.style.left = x + 'px';
    m.tag.style.top = y + 'px';
    // 画面の端では吹き出しを左・下に回り込ませる
    m.tag.classList.toggle('left', x > w - 260);
    m.tag.classList.toggle('below', y < 110);
  }
}

// 座標・距離の道具は、左上のカードと 1 対 1（カードの重なりだけで決める。ずれないように）
//   ・カードが開いていて、座標と距離のうち手前にある方の道具が入っている（同時に入るのは片方だけ）
//   ・奥にあるもう片方のカードのボタンは「開いている」見た目（ほかのメニューと同じ）。見出しを押すと手前に来て入る。ボタンを押すと閉じる
//   ・カードを閉じると道具も切れる。座標の吹き出し・測った線は、道具を切っても消さない（消すのは表の × か「すべて消す」だけ）
// ボタン・キー: ほかのメニューと同じく、カードが開いていれば（手前でも奥でも）閉じて道具を切り、開いていなければ開いて入れる
function setTool(t, on = !popStack.includes(t)) {
  if (on) bringPop(t); else removePop(t);
}
function syncTools() {
  const iInfo = popStack.lastIndexOf('info'), iMeas = popStack.lastIndexOf('measure');
  const active = iInfo < 0 && iMeas < 0 ? null : iInfo > iMeas ? 'info' : 'measure';
  const was = { ...S.tools };
  S.tools.info = active === 'info'; S.tools.measure = active === 'measure';
  for (const t of ['info', 'measure']) {
    const b = document.querySelector(`[data-tool="${t}"]`);
    b.classList.toggle('on', S.tools[t]); b.setAttribute('aria-pressed', String(S.tools[t]));
    b.classList.toggle('open', !S.tools[t] && popStack.includes(t));
  }
  if (was.measure && !S.tools.measure) { S.mPending = null; pickMarker.visible = false; previewLine.visible = false; $('mLive').hidden = true; }
  if (was.info === S.tools.info && was.measure === S.tools.measure) return;
  updateMeasureGuide();
  renderer.domElement.style.cursor = (S.tools.info || S.tools.measure) ? 'crosshair' : '';
  // 点を選んでいる間は、中心の丸や矢印がクリックを横取りしないようにする
  stage.classList.toggle('picking', !!(S.tools.info || S.tools.measure));
  updateStatus(); requestRender();
}
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

// ------------------------------------------------------------------ 水平補正
// auto: 開いたときの自動の補正。自信がなければ黙ってやめる（赤い誤りは手動のときだけ）。傾きは 20° まで
async function runLevel(auto = false) {
  const f = S.files.find(x => x.id === S.active) || S.files[0];
  if (!f) { if (!auto) status(S.trajs.length ? '補正する点群がありません（軌跡だけでは傾きを調べられません。点群を開いてから押してください）' : '補正する点群がありません', true); return; } // R12-009
  if (!auto) status(`${f.name} の床・天井・壁の向きを調べています…`);
  const gen = S.levelGen = (S.levelGen || 0) + 1;
  // 結果が届くまでに、そのファイルが閉じられた・別の補正が始まったら、結果は捨てる
  const stale = () => !S.files.includes(f) || S.levelGen !== gen;
  try {
    const r = await call({ type: 'analyze', id: f.id, maxTilt: auto ? 20 : 35 });
    if (stale()) return;
    S.levelInfo = r; S.lastLevel = r;
    applyLevel(auto);
  } catch (err) {
    if (stale()) return;
    if (auto) $('levelResult').textContent = `開いたときの自動の水平補正はしていません（${err.message}）`;
    else status('水平補正できませんでした: ' + err.message, true);
  }
}
$('btnLevel').addEventListener('click', () => runLevel(false));
// 「点群の傾きを補正する」ボタン: 補正が掛かっている間は、天井を隠すボタンと同じく色を付ける
function syncLevelBtn() { const on = !!S.levelInfo, b = $('btnLevel'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
function applyLevel(auto = false, keepView = false) {
  syncLevelBtn();
  const r = S.levelInfo;
  const M = levelMatrix(r);
  if (r) {
    $('levelResult').textContent = [
      r.flipped ? `上下が逆なので反転（傾き ${fmt(r.tiltDeg)}° を補正）` : `傾き ${fmt(r.tiltDeg)}° を補正`,
      $('alignCorr').checked ? `廊下の向きに合わせて ${fmt(r.yawDeg, 1)}° 回転` : '向きはそのまま',
      r.floorZ != null ? `床の高さ ${fmt(r.floorZ, 3)} m${$('floorZero').checked ? ' → 0 m' : ''}` : '床は見つかりませんでした',
      (S.offset && S.offset.some(v => v)) ? `座標: 地図座標の近くを中心に回した値${$('floorZero').checked && r.floorZ != null ? '（z は床からの高さ）' : ''}`
        : $('floorZero').checked && r.floorZ != null ? '座標の原点: 元のファイルの原点の真下の床（z は床からの高さ）' : '座標の原点: 元のファイルと同じ',
    ].join('\n');
  } else {
    $('levelResult').textContent = '';
  }
  world.matrix.copy(M);
  world.updateMatrixWorld(true);
  placeOriginAxes();
  // 回した後の座標では前の切り出しの箱は同じ場所を指さないので全範囲に戻す。黙って戻さず知らせる（R11-004）
  // 断面（水平・横断・縦断）も、回した後の座標では同じ面を指さないので、切り出しと同じく表示をやめて元に戻す
  const clipWas = clipD.some(d => !d.full()), secWas = $('secOn').checked;
  if (secWas) { $('secOn').checked = false; syncAxisButtons(); }
  updateBounds(true);
  renderPins(); // 出ている座標も新しい基準で出し直す
  applyColor(true);
  renderMeasures();
  if (auto || !keepView) setView('iso'); else setView('keep'); // 設定（床を 0・廊下の向き）の切り替えでは視点の向きを変えない（R7-009）
  const extra = (clipWas ? '。切り出しは全範囲に戻しました' : '') + (secWas ? '。断面の表示はやめました' : '');
  status((r ? '水平補正しました' : '水平補正を元に戻しました') + extra, false, auto); // 自動の補正では、開けなかった赤い知らせを消さない（R3-002）
}
$('btnLevelReset').addEventListener('click', () => { if (!S.levelInfo) { status('水平補正はしていません（元に戻すものがありません）'); return; } S.levelInfo = null; applyLevel(); }); // R12-009
$('alignCorr').addEventListener('change', () => { if (S.levelInfo) applyLevel(false, true); });
$('floorZero').addEventListener('change', () => { if (S.levelInfo) applyLevel(false, true); });
$('coordFile').addEventListener('change', () => { updateInfo(); renderPins(); });

// ------------------------------------------------------------------ 断面・表示の設定
$('secOn').addEventListener('change', () => { updateClip(); });
for (const id of ['secAxis', 'secPos', 'secThick']) $(id).addEventListener('input', () => { updateSection(); updateClip(); });
// 断面のカード: タブ、向きのボタン、厚さのボタン。向きや位置を変えたら断面の表示も入れる
function secTab(clip) {
  $('tabSec').setAttribute('aria-selected', String(!clip)); $('tabClip').setAttribute('aria-selected', String(clip));
  $('paneSec').hidden = clip; $('paneClip').hidden = !clip;
}
$('tabSec').addEventListener('click', () => secTab(false));
$('tabClip').addEventListener('click', () => secTab(true));
// 向きのボタンの選択 = 断面を表示しているかどうか。選んでいるボタンをもう一度押すと断面をやめる
function syncAxisButtons() {
  const on = $('secOn').checked, ax = $('secAxis').value;
  document.querySelectorAll('.axes3 [data-axis]').forEach(x => x.setAttribute('aria-checked', String(on && x.dataset.axis === ax)));
}
function secOnAuto() { if (!$('secOn').checked) { $('secOn').checked = true; syncAxisButtons(); } }
document.querySelectorAll('.axes3 [data-axis]').forEach(b => b.addEventListener('click', () => {
  if ($('secOn').checked && $('secAxis').value === b.dataset.axis) { $('secOn').checked = false; }
  else { $('secAxis').value = b.dataset.axis; $('secOn').checked = true; }
  syncAxisButtons(); updateSection(); updateClip();
}));
document.querySelectorAll('.chips [data-thick]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.chips [data-thick]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  $('secThick').value = b.dataset.thick;
  updateSection(); updateClip();
}));
$('secPos').addEventListener('input', () => { if (!$('secOn').checked) { secOnAuto(); updateClip(); } });
function toggleCeil() {
  if (!S.ceil && S.files.length) { status('この点群には天井が見つかりません（高さの分布に天井らしい山がありません）'); return; }
  S.hideCeil = !S.hideCeil;
  // 点群を開く前でも入・切を選べる（開いたときに天井が見つかれば、その設定で隠す）
  if (!S.files.length) { updateClip(); status(S.hideCeil ? '点群を開いたときに天井を隠します' : '点群を開いたときに天井を隠しません'); return; }
  updateClip();
  if (S.colorMode === 'height') applyColor(true);
  status(S.hideCeil ? `天井（${S.levelInfo ? '水平補正後の' : ''}高さ ${fmt(S.ceilZ + disp(2))} m より上）を隠しました` : '天井を表示しています');
}
$('btnCeil').addEventListener('click', toggleCeil);
$('btnClipReset').addEventListener('click', () => { clipD.forEach(d => d.set(-Infinity, Infinity)); updateClip(); });
const sizeState = { px: 2, m: 4 }; // m は cm
function applySize() {
  const mode = $('sizeMode').value, el = $('pointSize');
  if (mode === 'px') {
    Object.assign(el, { min: 1, max: 12, step: 0.5 }); el.value = sizeState.px;
    shared.uWorldSize.value = 0; shared.uSize.value = sizeState.px;
    $('pointSizeVal').textContent = `${sizeState.px} px`;
  } else {
    Object.assign(el, { min: 0.5, max: 30, step: 0.5 }); el.value = sizeState.m;
    shared.uWorldSize.value = sizeState.m / 100;
    $('pointSizeVal').textContent = `${sizeState.m} cm`;
  }
  requestRender();
}
$('pointSize').addEventListener('input', e => { sizeState[$('sizeMode').value] = +e.target.value; applySize(); });
$('sizeMode').addEventListener('change', applySize);
$('mapMode').addEventListener('change', e => { shared.uMapMode.value = +e.target.value; applyColor(false); });
$('bandSel').addEventListener('input', e => { shared.uBand.value = +e.target.value; $('bandVal').textContent = (+e.target.value).toFixed(2) + (S.colorMode === 'height' ? ' m' : ''); drawLegend(); requestRender(); });
$('showPivot').addEventListener('change', requestRender);
$('lodSel').addEventListener('change', applyLod);
$('showAxes').addEventListener('change', e => { axes.visible = e.target.checked; requestRender(); });
$('showTraj').addEventListener('change', e => { for (const t of S.trajs) t.group.visible = t.visible && e.target.checked; requestRender(); });
$('colorMode').addEventListener('change', () => applyColor(true));
$('fieldSel').addEventListener('change', () => applyColor(true));
$('cmapSel').addEventListener('change', e => { S.cmap = e.target.value; shared.uCmap.value = cmapTexture(S.cmap); drawLegend(); requestRender(); });
$('btnAutoRange').addEventListener('click', () => applyColor(true));

// 色のカード: 短い名前のボタンで選ぶ（中身は隠した select に入れて、今までの処理をそのまま使う）
function syncSegs() {
  document.querySelectorAll('[data-for]').forEach(b => b.setAttribute('aria-checked', String($(b.dataset.for).value === b.dataset.val)));
}
document.querySelectorAll('[data-for]').forEach(b => b.addEventListener('click', () => {
  const sel = $(b.dataset.for);
  if (sel.value === b.dataset.val) return;
  sel.value = b.dataset.val;
  sel.dispatchEvent(new Event('change'));
  syncSegs();
}));
document.querySelectorAll('.cmaps [data-val]').forEach(b => { b.style.background = cssGradient(b.dataset.val); });
function colorTab(detail) {
  $('tabColorBasic').setAttribute('aria-selected', String(!detail)); $('tabColorDetail').setAttribute('aria-selected', String(detail));
  $('colorBasic').hidden = detail; $('colorDetail').hidden = !detail;
}
$('tabColorBasic').addEventListener('click', () => colorTab(false));
$('tabColorDetail').addEventListener('click', () => colorTab(true));
syncSegs();

// ------------------------------------------------------------------ 情報とヒストグラム
// ---- 画面に出す座標の基準
//   描いている座標（world: 水平補正で回した座標）に dispShift() を足したものを画面に出す
//   ・水平補正なし … 元のファイルの座標（グローバルシフトを足し戻す）
//   ・水平補正あり … 原点 = 元のファイルの原点の真下の床（z は床からの高さ。「床を z = 0」を切ると回しただけの高さ）
//   どの数字（座標・範囲・断面・切り出し・色の目盛り）も同じ基準で出す
function dispShift() {
  const o = S.offset || [0, 0, 0];
  if (!S.levelInfo) return [o[0], o[1], o[2]];
  const floor0 = $('floorZero').checked && S.levelInfo.floorZ != null;
  // 地図座標（UTM など大きな座標）は、遠い原点のまわりに回すと意味のない数になるので、地図の近く（シフトの点）を中心に回した値を出す
  if (o.some(v => v)) return [o[0], o[1], floor0 ? 0 : o[2]];
  const e = world.matrix.elements;
  const v = [e[0] * o[0] + e[4] * o[1] + e[8] * o[2], e[1] * o[0] + e[5] * o[1] + e[9] * o[2], e[2] * o[0] + e[6] * o[1] + e[10] * o[2]];
  if (floor0) v[2] = 0;
  return v;
}
function disp(k) { return dispShift()[k]; }
function fileCoords() { return !S.levelInfo || $('coordFile').checked; } // 座標を元のファイルの座標で出すか
function coordLabel() { return fileCoords() ? '補正前の座標' : '補正後の座標'; }
// 原点の印（座標軸）を、画面に出す座標の原点に置く
function placeOriginAxes() { const d = dispShift(); axes.position.set(-d[0], -d[1], -d[2]); requestRender(); }
function updateInfo() {
  const f = S.files.find(x => x.id === S.active);
  if (!f) { $('info').innerHTML = ''; return; }
  const b = S.bounds;
  $('info').innerHTML = `<dl>
    <dt>ファイル</dt><dd>${escapeHtml(f.name)}</dd>
    <dt>点数</dt><dd>${f.sampled ? `${fmtN(f.total)}（うち ${fmtN(f.n)} 点を表示）` : fmtN(f.n)}${f.skipped ? `（除外 ${fmtN(f.skipped)}）` : ''}</dd>
    <dt>形式</dt><dd>${escapeHtml(f.header.data)}${f.header.note ? `<br><span class="muted">${escapeHtml(f.header.note)}</span>` : ''}</dd>
    <dt>項目</dt><dd>${escapeHtml(f.header.fields.join(' '))}</dd>
    ${S.offset && S.offset.some(v => v) ? `<dt>シフト</dt><dd>${S.offset.map(v => fmt(v, 0)).join(', ')}（ファイルの座標を出すときは足し戻しています）</dd>` : ''}
    <dt>大きさ</dt><dd>${(f.size / 1048576).toFixed(1)} MB</dd>
    <dt>点の間隔</dt><dd>${f.spacing ? `${fmt(f.spacing * 100, 1)} cm（中央値）` : f.spacing === undefined ? '計算中…' : `—（${escapeHtml(f.spacingReason || '求められません')}）`}</dd>
    ${[0, 1, 2].map(k => { const bt = S.boundsTrue || b, lo = fileCoords() ? S.boundsFile.min[k] : bt.min[k] + disp(k), hi = fileCoords() ? S.boundsFile.max[k] : bt.max[k] + disp(k); return `<dt>範囲 ${'xyz'[k]}</dt><dd>${fmt(lo)} 〜 ${fmt(hi)}（${fmt(hi - lo)} m）</dd>`; }).join('')}
  </dl><p class="hint">範囲は表示中のファイル全体（${coordLabel()}）。下のグラフは高さの分布。</p>`;
}
function drawHist() {
  const cv = $('hist'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const z = S.zSample;
  if (!z || !z.length) return;
  const lo = percentile(z, 0.001), hi = percentile(z, 0.999);
  const nb = 80, h = new Float64Array(nb);
  for (const v of z) { const b = Math.floor((v - lo) / ((hi - lo) || 1) * nb); if (b >= 0 && b < nb) h[b]++; }
  const mx = Math.max(...h);
  const [cz0, cz1] = [shared.uClipMin.value.z, shared.uClipMax.value.z];
  const bw = W / nb;
  for (let b = 0; b < nb; b++) {
    const zc = lo + (b + 0.5) / nb * (hi - lo);
    ctx.fillStyle = zc >= cz0 && zc <= cz1 ? css('--accent') : css('--line');
    const bh = (H - 22) * h[b] / mx;
    ctx.fillRect(b * bw + 1, H - 18 - bh, bw - 2, bh);
  }
  ctx.fillStyle = css('--muted');
  ctx.font = `20px ${css('--mono')}`;
  ctx.textBaseline = 'bottom';
  const dz = disp(2); // 目盛りはほかの数と同じ座標の基準で（R3-003）
  ctx.textAlign = 'left'; ctx.fillText(`${fmt(lo + dz)} m`, 0, H);
  ctx.textAlign = 'right'; ctx.fillText(`${fmt(hi + dz)} m`, W, H);
  ctx.textAlign = 'center'; ctx.fillText('高さ z', W / 2, H);
}

// ------------------------------------------------------------------ 状態の表示
function updateStatus(ratio = 1) {
  const vis = S.files.filter(f => f.visible);
  const total = vis.reduce((a, f) => a + f.n, 0);
  $('statPoints').textContent = S.files.length
    // 「全」はファイルの点の総数（上限で間引いて読んだ分も含む）。天井・切り出し・断面で隠した点は数えないので、そのときは添える
    ? `表示 ${fmtN(Math.ceil(total * ratio))}\u00a0点${ratio < 1 ? '（操作中は間引き）' : ''}${(S.hideCeil && S.ceil) || $('secOn').checked || clipD.some(d => !d.full()) ? '（天井・切り出しで隠した点を含む）' : ''} ／ 全 ${fmtN(S.files.reduce((a, f) => a + (f.total || f.n), 0))} 点`
    : '点群なし';
  const on = [['info', '座標'], ['measure', '距離']].filter(([k]) => S.tools[k]).map(([, n]) => n);
  $('statMode').textContent = `${cam === persp ? '透視' : '平行'}投影${on.length ? ` ・ クリックで${on.join('・')}` : ''}`;
}
// 右上の知らせ。誤りは消えずに残り（次の知らせまで）、折り返して全文を出す
//   soft = true の知らせ（続けて開いたときの「開きました」など）は、出ている誤りを上書きしない
let msgTimer = null, msgIsError = false;
function status(text, isError = false, soft = false) {
  const el = $('statMsg');
  if (soft && msgIsError && el.textContent) return;
  el.textContent = text;
  el.classList.toggle('err', !!(isError && text));
  el.style.color = isError && text ? css('--danger') : '';
  msgIsError = !!(isError && text);
  el.hidden = !text;
  clearTimeout(msgTimer);
  if (text && !isError) msgTimer = setTimeout(() => { el.textContent = ''; el.hidden = true; }, 8000);
}
function showProgress(text, p, phase) {
  $('progress').hidden = false;
  if (text) $('progressText').textContent = text;
  else if (phase) $('progressText').textContent = `${S.loadingFile ? S.loadingFile.name + ' を' : ''}${phase}中…${phase !== '読み込み' && !p ? '（しばらくかかります）' : ''}`;
  // 進み具合が分からない段階（並べ替えなど）は、止まって見えないよう帯を動かし続ける
  const indet = !!phase && phase !== '読み込み' && !p;
  $('progress').classList.toggle('indet', indet);
  $('progressBar').style.width = indet ? '' : `${Math.round((p || 0) * 100)}%`;
}
function hideProgress() { $('progress').hidden = true; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ------------------------------------------------------------------ ファイルを開く
// ファイルを選ぶ画面: 形式ごとに 1 行ずつ「種類」の一覧に並べる（CloudCompare と同じ並べ方）
//   File System Access API の showOpenFilePicker を使う。使えない所（ページが枠の中にある試作ページなど）では
//   ふつうの選択画面（拡張子が 1 行にまとまる）にする
const OPEN_TYPES = [
  ['PCD 点群 (*.pcd)', ['.pcd']],
  ['LAS / LAZ 点群 (*.las *.laz)', ['.las', '.laz']],
  ['E57 点群 (*.e57)', ['.e57']],
  ['PLY 点群・メッシュ (*.ply)', ['.ply']],
  ['PTX 点群 (*.ptx)', ['.ptx']],
  ['文字の点群 (*.txt *.asc *.neu *.xyz *.pts *.csv)', ['.txt', '.asc', '.neu', '.xyz', '.pts', '.csv']],
  ['CloudCompare エンティティ (*.bin)', ['.bin']],
  ['CloudCompare SBF 点群 (*.sbf + *.sbf.data)', ['.sbf', '.data']],
  ['点 + 法線 (*.pn)', ['.pn']],
  ['点 + 値 (*.pv)', ['.pv']],
  ['Mensi Soisic 点群 (*.soi)', ['.soi']],
  ['Bundler の出力 (*.out)', ['.out']],
  ['点群 + センサー情報 (*.pov + 点群)', ['.pov', '.asc', '.txt']],
  ['点群 + 較正画像 (*.icm + 点群)', ['.icm', '.asc', '.txt', '.wrl']],
  ['OBJ メッシュ (*.obj + *.mtl)', ['.obj', '.mtl']],
  ['STL メッシュ (*.stl)', ['.stl']],
  ['OFF メッシュ (*.off)', ['.off']],
  ['VTK 点群・メッシュ (*.vtk)', ['.vtk']],
  ['Draco 点群・メッシュ (*.drc)', ['.drc']],
  ['FBX メッシュ (*.fbx)', ['.fbx']],
  ['COLLADA メッシュ (*.dae)', ['.dae']],
  ['glTF メッシュ (*.gltf *.glb)', ['.gltf', '.glb', '.bin']],
  ['DXF 図面 (*.dxf)', ['.dxf']],
  ['シェープファイル (*.shp + *.shx *.dbf)', ['.shp', '.shx', '.dbf', '.prj']],
  ['IFC (*.ifc)', ['.ifc']],
  ['STEP CAD (*.stp *.step)', ['.stp', '.step']],
  ['PDMS (*.pdms *.pdmsmac *.mac)', ['.pdms', '.pdmsmac', '.mac']],
  ['Salome Hydro 線 (*.poly)', ['.poly']],
  ['SinusX 線 (*.sx)', ['.sx']],
  ['PhotoScan プロジェクト (*.psz)', ['.psz']],
  ['CSV の高さの表 (*.csv)', ['.csv']],
  ['ラスター (*.tif *.tiff)', ['.tif', '.tiff']],
  ['画像 (*.png *.jpg *.bmp *.gif *.webp など)', ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tga', '.ppm', '.pgm', '.pbm', '.ico', '.cur', '.icns', '.xbm', '.xpm', '.wbmp', '.svg', '.svgz']],
  // 開けない形式も選べるようにして、「開けない理由」の案内に届くように（R16-004。src/io/index.js の UNSUPPORTED と同じ）
  ['メーカー専用形式（開けない理由を表示） (*.rdb *.rdbx *.rsp *.rds *.vxls *.ptch *.mtch *.dp)', ['.rdb', '.rdbx', '.rsp', '.rds', '.vxls', '.ptch', '.mtch', '.dp']],
];
const TRAJ_TYPES = [['軌跡 (*.mcap)', ['.mcap']], ['TUM 形式の軌跡 (*.tum *.txt)', ['.tum', '.txt']], ['CSV の軌跡 (*.csv)', ['.csv']]];
const pickerTypes = (list, allName) => {
  const all = [...new Set(list.flatMap(([, e]) => e))];
  return [{ description: allName, accept: { 'application/octet-stream': all } }, ...list.map(([d, e]) => ({ description: d, accept: { 'application/octet-stream': e } }))];
};
const canPick = (() => { try { return typeof window.showOpenFilePicker === 'function' && window.top === window; } catch (e) { return false; } })();
async function pickFiles(types, allName, input, kind) {
  if (!canPick) { input.click(); return; }
  try {
    const hs = await window.showOpenFilePicker({ multiple: true, types: pickerTypes(types, allName), id: kind === 'traj' ? 'pcdviewer-traj' : 'pcdviewer-open' });
    const files = await Promise.all(hs.map(h => h.getFile()));
    if (files.length) { removePop('open'); enqueue(files, kind); } // 選んだらファイルのカードは閉じる
  } catch (err) {
    if (err && err.name === 'AbortError') return; // 選ばずに閉じた
    input.click();
  }
}
$('btnOpen').addEventListener('click', () => pickFiles(OPEN_TYPES, '対応しているすべての形式', $('fileInput'), 'cloud'));
$('btnTraj').addEventListener('click', () => pickFiles(TRAJ_TYPES, '対応しているすべての軌跡', $('trajInput'), 'traj'));
$('fileInput').addEventListener('change', e => { if (e.target.files.length) removePop('open'); enqueue([...e.target.files], 'cloud'); e.target.value = ''; });
$('trajInput').addEventListener('change', e => { if (e.target.files.length) removePop('open'); enqueue([...e.target.files], 'traj'); e.target.value = ''; });
let dragDepth = 0;
window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; stage.classList.add('drag'); });
window.addEventListener('dragleave', e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; stage.classList.remove('drag'); } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; stage.classList.remove('drag');
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) enqueue(files);
});

// ------------------------------------------------------------------ 画像の保存
//   アプリ版: ダウンロードで保存する（保存の画面を出す。保存したかどうかは画面からは分からないので「保存しました」とは言わない）
//   試作ページ: ダウンロードが許されていないので、画像を大きく出して「右クリックで保存」と案内する
let shotUrl = null;
function closeShot() {
  $('shotView').hidden = true;
  if (shotUrl) { URL.revokeObjectURL(shotUrl); shotUrl = null; }
  $('btnShot').focus({ preventScroll: true });
}
// 保存する画像: 3D の画面に、測った線の番号と長さ・座標の吹き出しを重ねて描く（画面の上の文字は 3D の絵に入らないため。R7-002）
function shotCanvas() {
  const gl = renderer.domElement, W = gl.width, H = gl.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.drawImage(gl, 0, 0);
  const sx = W / stage.clientWidth, sy = H / stage.clientHeight, sc = Math.min(sx, sy);
  const font = `${Math.round(13 * sc)}px ${css('--mono') || 'monospace'}`;
  const box = (x, y, lines, color) => {
    ctx.font = font;
    const lh = Math.round(17 * sc), pad = Math.round(6 * sc);
    const w = Math.max(...lines.map(t => ctx.measureText(t).width)) + 2 * pad, h = lines.length * lh + 2 * pad;
    const bx = Math.min(Math.max(0, x), W - w), by = Math.min(Math.max(0, y), H - h);
    ctx.fillStyle = 'rgba(14,19,23,0.85)'; ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, sc); ctx.strokeRect(bx, by, w, h);
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'top';
    lines.forEach((t, i) => ctx.fillText(t, bx + pad, by + pad + i * lh));
  };
  S.measures.forEach((m, i) => {
    const mid = m.a.clone().add(m.b).multiplyScalar(0.5).applyMatrix4(world.matrixWorld).project(cam);
    if (!(mid.z < 1 && mid.z > -1)) return;
    const n = measureNums(m.a, m.b);
    const x = (mid.x + 1) / 2 * W, y = (1 - mid.y) / 2 * H, col = m === S.mSel ? css('--accent') : '#b8c0c8';
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, sc); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30 * sc, y - 30 * sc); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 4 * sc, 0, 7); ctx.fill();
    box(x + 30 * sc, y - 30 * sc - 60 * sc, [`${fmt(n.len, 3)} m  #${i + 1}`, `水平 ${fmt(n.hor, 3)} ・ 高さの差 ${n.dz >= 0 ? '+' : ''}${fmt(n.dz, 3)}`], col);
  });
  const st = stage.getBoundingClientRect();
  for (const p of S.pins) {
    if (p.el.style.visibility === 'hidden') continue;
    const bx = p.el.querySelector('.pc-box'), r = bx.getBoundingClientRect();
    const t = bx.innerText.split('\n').map(x => x.trim()).filter(Boolean);
    const lines = [];
    for (let i = 0; i < t.length; i++) if (/^[xyz]$/i.test(t[i]) && t[i + 1] != null) { lines.push(`${t[i]} ${t[i + 1]}`); i++; } else lines.push(t[i]);
    box((r.left - st.left) * sx, (r.top - st.top) * sy, lines, p === S.pinSel ? css('--accent') : '#b8c0c8');
  }
  return cv;
}
$('btnShot').addEventListener('click', () => {
  if (!S.files.length && !S.trajs.length) { status('保存する点群がありません'); return; }
  renderer.render(scene, cam);
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = `lidar_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
  if (__ARTIFACT__) {
    // 枠の中では blob の画像が止められていることがあるので data: で出す
    $('shotImg').src = shotCanvas().toDataURL('image/png'); $('shotImg').alt = `今の画面の画像（${name}）`;
    $('shotView').hidden = false;
    $('btnShotClose').focus({ preventScroll: true });
    return;
  }
  const save = blob => {
    if (!blob) { status('画像を作れませんでした', true); return; }
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = shotUrl; a.download = name;
    a.click();
    status(`画像（${name}）の保存先を選んでください`);
  };
  // アプリ版: 画面に映っているもの（点群・座標と距離の吹き出し）をそのまま撮る。設定のカード・下の操作の帯などは写さない
  if (window.pcdApp && window.pcdApp.capture) {
    const app = document.querySelector('.app');
    app.classList.add('shooting');
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      try {
        const r = stage.getBoundingClientRect();
        const png = await window.pcdApp.capture({ x: r.left, y: r.top, width: r.width, height: r.height });
        save(new Blob([png], { type: 'image/png' }));
      } catch (err) {
        shotCanvas().toBlob(save, 'image/png'); // 撮れなければ、描き直した画像で保存する
      } finally { app.classList.remove('shooting'); }
    }));
    return;
  }
  shotCanvas().toBlob(save, 'image/png');
});
$('btnShotClose').addEventListener('click', closeShot);
$('shotView').addEventListener('click', e => { if (e.target === $('shotView')) closeShot(); });

// ------------------------------------------------------------------ キーボード
window.addEventListener('keydown', e => {
  const k = (e.key || '').toLowerCase();
  // Esc は入力部品にフォーカスがあっても効かせる（画像の表示 → 測りかけ → 上のカード の順に閉じる）
  if (k === 'escape' && !e.isComposing) {
    if (!$('shotView').hidden) { closeShot(); return; }
    if (S.mPending) cancelMeasure(); else if (popName) closePop(); else { removePop('info'); removePop('measure'); }
    return;
  }
  // Ctrl・Alt・⌘ 付きのキー（コピーなど）や、日本語の変換中・入力欄の中では、1 文字のショートカットを動かさない
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  // 文字を打つ部品の中だけ除く（チェックボックス・つまみを触ったあとも t・c などを効かせる。R7-005）
  if (e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button]):not([type=file]), select, textarea, [contenteditable]')) return;
  if (!$('shotView').hidden) return;
  if (k === 'c') toggleCeil();
  else if (k === 't') setView('top');
  else if (k === 'f') setView('front');
  else if (k === 's') setView('side');
  else if (k === 'a') setView('fit');
  else if (k === 'p') toggleProjection();
  else if (k === 'delete' || k === 'backspace') {
    // 座標を入れているときは選んだ座標を、距離を入れているときは選んだ距離を消す
    if (S.tools.info && S.pins.length) { const p = S.pinSel || S.pins[S.pins.length - 1]; const i = S.pins.indexOf(p); removePin(p); status(`${i + 1} 番目の座標を消しました`); return; }
    if (!S.tools.measure) return;
    if (S.mPending) cancelMeasure();
    else if (S.measures.length) { const m = S.mSel || S.measures[S.measures.length - 1]; const i = S.measures.indexOf(m); removeMeasure(m); status(`${i + 1} 番目の距離を消しました`); }
  }
  else if (k === 'i') setTool('info');
  else if (k === 'm') setTool('measure');
});

// ------------------------------------------------------------------ 描画
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  persp.aspect = w / Math.max(1, h); persp.updateProjectionMatrix();
  setOrthoHeight(ortho.top - ortho.bottom || 10);
  shared.uPixelRatio.value = renderer.getPixelRatio();
  shared.uViewportH.value = renderer.domElement.height;
  requestRender();
}
new ResizeObserver(resize).observe(stage);
// 拡大率の違う画面に窓を移したとき（devicePixelRatio が変わったとき）も、描く解像度を合わせ直す
(function watchDpr() {
  const mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  mq.addEventListener('change', () => { renderer.setPixelRatio(window.devicePixelRatio || 1); resize(); watchDpr(); }, { once: true });
})();
function applyTheme() {
  scene.background = new THREE.Color(css('--scene'));
  drawHist(); drawLegend(); requestRender();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
// つまみの塗り（つまみより左）を値に合わせる。値をプログラムから変えた場合も拾えるよう、描画のたびに確かめる
const ranges = [...document.querySelectorAll('input[type=range]')].filter(r => !r.closest('.dtrack'));
const rangeSeen = new WeakMap();
function syncRanges() {
  for (const r of ranges) {
    const key = r.value + '/' + r.min + '/' + r.max;
    if (rangeSeen.get(r) === key) continue;
    rangeSeen.set(r, key);
    const mn = +r.min || 0, mx = r.max === '' ? 100 : +r.max;
    r.style.setProperty('--p', `${Math.min(100, Math.max(0, (+r.value - mn) / ((mx - mn) || 1) * 100))}%`);
  }
}
document.addEventListener('input', e => { if (e.target.matches && e.target.matches('input[type=range]')) syncRanges(); });
(function loop(now) {
  syncRanges();
  stepAnim(now || performance.now());
  if (dirty) { dirty = false; updatePivot(); renderer.render(scene, cam); updateLabels(); placePickInfo(); }
  requestAnimationFrame(loop);
})();

applyTheme();
resize();
updateInfo();
updateStatus();
applyColor(false);
updateSection();
// ------------------------------------------------------------------ 試作ページ用（サンプルの点群を中に持つ）
// サンプルを入れずに作ったとき（NOSAMPLE=1）は、ファイルを選んで開くだけ
if (__ARTIFACT__ && __SAMPLE__) {
  // このページからは画像のダウンロードができないので、「画像を保存」は画像を大きく出して右クリックで保存してもらう（btnShot の処理）
  $('btnSample').hidden = false;
  const loadSample = () => {
    const d = __SAMPLE__;
    const bin = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const q = new Uint16Array(bin(d.b64).buffer), inten = bin(d.b64i);
    const head = `# .PCD v0.7\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH ${d.n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS ${d.n}\nDATA binary\n`;
    const body = new Float32Array(d.n * 4);
    for (let i = 0; i < d.n; i++) {
      for (let k = 0; k < 3; k++) body[4 * i + k] = d.lo[k] + d.sc[k] * q[3 * i + k];
      body[4 * i + 3] = inten[i];
    }
    enqueue([new File([head, body], 'sample_map.pcd'), new File([d.traj], 'sample_trajectory.txt')]);
  };
  $('btnSample').addEventListener('click', loadSample);
  loadSample();
  // 形式ごとのサンプル: 押すとページの横に置いたファイルを読み込んで開く
  $('fmtSamples').hidden = false;
  $('fmtSampleList').innerHTML = SAMPLE_GROUPS.map(([g, items]) => `<h3>${g}</h3><div class="chips">${items.map(([label, files, by], i) =>
    `<button type="button" data-sg="${escapeHtml(g)}" data-si="${i}">${escapeHtml(label)}</button>`).join('')}</div>`).join('');
  $('fmtSampleList').addEventListener('click', async e => {
    const b = e.target.closest('button[data-sg]');
    if (!b) return;
    const [, files] = SAMPLE_GROUPS.find(([g]) => g === b.dataset.sg)[1][+b.dataset.si];
    try {
      if (typeof DecompressionStream === 'undefined') throw new Error('このブラウザは古いため展開できません。新しいブラウザで開いてください');
      status(`サンプル ${files[0]} を取得しています…`);
      const got = await Promise.all(files.map(async n => {
        const b64 = __SAMPLE_FILES__[n];
        if (!b64) throw new Error(n);
        const gz = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return new File([await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).blob()], n);
      }));
      b.classList.add('ok');
      enqueue(got, 'cloud');
    } catch (err) { status('サンプルを取得できませんでした: ' + err.message, true); }
  });
}
// 背景の明るさ（0 = 黒 〜 50 = 中間のグレー）。色合いは少し青みのあるグレー。次に開いたときも同じにする
function setSceneLightness(L) {
  const c = '#' + new THREE.Color().setHSL(205 / 360, 0.16, L / 100).getHexString();
  document.documentElement.style.setProperty('--scene', c);
  $('bgLight').value = L;
  $('bgLightVal').textContent = `${Math.round(L * 2)}%`; // 0% = 黒、100% = 中間のグレー
  try { localStorage.setItem('pcdviewer.bg', String(L)); } catch (e) { /* 保存できなくても動かす */ }
  applyTheme();
}
$('bgLight').addEventListener('input', e => setSceneLightness(+e.target.value));
{
  let L = 14;
  try { const v = localStorage.getItem('pcdviewer.bg'); if (v !== null && v !== '' && Number.isFinite(+v)) L = Math.min(50, Math.max(0, +v)); } catch (e) { /* 既定のまま */ }
  setSceneLightness(L);
}
// カーソルを合わせたときの説明（title）は出さない。あとから付いたものも消す
for (const el of document.querySelectorAll('[title]')) el.removeAttribute('title');
new MutationObserver(ms => { for (const m of ms) if (m.type === 'attributes' && m.target.hasAttribute('title')) m.target.removeAttribute('title'); else for (const n of m.addedNodes || []) if (n.nodeType === 1) { if (n.hasAttribute('title')) n.removeAttribute('title'); for (const c of n.querySelectorAll('[title]')) c.removeAttribute('title'); } })
  .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
window.__pcd = { S, enqueue, setView, pickAt, call, world, renderer, shotCanvas, get cam() { return cam; }, controlsTarget: () => controls.target.toArray(), updateLive }; // 動作確認用
// OS から渡されたファイル（関連付け・ダブルクリック・コマンドライン・「このアプリで開く」）を開く（アプリ版だけ）。
// 主プロセスが隠れた入力欄 #pcdOsOpen にファイルを入れてから知らせてくる
if (window.pcdApp) {
  const osIn = document.createElement('input');
  osIn.type = 'file'; osIn.multiple = true; osIn.id = 'pcdOsOpen'; osIn.hidden = true; osIn.tabIndex = -1;
  document.body.appendChild(osIn);
  window.pcdApp.onOpenFiles(() => {
    const files = [...(osIn.files || [])];
    osIn.value = '';
    if (files.length) enqueue(files);
  });
  window.pcdApp.ready();
}
