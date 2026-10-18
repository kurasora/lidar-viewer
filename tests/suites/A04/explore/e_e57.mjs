import { read, tryRead, show } from './lib.mjs';
import { buildE57 } from '../regress/e57w.mjs';

const g = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296; })();
// 1) ビット幅 1〜53 の Integer（強度）と、負の最小値をもつ ScaledInteger の座標。パケットの境目を細かく（chunk 1〜9）
let fails = [];
for (let bits = 1; bits <= 53; bits++) {
  for (const chunk of [1, 3, 7, 4096]) {
    const max = 2 ** bits - 1;
    const n = 40;
    const recs = [];
    for (let i = 0; i < n; i++) {
      const iv = i === 0 ? 0 : i === 1 ? max : Math.floor(g() * (max + 1));
      recs.push([(-500 + i) * 0.001 - 3.25, i * 0.5, 0.125 * i, iv]);
    }
    const fields = [
      { name: 'cartesianX', type: 'ScaledInteger', min: -10000, max: 100000, scale: 0.001, offset: -3 },
      { name: 'cartesianY', type: 'Float', precision: 'double' },
      { name: 'cartesianZ', type: 'Float', precision: 'single' },
      { name: 'intensity', type: 'Integer', min: 0, max },
    ];
    const t = await tryRead('b.e57', buildE57({ scans: [{ fields, records: recs, chunk }] }));
    if (!t.ok) { fails.push(`bits=${bits} chunk=${chunk}: ${t.error}`); continue; }
    const r = t.r;
    let bad = 0;
    for (let i = 0; i < n; i++) {
      const p = r.pt(i);
      if (Math.abs(p[0] - recs[i][0]) > 2e-6 || Math.abs(p[1] - recs[i][1]) > 1e-6 || Math.abs(p[2] - recs[i][2]) > 1e-6) bad++;
      if (Math.fround(recs[i][3]) !== r.fields.intensity[i]) bad++;
    }
    if (r.n !== n || bad) fails.push(`bits=${bits} chunk=${chunk}: n=${r.n} 不一致 ${bad}`);
  }
}
show('E57 ビット幅 1〜53 × chunk 1/3/7/4096', fails.length ? fails.slice(0, 8) : 'すべて一致');
// 2) 定数の欄（bits 0）と無効な点（cartesianInvalidState）
{
  const fields = [
    { name: 'cartesianX', type: 'Float' }, { name: 'cartesianY', type: 'Float' }, { name: 'cartesianZ', type: 'Float' },
    { name: 'cartesianInvalidState', type: 'Integer', min: 0, max: 2 },
    { name: 'rowIndex', type: 'Integer', min: 7, max: 7 },
  ];
  const recs = [[1, 1, 1, 0, 7], [2, 2, 2, 2, 7], [3, 3, 3, 1, 7], [4, 4, 4, 0, 7]];
  const r = await read('inv.e57', buildE57({ scans: [{ fields, records: recs, chunk: 1 }] }));
  show('無効な点（state 1・2）を除く', [r.n, r.pt(0), r.pt(1)]);
}
// 3) 球座標
{
  const fields = [{ name: 'sphericalRange', type: 'Float' }, { name: 'sphericalAzimuth', type: 'Float' }, { name: 'sphericalElevation', type: 'Float' }];
  const recs = [[2, 0, 0], [2, Math.PI / 2, 0], [2, 0, Math.PI / 2], [Math.SQRT2, Math.PI / 4, 0]];
  const r = await read('sph.e57', buildE57({ scans: [{ fields, records: recs }] }));
  show('球座標', [0, 1, 2, 3].map(i => r.pt(i).map(v => +v.toFixed(6))));
}
// 4) 姿勢（z 軸まわり 90 度 + 平行移動）
{
  const fields = [{ name: 'cartesianX', type: 'Float' }, { name: 'cartesianY', type: 'Float' }, { name: 'cartesianZ', type: 'Float' }];
  const c = Math.SQRT1_2;
  const r = await read('pose.e57', buildE57({ scans: [{ fields, records: [[1, 0, 0], [0, 1, 0]], pose: { q: [c, 0, 0, c], t: [10, 20, 30] } }] }));
  show('姿勢 z 90 度 + (10,20,30)', [r.pt(0).map(v => +v.toFixed(6)), r.pt(1).map(v => +v.toFixed(6)), '期待 [10,21,30] [9,20,30]']);
  const r2 = await read('pose2.e57', buildE57({ scans: [{ fields, records: [[1, 0, 0]], pose: { q: [2 * c, 0, 0, 2 * c] } }] }));
  show('正規化されていない四元数（長さ 2）', [r2.pt(0).map(v => +v.toFixed(6)), '期待 [0,1,0]']);
}
// 5) 2 つのスキャン: 1 つ目は色なし・強度あり、2 つ目は色あり・強度なし
{
  const xyz = [{ name: 'cartesianX', type: 'Float' }, { name: 'cartesianY', type: 'Float' }, { name: 'cartesianZ', type: 'Float' }];
  const s1 = { fields: [...xyz, { name: 'intensity', type: 'Integer', min: 0, max: 4095 }], records: Array.from({ length: 50 }, (_, i) => [i, 0, 0, 1000 + i]) };
  const s2 = { fields: [...xyz, { name: 'colorRed', type: 'Integer', min: 0, max: 255 }, { name: 'colorGreen', type: 'Integer', min: 0, max: 255 }, { name: 'colorBlue', type: 'Integer', min: 0, max: 255 }], records: Array.from({ length: 50 }, (_, i) => [i, 100, 0, 255, 0, 0]) };
  const file = buildE57({ scans: [s1, s2] });
  const r = await read('mix.e57', file);
  const c1 = new Map(), c2 = new Map();
  for (let i = 0; i < r.n; i++) { const p = r.pt(i); const key = r.col(i).join(','); (p[1] < 50 ? c1 : c2).set(key, (c1.get(key) || 0) + 1); }
  show('色なしスキャン → 色ありスキャン: 1 つ目の点の色', [...c1.keys()]);
  // 間引きあり（cap 30）: 2 つ目のスキャンの点に 1 つ目の強度が残るか
  const rs = await read('mix.e57', file, { cap: 30 });
  let stale = 0, s2n = 0;
  for (let i = 0; i < rs.n; i++) { const p = rs.pt(i); if (p[1] > 50) { s2n++; if (rs.fields.intensity[i] !== 0) stale++; } }
  show('cap 30: 強度のないスキャンの点に強度が入っている数', `${stale} / ${s2n}`);
}
// 6) Integer で minimum/maximum を省略（規格の既定は −2^63〜2^63−1）
{
  const fields = [{ name: 'cartesianX', type: 'Float' }, { name: 'cartesianY', type: 'Float' }, { name: 'cartesianZ', type: 'Float' }];
  const file = buildE57({ scans: [{ fields: [...fields, { name: 'intensity', type: 'Float' }], records: [[1, 2, 3, 7], [4, 5, 6, 8]] }] });
  const r = await read('ok.e57', file);
  show('Float の強度（min/max なし）', Array.from(r.fields.intensity));
}
// 7) recordCount が実際より多い（データが途中で切れている）
{
  const fields = [{ name: 'cartesianX', type: 'Float' }, { name: 'cartesianY', type: 'Float' }, { name: 'cartesianZ', type: 'Float' }];
  const file = buildE57({ scans: [{ fields, records: [[1, 2, 3], [4, 5, 6]], recordCount: 1000 }] });
  const t = await tryRead('trunc.e57', file);
  show('recordCount 1000・実際 2 点', t.ok ? `エラーなし n=${t.r.n}` : t.error);
}
