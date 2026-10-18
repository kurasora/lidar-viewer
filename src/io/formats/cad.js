// 図面・GIS・プラント形式: DXF・シェープファイル（SHP）・PDMS
import { decode, decodeLatin, extOf } from '../util.js';
import { addMesh, addLines } from '../sink.js';
import { guard } from './image.js';
import { meshNote } from './mesh.js';

// ------------------------------------------------------------------ AutoCAD の色番号（ACI）を RGB に（AutoCAD の標準の 256 色の表）
const ACI_HEX =
  '000000ff0000ffff0000ff0000ffff0000ffff00ffffffff808080c0c0c0ff0000ff7f7fa50000a552527f00007f3f3f4c00004c2626260000261313ff3f00ff9f7fa52900a567527f1f007f4f3f4c13004c2f26260900261713ff7f00ffbf7fa55200a57c527f3f007f5f3f4c26004c3926261300261c13ffbf00ffdf7fa57c00a591527f5f007f6f3f4c39004c4226261c00262113ffff00ffff7fa5a500a5a5527f7f007f7f3f4c4c004c4c26262600262613bfff00dfff7f7ca50091a552' +
  '5f7f006f7f3f394c00424c261c26002126137fff00bfff7f52a5007ca5523f7f005f7f3f264c00394c261326001c26133fff009fff7f29a50067a5521f7f004f7f3f134c002f4c2609260017261300ff007fff7f00a50052a552007f003f7f3f004c00264c2600260013261300ff3f7fff9f00a52952a567007f1f3f7f4f004c13264c2f00260913581700ff7f7fffbf00a55252a57c007f3f3f7f5f004c26264c3900261313581c00ffbf7fffdf00a57c52a591007f5f3f7f6f004c39264c42' +
  '00261c13585800ffff7fffff00a5a552a5a5007f7f3f7f7f004c4c264c4c00262613585800bfff7fdfff007ca55291a5005f7f3f6f7f00394c26427e001c26135858007fff7fbfff0052a5527ca5003f7f3f5f7f00264c26397e001326131c58003fff7f9fff0029a55267a5001f7f3f4f7f00134c262f7e0009261317580000ff7f7fff0000a55252a500007f3f3f7f00004c26267e0000261313583f00ff9f7fff2900a56752a51f007f4f3f7f13004c2f267e0900261713587f00ffbf7fff' +
  '5200a57c52a53f007f5f3f7f26004c39267e1300261c1358bf00ffdf7fff7c00a59152a55f007f6f3f7f39004c42264c1c0026581358ff00ffff7fffa500a5a552a57f007f7f3f7f4c004c4c264c260026581358ff00bfff7fdfa5007ca552917f005f7f3f6f4c00394c264226001c581358ff007fff7fbfa50052a5527c7f003f7f3f5f4c00264c263926001358131cff003fff7f9fa50029a552677f001f7f3f4f4c00134c262f260009581317000000656565666666999999ccccccffffff';
const ACI = Array.from({ length: 256 }, (_, i) => [0, 2, 4].map(j => parseInt(ACI_HEX.slice(6 * i + j, 6 * i + j + 2), 16)));
function aci(c) {
  c = Math.abs(c | 0);
  return c >= 1 && c <= 255 ? ACI[c] : ACI[7];
}
const trueColor = v => { const n = Number(v) | 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// 押し出し方向（OCS）→ 世界の座標（AutoCAD の任意軸アルゴリズム）。(0,0,1) なら null
function ocsMatrix(nx, ny, nz) {
  const L = Math.hypot(nx, ny, nz);
  if (!(L > 0)) return null;
  nx /= L; ny /= L; nz /= L;
  if (Math.abs(nx) < 1e-12 && Math.abs(ny) < 1e-12 && nz > 0) return null;
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = a => { const l = Math.hypot(...a); return a.map(x => x / l); };
  const N = [nx, ny, nz];
  const Ax = nrm(Math.abs(nx) < 1 / 64 && Math.abs(ny) < 1 / 64 ? cross([0, 1, 0], N) : cross([0, 0, 1], N));
  const Ay = nrm(cross(N, Ax));
  return [Ax[0], Ay[0], N[0], 0, Ax[1], Ay[1], N[1], 0, Ax[2], Ay[2], N[2], 0];
}
// ふくらみ（bulge）のある辺 p→q の途中の点（両端は含まない）
function bulgePts(p, q, b) {
  if (!b) return [];
  const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy);
  if (!(d > 0)) return [];
  const th = 4 * Math.atan(b), k = (1 - b * b) / (4 * b); // 中心は弦の中点から左の法線の向きに d × k
  const cx = (p[0] + q[0]) / 2 - dy * k, cy = (p[1] + q[1]) / 2 + dx * k;
  const r = Math.hypot(p[0] - cx, p[1] - cy), a0 = Math.atan2(p[1] - cy, p[0] - cx);
  const n = Math.max(2, Math.ceil(Math.abs(th) / (2 * Math.PI) * 72)), out = [];
  for (let j = 1; j < n; j++) { const a = a0 + th * j / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), p[2] + (q[2] - p[2]) * j / n]); }
  return out;
}
// B スプライン（有理も）を折れ線に
function splinePts(deg, knots, ctrl, wts) {
  const n = ctrl.length;
  if (!(deg >= 1) || n < deg + 1 || knots.length !== n + deg + 1) return null;
  const t0 = knots[deg], t1 = knots[n];
  if (!(t1 > t0)) return null;
  const S = Math.min(4000, Math.max(32, n * 16)), out = [];
  for (let s = 0; s <= S; s++) {
    const t = s === S ? t1 - 1e-12 * (t1 - t0) : t0 + (t1 - t0) * s / S;
    let k = deg; while (k < n - 1 && t >= knots[k + 1]) k++;
    const d = []; for (let j = 0; j <= deg; j++) { const i = k - deg + j, w = wts && wts.length === n ? wts[i] : 1; d.push([ctrl[i][0] * w, ctrl[i][1] * w, ctrl[i][2] * w, w]); }
    for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
      const i = k - deg + j, den = knots[i + deg - r + 1] - knots[i], a = den ? (t - knots[i]) / den : 0;
      for (let c = 0; c < 4; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
    }
    const w = d[deg][3] || 1; out.push([d[deg][0] / w, d[deg][1] / w, d[deg][2] / w]);
  }
  return out;
}

