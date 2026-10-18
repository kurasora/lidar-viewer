// CloudCompare の追加形式（qAdditionalIO）と同じ読み方をするもの
//   .pn  … float32 の x y z nx ny nz が並ぶだけ（法線は使わない）
//   .pv  … float32 の x y z 値
//   .soi … Mensi Soisic。#NS# スキャン数、スキャンごとに #pt# 点数、各点は x y z 濃淡（濃淡 × 8 が明るさ）
//   .out … Bundler。カメラ（5 行ずつ）のあとに点（位置・色・見えたカメラ）
//   .poly… Salome Hydro。1 行 1 頂点、空行で線が切れる
//   .sx  … SinusX。B で線が始まり、CN 名前・CP 設定のあとに x y z A の頂点
import { eachLine, numbersIn } from '../util.js';
import { addLines } from '../sink.js';

async function floats(src, sink, ctx, per, put) {
  if (src.size % (4 * per)) throw new Error(`大きさが ${4 * per} バイトの倍数ではありません（形式が違う可能性があります）`);
  const n = src.size / (4 * per);
  sink.hint(n);
  const chunk = Math.floor((1 << 24) / (4 * per));
  for (let p0 = 0; p0 < n; p0 += chunk) {
    const m = Math.min(chunk, n - p0);
    const b = await src.read(p0 * 4 * per, m * 4 * per);
    const f = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    for (let i = 0; i < m; i++) { const k = sink.slot(f[i * per], f[i * per + 1], f[i * per + 2]); if (k >= 0) put(k, f, i * per); }
    ctx.progress((p0 + m) / n);
  }
}
export async function readPN(src, sink, ctx) {
  await floats(src, sink, ctx, 6, () => {});
  return { format: 'CloudCompare PN（座標 + 法線）', note: '法線は使いません' };
}
export async function readPV(src, sink, ctx) {
  const fv = sink.field('value');
  await floats(src, sink, ctx, 4, (k, f, o) => { sink.F[fv][k] = f[o + 3]; });
  return { format: 'CloudCompare PV（座標 + 値）' };
}

export async function readSOI(src, sink, ctx) {
  const v = new Float64Array(8);
  let inHeader = true, scans = 0;
  sink.rgb();
  const fi = sink.field('intensity');
  const dec = new TextDecoder();
  await eachLine(src, 0, (b, s, e) => {
    if (b[s] === 35) { // #
      const t = dec.decode(b.subarray(s, e));
      if (t.startsWith('#CC#')) inHeader = false;
      else if (t.startsWith('#NP#')) sink.hint(Number(t.slice(4)));
      else if (t.startsWith('#pt#')) scans++;
      return;
    }
    if (inHeader) return;
    if (numbersIn(b, s, e, v) < 4) return;
    const k = sink.slot(v[0], v[1], v[2]);
    if (k < 0) return;
    const g = Math.min(255, v[3] * 8);
    sink.C[3 * k] = g; sink.C[3 * k + 1] = g; sink.C[3 * k + 2] = g;
    sink.F[fi][k] = v[3];
  }, ctx.progress);
  return { format: `Mensi Soisic（スキャン ${scans} 個）` };
}

export async function readBundler(src, sink, ctx) {
  const v = new Float64Array(16);
  let line = 0, ncam = -1, npt = 0, camLines = 0, phase = 'head', ptLine = 0, k = -1;
  sink.rgb();
  const dec = new TextDecoder();
  await eachLine(src, 0, (b, s, e) => {
    line++;
    if (phase === 'head') {
      if (b[s] === 35) { if (line === 1 && !/Bundle file/i.test(dec.decode(b.subarray(s, e)))) throw new Error('Bundler の .out ファイルではありません'); return; }
      numbersIn(b, s, e, v); ncam = v[0]; npt = v[1]; sink.hint(npt); camLines = ncam * 5; phase = camLines ? 'cam' : 'pt';
      return;
    }
    if (phase === 'cam') { if (--camLines === 0) phase = 'pt'; return; }
    const n = numbersIn(b, s, e, v);
    if (ptLine === 0) { k = n >= 3 ? sink.slot(v[0], v[1], v[2]) : -1; }
    else if (ptLine === 1 && k >= 0) { sink.C[3 * k] = v[0]; sink.C[3 * k + 1] = v[1]; sink.C[3 * k + 2] = v[2]; }
    ptLine = (ptLine + 1) % 3;
  }, ctx.progress);
  return { format: `Bundler（カメラ ${ncam} 台、点 ${npt.toLocaleString()}）` };
}

export async function readSalome(src, sink, ctx) {
  const lines = []; let cur = [];
  const v = new Float64Array(8);
  const end = () => {
    if (cur.length >= 6) {
      const n = cur.length / 3;
      const closed = n > 2 && cur[0] === cur[3 * n - 3] && cur[1] === cur[3 * n - 2] && cur[2] === cur[3 * n - 1];
      lines.push({ V: closed ? cur.slice(0, -3) : cur, closed });
    }
    cur = [];
  };
  await eachLine(src, 0, (b, s, e) => {
    const n = numbersIn(b, s, e, v);
    if (!n) { end(); return; }
    if (n === 3) cur.push(v[0], v[1], v[2]);
  }, ctx.progress);
  end();
  if (!lines.length) throw new Error('線が見つかりません');
  addLines(sink, lines);
  return { format: `Salome Hydro（線 ${lines.length} 本）`, note: '線の上に点を並べて表示しています' };
}

export async function readSinusx(src, sink, ctx) {
  const lines = []; let cur = null;
  const v = new Float64Array(8);
  const dec = new TextDecoder();
  const end = () => { if (cur && cur.V.length >= 3) lines.push(cur); cur = null; };
  await eachLine(src, 0, (b, s, e) => {
    const c0 = b[s], c1 = b[s + 1];
    if (c0 === 66) { end(); cur = { V: [], closed: false, cp: 0 }; return; } // B
    if (c0 === 67) { // C
      if (cur && c1 === 80) { // CP
        const w = dec.decode(b.subarray(s, e)).trim().split(/\s+/);
        if (cur.cp++ === 0 && w.length === 3) cur.closed = w[2] === '1';
      }
      return;
    }
    if (!cur) return;
    const n = numbersIn(b, s, e, v);
    if (n >= 3 && Number.isFinite(v[2])) cur.V.push(v[0], v[1], v[2]);
  }, ctx.progress);
  end();
  if (!lines.length) throw new Error('線が見つかりません');
  addLines(sink, lines);
  return { format: `SinusX（線 ${lines.length} 本）`, note: '線の上に点を並べて表示しています' };
}
