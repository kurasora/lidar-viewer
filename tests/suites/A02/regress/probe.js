// 0.4.1 から: 画面は全部の点を持たない（描いたら捨てる）。全部の座標・色は別スレッドから __pcd.call({ type: "buffers", id }) で借りる
// 読み込んだ点群を「期待値」と比べるための集計（Node・Chromium・Electron で共通）
//   summarize(files, offset, spec) → 1 ファイルごとの集計
//     files: [{ name, n, total, positions(Float32Array, offset を引いた値), rgb(Uint8Array|null), fmt, note, fields[] }]
//     spec : { parts: [{ name, box:[x0,y0,z0,x1,y1,z1] }] }   … 部品の箱（世界座標）。箱ごとの点数と平均色を数える
//   check(result, expect) → 食い違いの一覧（文字列の配列）
(function (root) {
  function summarize(files, offset, spec) {
    const o = offset || [0, 0, 0];
    const parts = (spec && spec.parts) || [];
    return files.map(f => {
      const P = f.positions, C = f.rgb, n = f.n;
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], m = [0, 0, 0], cm = [0, 0, 0];
      const pc = parts.map(() => ({ count: 0, c: [0, 0, 0], xs: new Set() }));
      let stray = 0, nan = 0;
      const strayEx = [];
      for (let i = 0; i < n; i++) {
        const x = P[3 * i] + o[0], y = P[3 * i + 1] + o[1], z = P[3 * i + 2] + o[2];
        if (!(x === x && y === y && z === z)) { nan++; continue; }
        if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z;
        if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z;
        m[0] += x; m[1] += y; m[2] += z;
        if (C) { cm[0] += C[3 * i]; cm[1] += C[3 * i + 1]; cm[2] += C[3 * i + 2]; }
        if (parts.length) {
          let hit = -1;
          for (let k = 0; k < parts.length; k++) {
            const b = parts[k].box;
            if (x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5]) { hit = k; break; }
          }
          if (hit < 0) { stray++; if (strayEx.length < 5) strayEx.push([+x.toFixed(4), +y.toFixed(4), +z.toFixed(4)]); }
          else { const q = pc[hit]; q.count++; if (q.xs.size < 20000) q.xs.add(x); if (C) { q.c[0] += C[3 * i]; q.c[1] += C[3 * i + 1]; q.c[2] += C[3 * i + 2]; } }
        }
      }
      const k = Math.max(1, n - nan);
      return {
        name: f.name, n, total: f.total, nan, fmt: f.fmt || '', note: f.note || '', fields: f.fields || [], rgb: !!C,
        min: lo.map(v => +v.toFixed(5)), max: hi.map(v => +v.toFixed(5)), mean: m.map(v => +(v / k).toFixed(5)),
        color: C ? cm.map(v => +(v / k).toFixed(2)) : null,
        parts: pc.map((q, j) => ({ name: parts[j].name, count: q.count, frac: +(q.count / k).toFixed(5), color: C && q.count ? q.c.map(v => +(v / q.count).toFixed(2)) : null, distinctX: q.xs.size })),
        stray, strayFrac: +(stray / k).toFixed(6), strayEx, fieldStats: f.fieldStats || null,
      };
    });
  }
  const near = (a, b, t) => Math.abs(a - b) <= t;
  function check(r, e) {
    // r: { msg, msgIsError, files:[summary], offset }  e: 期待値
    if (e.perFile) {
      // 複数のファイルを一度に開く組: ファイルごとの期待値（名前で対応づけ）
      const bad = [];
      const nf = e.nfiles ?? e.perFile.length;
      if (r.files.length !== nf) bad.push(`開いたファイル数 ${r.files.length}（期待 ${nf}）${r.msg ? '　知らせ: ' + r.msg : ''}`);
      if (e.msg && !new RegExp(e.msg).test(r.msg || '')) bad.push(`知らせが期待と違う: 「${r.msg}」（期待 /${e.msg}/）`);
      e.perFile.forEach(pe => {
        const i = r.files.findIndex(f => f.name === pe.name);
        if (i < 0) { bad.push(`${pe.name} が開かれていない`); return; }
        for (const b of check({ ...r, files: [r.files[i]] }, { ...pe.expect, nfiles: 1 })) bad.push(`${pe.name}: ${b}`);
      });
      return bad;
    }
    const bad = [];
    if (e.error) {
      if (!new RegExp(e.error).test(r.msg || '')) bad.push(`知らせが期待と違う: 「${r.msg}」（期待 /${e.error}/）`);
      if (e.nfiles !== undefined && r.files.length !== e.nfiles) bad.push(`ファイル数 ${r.files.length}（期待 ${e.nfiles}）`);
      return bad;
    }
    if (e.msg && !new RegExp(e.msg).test(r.msg || '')) bad.push(`知らせが期待と違う: 「${r.msg}」（期待 /${e.msg}/）`);
    const nf = e.nfiles ?? 1;
    if (r.files.length !== nf) { bad.push(`開いたファイル数 ${r.files.length}（期待 ${nf}）${r.msg ? '　知らせ: ' + r.msg : ''}`); if (!r.files.length) return bad; }
    const f = r.files[e.fileIndex || 0];
    if (!f) return bad;
    if (e.n && !(f.n >= e.n[0] && f.n <= e.n[1])) bad.push(`点数 ${f.n}（期待 ${e.n[0]}〜${e.n[1]}）`);
    if (f.nan) bad.push(`座標が NaN の点 ${f.nan}`);
    const t = e.tol ?? 1e-3;
    if (e.bbox) for (let k = 0; k < 3; k++) {
      if (!near(f.min[k], e.bbox[0][k], t)) bad.push(`最小${'xyz'[k]} ${f.min[k]}（期待 ${e.bbox[0][k]}）`);
      if (!near(f.max[k], e.bbox[1][k], t)) bad.push(`最大${'xyz'[k]} ${f.max[k]}（期待 ${e.bbox[1][k]}）`);
    }
    if (e.mean) for (let k = 0; k < 3; k++) if (!near(f.mean[k], e.mean[k], e.mtol ?? t * 10)) bad.push(`平均${'xyz'[k]} ${f.mean[k]}（期待 ${e.mean[k]}）`);
    if (e.rgb !== undefined && f.rgb !== e.rgb) bad.push(`色の有無 ${f.rgb}（期待 ${e.rgb}）`);
    if (e.color && f.color) for (let k = 0; k < 3; k++) if (!near(f.color[k], e.color[k], e.ctol ?? 3)) { bad.push(`全体の平均色 ${f.color.join(',')}（期待 ${e.color.join(',')}）`); break; }
    if (e.fmt && !new RegExp(e.fmt).test(f.fmt)) bad.push(`形式の表示「${f.fmt}」（期待 /${e.fmt}/）`);
    if (e.note !== undefined && !new RegExp(e.note).test(f.note)) bad.push(`注記「${f.note}」（期待 /${e.note}/）`);
    if (e.fields) for (const x of e.fields) if (!f.fields.includes(x)) bad.push(`値の欄 ${x} がない（${f.fields.join(' ')}）`);
    if (e.noFields) for (const x of e.noFields) if (f.fields.includes(x)) bad.push(`値の欄 ${x} があってはいけない`);
    if (e.fieldRange) for (const [nm, [a, b, tt]] of Object.entries(e.fieldRange)) {
      const st = f.fieldStats && f.fieldStats[nm];
      if (!st) { bad.push(`値の欄 ${nm} の統計がない`); continue; }
      if (!near(st.min, a, tt ?? 1e-3) || !near(st.max, b, tt ?? 1e-3)) bad.push(`値の欄 ${nm} の範囲 ${st.min}〜${st.max}（期待 ${a}〜${b}）`);
    }
    if (e.offset && r.offset) for (let k = 0; k < 3; k++) if (!near(r.offset[k], e.offset[k], 1e-6)) { bad.push(`シフト ${r.offset}（期待 ${e.offset}）`); break; }
    if (e.parts) e.parts.forEach((p, j) => {
      const q = f.parts[j];
      if (!q) return;
      if (p.frac && !(q.frac >= p.frac[0] && q.frac <= p.frac[1])) bad.push(`部品 ${p.name} の点の割合 ${q.frac}（期待 ${p.frac[0]}〜${p.frac[1]}）`);
      if (p.minCount !== undefined && q.count < p.minCount) bad.push(`部品 ${p.name} の点数 ${q.count}（期待 ${p.minCount} 以上）`);
      if (p.maxCount !== undefined && q.count > p.maxCount) bad.push(`部品 ${p.name} の点数 ${q.count}（期待 ${p.maxCount} 以下）`);
      if (p.minDistinctX !== undefined && q.distinctX < p.minDistinctX) bad.push(`部品 ${p.name} の x 座標の種類が ${q.distinctX} 個しかない（float32 の丸めで段々になっている。期待 ${p.minDistinctX} 以上）`);
      if (p.color && q.color) for (let k = 0; k < 3; k++) if (!near(q.color[k], p.color[k], p.ctol ?? 4)) { bad.push(`部品 ${p.name} の色 ${q.color.join(',')}（期待 ${p.color.join(',')}）`); break; }
    });
    if (e.strayMax !== undefined && f.strayFrac > e.strayMax) bad.push(`どの部品にも入らない点 ${f.stray}（${(f.strayFrac * 100).toFixed(3)}%、例 ${JSON.stringify(f.strayEx)}）`);
    return bad;
  }
  const api = { summarize, check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.__probe = api;
})(typeof window !== 'undefined' ? window : globalThis);