// ------------------------------------------------------------------ DXF（文字形式）
async function readDXF_(src, sink, ctx) {
  const txt = decodeLatin(await src.all());
  if (txt.startsWith('AutoCAD Binary DXF')) throw new Error('バイナリ形式の DXF には対応していません（文字形式で保存し直してください）');
  const L = txt.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i], 10), L[i + 1].trim()]);
  // 画層の色、ブロックの中身
  const layerColor = {}, layerTrue = {}, blocks = {};
  let i = 0, section = '';
  const ents = []; // { type, codes: [[c,v]...] }
  let cur = null, curBlock = null;
  for (; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'SECTION') { section = pairs[i + 1]?.[1] || ''; cur = null; continue; }
    if (c === 0 && v === 'ENDSEC') { section = ''; cur = null; continue; }
    if (section === 'TABLES' && c === 0 && v === 'LAYER') {
      let name = '', col = 7, tc = null;
      for (let j = i + 1; j < pairs.length && pairs[j][0] !== 0; j++) { if (pairs[j][0] === 2) name = pairs[j][1]; if (pairs[j][0] === 62) col = +pairs[j][1]; if (pairs[j][0] === 420) tc = trueColor(pairs[j][1]); }
      layerColor[name] = col;
      if (tc) layerTrue[name] = tc;
    }
    if (section === 'BLOCKS') {
      if (c === 0 && v === 'BLOCK') { curBlock = { name: '', base: [0, 0, 0], ents: [] }; for (let j = i + 1; j < pairs.length && pairs[j][0] !== 0; j++) { if (pairs[j][0] === 2) curBlock.name = pairs[j][1]; if (pairs[j][0] === 10) curBlock.base[0] = +pairs[j][1]; if (pairs[j][0] === 20) curBlock.base[1] = +pairs[j][1]; if (pairs[j][0] === 30) curBlock.base[2] = +pairs[j][1]; } cur = null; continue; }
      if (c === 0 && v === 'ENDBLK') { if (curBlock) blocks[curBlock.name] = curBlock; curBlock = null; cur = null; continue; }
    }
    if ((section === 'ENTITIES' || (section === 'BLOCKS' && curBlock)) && c === 0) {
      cur = { type: v, codes: [] };
      (curBlock ? curBlock.ents : ents).push(cur);
      continue;
    }
    if (cur) cur.codes.push([c, v]);
  }
  const tris = { V: [], C: [] }, lines = [], points = [];
  const skipped = {}; // 表示していない図形の種類と数
  const layOf = e => e.codes.find(p => p[0] === 8)?.[1] ?? '0';
  const layerCol = lay => layerTrue[lay] || aci(layerColor[lay] ?? 7);
  // 色: トゥルーカラー（420）> 色番号（62）。0 = ブロックの色（BYBLOCK）、256・なし = 画層の色（BYLAYER）。
  //   ブロックの中の画層 0 の図形は、挿入（INSERT）の画層を継ぐ
  const effLayer = (e, blkLayer) => { const l = layOf(e); return l === '0' && blkLayer ? blkLayer : l; };
  const colorOf = (e, blkColor, blkLayer) => {
    const tc = e.codes.find(p => p[0] === 420);
    if (tc) return trueColor(tc[1]);
    const g = e.codes.find(p => p[0] === 62);
    const n = g ? +g[1] : 256;
    if (n === 0) return blkColor || aci(7);
    if (n === 256) return layerCol(effLayer(e, blkLayer));
    return aci(n);
  };
  const val = (e, code, d = 0) => { const p = e.codes.find(q => q[0] === code); return p ? +p[1] : d; };
  const ocsOf = e => ocsMatrix(val(e, 210, 0), val(e, 220, 0), val(e, 230, 1));
  const app = (O, x, y, z) => O ? [O[0] * x + O[1] * y + O[2] * z, O[4] * x + O[5] * y + O[6] * z, O[8] * x + O[9] * y + O[10] * z] : [x, y, z];
  // 頂点とふくらみの列（[x,y,z,bulge]）を折れ線にする
  const bulged = (vs, closed) => {
    const out = [];
    for (let j = 0; j < vs.length; j++) {
      const p = vs[j]; out.push([p[0], p[1], p[2]]);
      const q = vs[j + 1] || (closed ? vs[0] : null);
      if (q && p[3]) out.push(...bulgePts(p, q, p[3]));
    }
    return out;
  };
  const stack = []; let inserts = 0;
  const emit = (list, M, blkColor, blkLayer) => {
    const T = (x, y, z) => M ? [M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]] : [x, y, z];
    for (let k = 0; k < list.length; k++) {
      const e = list[k], col = colorOf(e, blkColor, blkLayer);
      const t = e.type;
      const O = ocsOf(e), TO = (x, y, z) => T(...app(O, x, y, z)); // 物体の座標系（OCS）の図形
      const tri = (a, b, c) => { tris.V.push(...a, ...b, ...c); tris.C.push(...col, ...col, ...col); };
      if (t === 'POINT') points.push(...T(val(e, 10), val(e, 20), val(e, 30)), ...col);
      else if (t === 'LINE') lines.push({ V: [...T(val(e, 10), val(e, 20), val(e, 30)), ...T(val(e, 11), val(e, 21), val(e, 31))], closed: false, C: col });
      else if (t === 'LWPOLYLINE') {
        const z = val(e, 38), vs = [];
        for (const [c, v] of e.codes) { if (c === 10) vs.push([+v, 0, z, 0]); else if (c === 20 && vs.length) vs[vs.length - 1][1] = +v; else if (c === 42 && vs.length) vs[vs.length - 1][3] = +v; }
        const closed = (val(e, 70) & 1) === 1;
        lines.push({ V: bulged(vs, closed).flatMap(p => TO(p[0], p[1], p[2])), closed, C: col });
      } else if (t === '3DFACE' || t === 'SOLID' || t === 'TRACE') {
        const F = t === '3DFACE' ? T : TO;
        const P = [0, 1, 2, 3].map(j => F(val(e, 10 + j), val(e, 20 + j), val(e, 30 + j, t === '3DFACE' ? 0 : val(e, 30))));
        const order = t === '3DFACE' ? [0, 1, 2, 3] : [0, 1, 3, 2]; // SOLID は 3 番目と 4 番目が入れ替わる
        const Q = order.map(j => P[j]);
        tri(Q[0], Q[1], Q[2]);
        if (Q[3].some((v, j) => v !== Q[2][j])) tri(Q[0], Q[2], Q[3]);
      } else if (t === 'CIRCLE' || t === 'ARC') {
        const cx = val(e, 10), cy = val(e, 20), cz = val(e, 30), r = val(e, 40);
        const a0 = t === 'ARC' ? val(e, 50) * Math.PI / 180 : 0;
        let a1 = t === 'ARC' ? val(e, 51) * Math.PI / 180 : 2 * Math.PI;
        if (a1 <= a0) a1 += 2 * Math.PI;
        const n = 72, V = [];
        for (let j = 0; j <= n; j++) { const a = a0 + (a1 - a0) * j / n; V.push(...TO(cx + r * Math.cos(a), cy + r * Math.sin(a), cz)); }
        lines.push({ V, closed: false, C: col });
      } else if (t === 'ELLIPSE') { // 中心・長軸の端（中心から）・短軸の比・始めと終わりの角（世界の座標）
        const c0 = [val(e, 10), val(e, 20), val(e, 30)], mj = [val(e, 11), val(e, 21), val(e, 31)], ratio = val(e, 40, 1);
        let N = [val(e, 210, 0), val(e, 220, 0), val(e, 230, 1)]; const nl = Math.hypot(...N) || 1; N = N.map(x => x / nl);
        const mn = [N[1] * mj[2] - N[2] * mj[1], N[2] * mj[0] - N[0] * mj[2], N[0] * mj[1] - N[1] * mj[0]].map(x => x * ratio);
        const p0 = val(e, 41, 0); let p1 = val(e, 42, 2 * Math.PI); if (p1 <= p0) p1 += 2 * Math.PI;
        const n = Math.max(8, Math.ceil((p1 - p0) / (2 * Math.PI) * 96)), V = [];
        for (let j = 0; j <= n; j++) { const a = p0 + (p1 - p0) * j / n, ca = Math.cos(a), sa = Math.sin(a); V.push(...T(c0[0] + ca * mj[0] + sa * mn[0], c0[1] + ca * mj[1] + sa * mn[1], c0[2] + ca * mj[2] + sa * mn[2])); }
        lines.push({ V, closed: false, C: col });
      } else if (t === 'SPLINE') { // 制御点 + ノット（有理なら重み）。なければ通過点
        const knots = [], wts = [], ctrl = [], fit = [];
        let last = null;
        for (const [c, v] of e.codes) {
          if (c === 40) knots.push(+v); else if (c === 41) wts.push(+v);
          else if (c === 10) { last = [+v, 0, 0]; ctrl.push(last); } else if (c === 20 && last) last[1] = +v; else if (c === 30 && last) last[2] = +v;
          else if (c === 11) { last = [+v, 0, 0]; fit.push(last); } else if (c === 21 && last) last[1] = +v; else if (c === 31 && last) last[2] = +v;
        }
        const P = splinePts(val(e, 71, 3), knots, ctrl, wts) || (fit.length >= 2 ? fit : ctrl);
        if (P.length >= 2) lines.push({ V: P.flatMap(p => T(p[0], p[1], p[2])), closed: false, C: col });
      } else if (t === 'MESH') { // 頂点（92 の数）と面の並び（93 の数の 90: 頂点数, 番号…）
        const vs = []; let mode = 0, left = 0, last = null; const fl = [];
        for (const [c, v] of e.codes) {
          if (c === 92) { mode = 1; left = +v; continue; }
          if (c === 93) { mode = 2; left = +v; continue; }
          if (c === 94 || c === 95 || c === 90 && mode === 0) { if (c !== 90) mode = 0; continue; }
          if (mode === 1) { if (c === 10) { last = [+v, 0, 0]; vs.push(last); if (vs.length >= left) mode = 3; } else if (c === 20 && last) last[1] = +v; else if (c === 30 && last) last[2] = +v; }
          else if (mode === 3) { if (c === 20 && last) last[1] = +v; else if (c === 30 && last) { last[2] = +v; mode = 0; } }
          else if (mode === 2 && c === 90) { fl.push(+v); if (fl.length >= left) mode = 0; }
        }
        const P = vs.map(p => T(p[0], p[1], p[2]));
        for (let j = 0; j < fl.length;) {
          const n = fl[j], ids = fl.slice(j + 1, j + 1 + n); j += n + 1;
          if (!(n >= 3) || ids.some(x => !P[x])) { if (!(n >= 0)) break; continue; }
          for (let q = 1; q + 1 < ids.length; q++) tri(P[ids[0]], P[ids[q]], P[ids[q + 1]]);
        }
      } else if (t === 'POLYLINE') {
        const flags = val(e, 70);
        const verts = [];
        while (k + 1 < list.length && list[k + 1].type === 'VERTEX') verts.push(list[++k]);
        if (k + 1 < list.length && list[k + 1].type === 'SEQEND') k++;
        if (flags & 64) { // ポリフェースメッシュ（範囲外の頂点番号の面は捨てる）
          const pos = verts.filter(v => (val(v, 70) & 192) === 192).map(v => T(val(v, 10), val(v, 20), val(v, 30)));
          for (const f of verts.filter(v => (val(v, 70) & 192) === 128)) {
            const ids = [71, 72, 73, 74].map(c => Math.abs(val(f, c))).filter(x => x > 0).map(x => x - 1);
            if (ids.some(x => !pos[x])) continue;
            for (let j = 1; j + 1 < ids.length; j++) tri(pos[ids[0]], pos[ids[j]], pos[ids[j + 1]]);
          }
        } else if (flags & 16) { // ポリゴンメッシュ（M × N の格子）
          const m = val(e, 71), n = val(e, 72), P = verts.map(v => T(val(v, 10), val(v, 20), val(v, 30)));
          if (m >= 2 && n >= 2 && P.length >= m * n) {
            const cm = flags & 1, cn = flags & 32;
            for (let a = 0; a < (cm ? m : m - 1); a++) for (let b = 0; b < (cn ? n : n - 1); b++) {
              const a2 = (a + 1) % m, b2 = (b + 1) % n;
              const p00 = P[a * n + b], p01 = P[a * n + b2], p10 = P[a2 * n + b], p11 = P[a2 * n + b2];
              tri(p00, p10, p11); tri(p00, p11, p01);
            }
          }
        } else if (flags & 8) lines.push({ V: verts.flatMap(v => T(val(v, 10), val(v, 20), val(v, 30))), closed: (flags & 1) === 1, C: col }); // 3D ポリライン
        else { // 2D ポリライン: 物体の座標系、高さは POLYLINE の 30、頂点ごとのふくらみ
          const z = val(e, 30), closed = (flags & 1) === 1;
          const vs = verts.map(v => [val(v, 10), val(v, 20), z, val(v, 42)]);
          lines.push({ V: bulged(vs, closed).flatMap(p => TO(p[0], p[1], p[2])), closed, C: col });
        }
      } else if (t === 'INSERT') {
        const bn = e.codes.find(p => p[0] === 2)?.[1];
        const b = blocks[bn];
        if (!b) continue;
        // 自分自身を挿入するブロック・深すぎる入れ子・展開しすぎは止める（固まる・メモリを使い果たすのを防ぐ）
        if (stack.includes(bn)) throw new Error(`DXF のブロック「${bn}」が自分自身を挿入しています（ファイルが壊れている可能性があります）`);
        if (stack.length >= 16) throw new Error('DXF のブロックの入れ子が深すぎます（16 段まで）');
        const sx = val(e, 41, 1), sy = val(e, 42, 1), sz = val(e, 43, 1), r = val(e, 50) * Math.PI / 180;
        const c = Math.cos(r), s = Math.sin(r), px = val(e, 10), py = val(e, 20), pz = val(e, 30);
        // MINSERT: 列（70）× 行（71）、間隔（44・45）で並べる
        const nc = Math.max(1, val(e, 70, 1) | 0), nr = Math.max(1, val(e, 71, 1) | 0), dc = val(e, 44), dr = val(e, 45);
        const lay = effLayer(e, blkLayer);
        for (let ri = 0; ri < nr; ri++) for (let ci = 0; ci < nc; ci++) {
          if (++inserts > 200000) throw new Error('DXF のブロックの挿入が多すぎます（20 万個まで）');
          const ox = c * ci * dc - s * ri * dr, oy = s * ci * dc + c * ri * dr;
          const B0 = [c * sx, -s * sy, 0, px + ox - (c * sx * b.base[0] - s * sy * b.base[1]), s * sx, c * sy, 0, py + oy - (s * sx * b.base[0] + c * sy * b.base[1]), 0, 0, sz, pz - sz * b.base[2]];
          const B = O ? mul34(O, B0) : B0;
          const MM = M ? mul34(M, B) : B;
          stack.push(bn); emit(b.ents, MM, col, lay); stack.pop();
        }
      } else if (!/^(VERTEX|SEQEND|ATTRIB|ATTDEF|VIEWPORT|ENDBLK|BLOCK)$/.test(t)) skipped[t] = (skipped[t] || 0) + 1;
    }
  };
  emit(ents, null, null, null);
  ctx.progress(1);
  if (!tris.V.length && !lines.length && !points.length) throw new Error('DXF に点・線・面が見つかりません' + (Object.keys(skipped).length ? `（表示できない図形: ${Object.keys(skipped).join('、')}）` : ''));
  if (tris.V.length) { const n = tris.V.length / 3; addMesh(sink, Float64Array.from(tris.V), Uint32Array.from({ length: n }, (_, j) => j), Uint8Array.from(tris.C)); }
  if (lines.length) addLines(sink, lines);
  if (points.length) {
    sink.rgb();
    for (let j = 0; j < points.length; j += 6) { const k = sink.slot(points[j], points[j + 1], points[j + 2]); if (k >= 0) { sink.C[3 * k] = points[j + 3]; sink.C[3 * k + 1] = points[j + 4]; sink.C[3 * k + 2] = points[j + 5]; } }
  }
  const sk = Object.entries(skipped);
  const note = [meshNote(tris.V.length, lines.length), sk.length ? `表示していない図形: ${sk.map(([k, n]) => `${k} ${n.toLocaleString()} 個`).join('、')}` : ''].filter(Boolean).join('。');
  return { format: `DXF（点 ${(points.length / 6).toLocaleString()}、線 ${lines.length.toLocaleString()}、面 ${(tris.V.length / 9).toLocaleString()}）`, note };
}
export const readDXF = guard('DXF', readDXF_);
function mul34(A, B) { // 3×4 の変換をつなぐ
  const o = new Array(12);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) o[4 * r + c] = A[4 * r] * B[c] + A[4 * r + 1] * B[4 + c] + A[4 * r + 2] * B[8 + c] + (c === 3 ? A[4 * r + 3] : 0);
  return o;
}

// ------------------------------------------------------------------ ESRI シェープファイル（.shp + .dbf）
function readDBF(b) {
  if (!b) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.length);
  const n = dv.getUint32(4, true), hl = dv.getUint16(8, true), rl = dv.getUint16(10, true);
  const fields = [];
  for (let o = 32; o + 32 <= hl && b[o] !== 0x0d; o += 32) {
    const name = decodeLatin(b, o, o + 11).replace(/\0.*$/, '');
    fields.push({ name, type: String.fromCharCode(b[o + 11]), len: b[o + 16] });
  }
  const num = fields.filter(f => 'NFIB'.includes(f.type));
  const cols = num.map(() => new Float64Array(n));
  for (let r = 0; r < n; r++) {
    let o = hl + r * rl + 1;
    for (const f of fields) {
      const j = num.indexOf(f);
      if (j >= 0) cols[j][r] = parseFloat(decodeLatin(b, o, o + f.len).trim());
      o += f.len;
    }
  }
  return { names: num.map(f => f.name.toLowerCase()), cols };
}
export const readSHP = guard('シェープファイル', readSHP_);
async function readSHP_(src, sink, ctx) {
  const b = await src.all();
  const dv = new DataView(b.buffer);
  if (dv.getInt32(0, false) !== 9994) throw new Error('シェープファイル（.shp）ではありません');
  const type = dv.getInt32(32, true);
  const base = ctx.name.replace(/\.[^.]+$/, '').toLowerCase();
  const dbfF = Object.entries(ctx.companions).find(([n]) => n.toLowerCase() === base + '.dbf');
  const dbf = dbfF ? readDBF(new Uint8Array(await dbfF[1].arrayBuffer())) : null;
  const fk = dbf ? dbf.names.map(n => sink.field(n)) : [];
  const lines = [], tris = [];
  let o = 100, rec = 0, nPts = 0;
  const putPoint = (x, y, z) => { const k = sink.slot(x, y, z); if (k >= 0 && dbf) dbf.cols.forEach((c, j) => { sink.F[fk[j]][k] = c[rec]; }); nPts++; };
  while (o + 8 <= b.length) {
    const len = dv.getInt32(o + 4, false) * 2;
    const c = o + 8;
    if (len < 4 || c + len > b.length) break; // 長さが壊れた記録（負・ファイルの外）では止める（同じ所を読み続けないように）
    const st = dv.getInt32(c, true);
    const hasZ = st === 11 || st === 13 || st === 15 || st === 18 || st === 31;
    if (st === 1 || st === 11 || st === 21) putPoint(dv.getFloat64(c + 4, true), dv.getFloat64(c + 12, true), st === 11 ? dv.getFloat64(c + 20, true) : 0);
    else if (st === 8 || st === 18 || st === 28) {
      const np = dv.getInt32(c + 36, true), pts = c + 40, zs = pts + 16 * np + 16;
      for (let j = 0; j < np; j++) putPoint(dv.getFloat64(pts + 16 * j, true), dv.getFloat64(pts + 16 * j + 8, true), hasZ ? dv.getFloat64(zs + 8 * j, true) : 0);
    } else if ([3, 5, 13, 15, 23, 25, 31].includes(st)) {
      const nparts = dv.getInt32(c + 36, true), np = dv.getInt32(c + 40, true);
      const partsAt = c + 44, typesAt = partsAt + 4 * nparts, pts = st === 31 ? typesAt + 4 * nparts : typesAt;
      const zs = pts + 16 * np + 16;
      const P = j => [dv.getFloat64(pts + 16 * j, true), dv.getFloat64(pts + 16 * j + 8, true), hasZ ? dv.getFloat64(zs + 8 * j, true) : 0];
      for (let p = 0; p < nparts; p++) {
        const a = dv.getInt32(partsAt + 4 * p, true), e = p + 1 < nparts ? dv.getInt32(partsAt + 4 * p + 4, true) : np;
        const V = []; for (let j = a; j < e; j++) V.push(...P(j));
        if (st === 31) {
          const pt = dv.getInt32(typesAt + 4 * p, true), n = e - a;
          if (pt === 0) for (let j = 0; j + 2 < n; j++) tris.push(...V.slice(3 * j, 3 * j + 9)); // 三角形の帯
          else if (pt === 1) for (let j = 1; j + 1 < n; j++) tris.push(...V.slice(0, 3), ...V.slice(3 * j, 3 * j + 6)); // 扇
          else lines.push({ V, closed: true });
        } else lines.push({ V, closed: st === 5 || st === 15 || st === 25 });
      }
    }
    o = c + len; rec++;
    if ((rec & 1023) === 0) ctx.progress(o / b.length);
  }
  if (lines.length) addLines(sink, lines);
  if (tris.length) addMesh(sink, Float64Array.from(tris), Uint32Array.from({ length: tris.length / 3 }, (_, j) => j));
  const TYPES = { 1: '点', 11: '点（Z）', 21: '点（M）', 8: '複数点', 18: '複数点（Z）', 28: '複数点（M）', 3: '線', 13: '線（Z）', 23: '線（M）', 5: '多角形', 15: '多角形（Z）', 25: '多角形（M）', 31: 'マルチパッチ' };
  return { format: `シェープファイル（${TYPES[type] || type}、図形 ${rec.toLocaleString()} 個${dbf && dbf.names.length ? `、属性 ${dbf.names.join(' ')}` : ''}）`, note: lines.length ? '線の上に点を並べて表示しています' : '' };
}

// ------------------------------------------------------------------ PDMS（AVEVA のプラント設計のマクロ）
//   NEW 部品 … END の入れ子。位置（AT E/N/U）と向き（ORIENTED X IS … AND Y IS …）は親からの相対
//   CloudCompare と同じく、円柱・円錐・スナウト・箱・皿・円環・押し出しを形にする（長さは mm → m に直す）
const DIRS = { E: [1, 0, 0], EST: [1, 0, 0], EAST: [1, 0, 0], X: [1, 0, 0], W: [-1, 0, 0], WEST: [-1, 0, 0], N: [0, 1, 0], NORTH: [0, 1, 0], Y: [0, 1, 0], S: [0, -1, 0], SOUTH: [0, -1, 0], U: [0, 0, 1], UP: [0, 0, 1], Z: [0, 0, 1], D: [0, 0, -1], DOWN: [0, 0, -1] };
const PRIMS = new Set(['BOX', 'CYLINDER', 'SLCYLINDER', 'CONE', 'SNOUT', 'DISH', 'CTORUS', 'RTORUS', 'EXTRUSION', 'PYRAMID', 'NBOX', 'NXTRUSION']);
export const readPDMS = guard('PDMS', readPDMS_);
async function readPDMS_(src, sink, ctx) {
  const toks = decode(await src.all()).replace(/--.*$/gm, '').split(/[\s,]+/).filter(Boolean);
  let unit = 0.001; // 既定はミリ
  const units = new Set(); // 部品が使った単位（注記に出す）
  const root = { kind: 'ROOT', children: [], pos: [0, 0, 0], axes: null, p: {} };
  const stack = [root];
  let lastLoop = null;
  const num = t => { const m = /^([-+]?[\d.]+(?:e[-+]?\d+)?)(mm|m)?$/i.exec(t); if (!m) return NaN; const v = Number(m[1]); return m[2] ? v * (m[2].toLowerCase() === 'm' ? 1 / unit : 0.001 / unit) : v; };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].toUpperCase(), top = stack[stack.length - 1];
    if (t === 'METRE' || t === 'METRES') unit = 1;
    else if (t === 'MM' || t === 'MILLIMETRE' || t === 'MILLIMETRES') unit = 0.001;
    else if (t === 'NEW') {
      const kind = (toks[++i] || '').toUpperCase();
      const node = { kind, children: [], pos: [0, 0, 0], axes: null, p: {}, unit };
      units.add(unit);
      if (toks[i + 1] && toks[i + 1].startsWith('/')) node.name = toks[++i];
      if (kind === 'LOOP') lastLoop = node;
      if (kind === 'VERTEX' && lastLoop) { node.p.isVertex = true; lastLoop.children.push(node); }
      else top.children.push(node);
      stack.push(node);
    } else if (t === 'END') { if (stack.length > 1) stack.pop(); }
    else if (t === 'AT' || t === 'POSITION') {
      const pos = [0, 0, 0];
      while (i + 2 < toks.length && DIRS[toks[i + 1].toUpperCase()] && Number.isFinite(num(toks[i + 2]))) {
        const d = DIRS[toks[++i].toUpperCase()], v = num(toks[++i]) * unit;
        for (let k = 0; k < 3; k++) pos[k] += d[k] * v;
      }
      if (toks[i + 1]?.toUpperCase() === 'WRT') { i++; if (toks[i + 1]?.startsWith('/')) i++; }
      top.pos = pos;
    } else if (t === 'ORIENTED') {
      // ORIENTED X IS E AND Y IS N（Z は残りから決める）
      const ax = {};
      while (i + 3 < toks.length && /^[XYZ]$/i.test(toks[i + 1]) && toks[i + 2].toUpperCase() === 'IS') {
        const a = toks[i + 1].toUpperCase(); i += 3;
        ax[a] = DIRS[toks[i].toUpperCase()] || [0, 0, 0];
        if (toks[i + 1]?.toUpperCase() === 'AND') i++;
      }
      const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (ax.X && ax.Y && !ax.Z) ax.Z = cross(ax.X, ax.Y);
      if (ax.Y && ax.Z && !ax.X) ax.X = cross(ax.Y, ax.Z);
      if (ax.Z && ax.X && !ax.Y) ax.Y = cross(ax.Z, ax.X);
      if (ax.X && ax.Y && ax.Z) top.axes = [ax.X, ax.Y, ax.Z];
    } else if (/^(DIAMETER|RADIUS|HEIGHT|XLENGTH|YLENGTH|ZLENGTH|DTOP|DBOTTOM|XOFF|YOFF|RINSIDE|ROUTSIDE|ANGLE|XTOP|YTOP|XBOTTOM|YBOTTOM)$/.test(t)) {
      const v = num(toks[i + 1]);
      if (Number.isFinite(v)) { top.p[t] = t === 'ANGLE' ? v : v * unit; i++; }
    } else if ((t === 'X' || t === 'Y') && top.kind === 'VERTEX') {
      const v = num(toks[i + 1]); if (Number.isFinite(v)) { top.p[t] = v * unit; i++; }
    }
  }
  // 部品ごとに三角形を作る
  const V = [], T = [], C = [];
  const PAL = [[200, 80, 60], [90, 120, 200], [60, 170, 90], [220, 180, 60], [160, 100, 190], [80, 180, 190]];
  let count = 0;
  const walk = (node, O, A, depth = 0) => {
    if (depth > 200) throw new Error('PDMS の部品の入れ子が深すぎます（200 段まで。ファイルが壊れている可能性があります）');
    // 親の座標系での位置・向き → 世界の座標系へ
    const pos = [0, 1, 2].map(k => O[k] + A[0][k] * node.pos[0] + A[1][k] * node.pos[1] + A[2][k] * node.pos[2]);
    const ax = node.axes ? node.axes.map(a => [0, 1, 2].map(k => A[0][k] * a[0] + A[1][k] * a[1] + A[2][k] * a[2])) : A;
    if (PRIMS.has(node.kind)) {
      const g = primitive(node);
      if (g) {
        const base = V.length / 3, col = PAL[count++ % PAL.length];
        for (let j = 0; j < g.V.length; j += 3) {
          const x = g.V[j], y = g.V[j + 1], z = g.V[j + 2];
          V.push(pos[0] + ax[0][0] * x + ax[1][0] * y + ax[2][0] * z, pos[1] + ax[0][1] * x + ax[1][1] * y + ax[2][1] * z, pos[2] + ax[0][2] * x + ax[1][2] * y + ax[2][2] * z);
          C.push(...col);
        }
        for (const k of g.T) T.push(base + k);
      }
    }
    for (const c of node.children) if (!c.p.isVertex) walk(c, pos, ax, depth + 1);
  };
  walk(root, [0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  if (!V.length) throw new Error('PDMS に形（円柱・箱など）が見つかりません');
  ctx.progress(1);
  addMesh(sink, Float64Array.from(V), Uint32Array.from(T), Uint8Array.from(C));
  return { format: `PDMS（部品 ${count} 個${units.has(1) ? '、単位 m' : ''}）`, note: '面の上に点を散らして表示しています' + (units.has(0.001) ? '（mm を m に直しています）' : '') };
}

// 部品の形（部品の中心・Z 軸が上）
function primitive(n) {
  const p = n.p, seg = 48;
  const V = [], T = [];
  const ring = (r, z, dx = 0, dy = 0) => { const s = V.length / 3; for (let i = 0; i < seg; i++) { const a = 2 * Math.PI * i / seg; V.push(dx + r * Math.cos(a), dy + r * Math.sin(a), z); } return s; };
  const band = (a, b) => { for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; T.push(a + i, b + i, b + j, a + i, b + j, a + j); } };
  const cap = (a, z, dx = 0, dy = 0) => { const c = V.length / 3; V.push(dx, dy, z); for (let i = 0; i < seg; i++) T.push(c, a + i, a + (i + 1) % seg); };
  switch (n.kind) {
    case 'BOX': case 'NBOX': {
      const x = (p.XLENGTH || 0) / 2, y = (p.YLENGTH || 0) / 2, z = (p.ZLENGTH || 0) / 2;
      for (const s of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) V.push(s[0] * x, s[1] * y, s[2] * z);
      T.push(0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7);
      return { V, T };
    }
    case 'CYLINDER': case 'SLCYLINDER': case 'CONE': case 'SNOUT': {
      const h = p.HEIGHT || 0;
      const rb = n.kind.includes('CYLINDER') ? (p.DIAMETER ? p.DIAMETER / 2 : p.RADIUS || 0) : (p.DBOTTOM || 0) / 2;
      const rt = n.kind.includes('CYLINDER') ? rb : (p.DTOP || 0) / 2;
      const a = ring(rb, -h / 2), b = ring(rt, h / 2, p.XOFF || 0, p.YOFF || 0);
      band(a, b); cap(a, -h / 2); cap(b, h / 2, p.XOFF || 0, p.YOFF || 0);
      return { V, T };
    }
    case 'DISH': {
      const r = (p.DIAMETER || 0) / 2, h = p.HEIGHT || 0, st = 12;
      let prev = ring(r, 0);
      for (let k = 1; k <= st; k++) { const t = k / st; const nx = ring(r * Math.cos(t * Math.PI / 2), h * Math.sin(t * Math.PI / 2)); band(prev, nx); prev = nx; }
      return { V, T };
    }
    case 'CTORUS': case 'RTORUS': {
      const ri = p.RINSIDE || 0, ro = p.ROUTSIDE || 0, ang = (p.ANGLE || 360) * Math.PI / 180;
      const R = (ri + ro) / 2, r = (ro - ri) / 2, st = 36, s0 = V.length / 3;
      for (let i = 0; i <= st; i++) { const a = ang * i / st; for (let j = 0; j < seg; j++) { const b = 2 * Math.PI * j / seg; const rr = R + r * Math.cos(b); V.push(rr * Math.cos(a), rr * Math.sin(a), (n.kind === 'RTORUS' ? (p.HEIGHT || 2 * r) / 2 / r : 1) * r * Math.sin(b)); } }
      for (let i = 0; i < st; i++) for (let j = 0; j < seg; j++) { const a = s0 + i * seg + j, b = s0 + i * seg + (j + 1) % seg, c = a + seg, d = b + seg; T.push(a, c, d, a, d, b); }
      return { V, T };
    }
    case 'EXTRUSION': case 'NXTRUSION': {
      const loop = n.children.find(c => c.kind === 'LOOP');
      const pts = loop ? loop.children.filter(c => c.kind === 'VERTEX').map(v => [(v.p.X || 0) + v.pos[0], (v.p.Y || 0) + v.pos[1]]) : [];
      if (pts.length < 3) return null;
      const h = p.HEIGHT || 0, m = pts.length;
      for (const [x, y] of pts) V.push(x, y, 0);
      for (const [x, y] of pts) V.push(x, y, h);
      for (let i = 0; i < m; i++) { const j = (i + 1) % m; T.push(i, j, m + j, i, m + j, m + i); }
      for (let i = 1; i + 1 < m; i++) T.push(0, i + 1, i, m, m + i, m + i + 1);
      return { V, T };
    }
    case 'PYRAMID': {
      const xb = (p.XBOTTOM || 0) / 2, yb = (p.YBOTTOM || 0) / 2, xt = (p.XTOP || 0) / 2, yt = (p.YTOP || 0) / 2, h = (p.HEIGHT || 0) / 2, dx = p.XOFF || 0, dy = p.YOFF || 0;
      V.push(-xb, -yb, -h, xb, -yb, -h, xb, yb, -h, -xb, yb, -h, dx - xt, dy - yt, h, dx + xt, dy - yt, h, dx + xt, dy + yt, h, dx - xt, dy + yt, h);
      T.push(0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7);
      return { V, T };
    }
  }
  return null;
}
void extOf;
