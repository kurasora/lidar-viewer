import { appFns, vertexShader } from '../regress/lib/appfns.mjs';
import { show } from './lib.mjs';
const A = appFns();
show('fmt', [A.fmt(1.005), A.fmt(-0.001), A.fmt(NaN), A.fmt(null), A.fmt(Infinity), A.fmt(1e21), A.fmt(2.5, 0)]);
show('fmtN', [A.fmtN(1234567), A.fmtN(0.5)]);
show('percentile', [A.percentile([], 0.5), A.percentile([1, 2, 3], 0), A.percentile([1, 2, 3], 1), A.percentile([1, 2, 3, 4], 0.5)]);
// findCeiling: 高さの範囲が大きいとき
for (const range of [10, 1000, 5000, 6000, 8000, 20000, 100000]) {
  const z = []; for (let i = 0; i < 400000; i++) z.push((i / 400000) * range);
  try { const c = A.findCeiling(z); show(`findCeiling 高さの範囲 ${range} m（${Math.ceil(range * 0.99 / 0.05)} 区間）`, JSON.stringify(c)); }
  catch (e) { show(`findCeiling 高さの範囲 ${range} m（${Math.ceil(range * 0.99 / 0.05)} 区間）`, `${e.name}: ${e.message}`); }
}
// 廊下らしい高さ（床 0・天井 2.6）
{
  const z = []; for (let i = 0; i < 100000; i++) { const t = i % 10; z.push(t < 4 ? 0 + (i % 7) * 0.003 : t < 8 ? 2.6 + (i % 5) * 0.004 : (i % 260) / 100); }
  z.sort((a, b) => a - b); show('findCeiling 廊下（床 0・天井 2.6）', A.findCeiling(z));
}
// カテゴリの色: シェーダーの添字（clamp 0..63）と凡例（(v - min) % 12）
{
  const vs = vertexShader();
  const m = /clamp\(floor\(scalar - uCatMin \+ 0\.5\), 0\.0, ([\d.]+)\)/.exec(vs);
  const maxIdx = m ? Number(m[1]) : NaN;
  const C = A.CAT_COLORS;
  const shader = v => C[Math.min(maxIdx, Math.max(0, Math.floor(v - 0 + 0.5))) % C.length];
  const legend = v => C[(v - 0) % C.length];
  const vals = [0, 2, 6, 9, 17, 64, 65, 100, 200];
  show(`カテゴリ {${vals}}: シェーダーの上限 ${maxIdx}`, vals.map(v => `${v}:${shader(v) === legend(v) ? '一致' : `画面 ${shader(v)} / 凡例 ${legend(v)}`}`).join(' '));
}
// updateEq: 均等化の表が単調・0〜255
{
  const z = []; for (let i = 0; i < 10000; i++) z.push(i < 8000 ? 0 : i / 10000);
  A.updateEq(z, 0, 1);
  let mono = true; for (let i = 1; i < 1024; i++) if (A.eqData[4 * i] < A.eqData[4 * (i - 1)]) mono = false;
  show('updateEq 床に 80% 集中: 単調・端', [mono, A.eqData[0], A.eqData[4 * 1023], A.eqData[4 * 10]]);
  A.updateEq([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], 5, 5);
  show('updateEq lo=hi（全部同じ値）→ 直線', [A.eqData[0], A.eqData[4 * 512], A.eqData[4 * 1023]]);
  A.updateEq([NaN, NaN, 1, 2], 0, 3);
  show('updateEq NaN を含む・少ない → 直線', [A.eqData[0], A.eqData[4 * 1023]]);
}
// CMAPS: 0〜1 の外も 0〜1 に収まるか（テクスチャ作成では clamp している）
{
  const out = {}; for (const [k, f] of Object.entries(A.CMAPS)) { let mn = Infinity, mx = -Infinity; for (let i = 0; i <= 1000; i++) for (const v of f(i / 1000)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } out[k] = [mn.toFixed(3), mx.toFixed(3)]; }
  show('CMAPS の値の範囲（0〜1 の入力）', out);
}
// isTrajectory
const file = (name, text) => ({ name, slice: (a, b) => ({ text: async () => text.slice(a, b) }) });
for (const [nm, txt] of [
  ['a.tum', ''], ['a.mcap', ''], ['traj.txt', '1 2 3'], ['data.txt', '1700000000.1 1 2 3 0 0 0 1\n'], ['data.txt', '0.0 1 2 3 0 0 0 1\n0.1 1 2 3 0 0 0 1\n'],
  ['data.txt', '1700000000.1 1 2 3 0.70 0 0 0.70\n'], ['scan.txt', '1 2 3 4 5 6 7 8\n'], ['gt.csv', '#timestamp,x,y,z\n'], ['cloud.xyz', '1 2 3'], ['ODOM.CSV', 'x'],
]) show(`isTrajectory ${nm} ${JSON.stringify(txt.slice(0, 30))}`, await A.isTrajectory(file(nm, txt)));
// companionsOf
{
  const names = ['a.shp', 'a.dbf', 'A.SHX', 'b.dbf', 'c.sbf', 'c.sbf.data', 'm.gltf', 'm.bin', 'tex.png', 'x.mtl', 'cloud.bin', 'photo.jpg'];
  const f = A.companionsOf(names.map(n => ({ name: n })));
  show('companionsOf（付属として開かない）', names.filter(n => f({ name: n })));
  const g2 = A.companionsOf([{ name: 'cloud.bin' }, { name: 'photo.jpg' }]);
  show('companionsOf（CloudCompare の .bin と写真だけ）', ['cloud.bin', 'photo.jpg'].filter(n => g2({ name: n })));
}
// pickerTypes
{
  const t = A.pickerTypes(A.OPEN_TYPES, 'すべて');
  const all = t[0].accept['application/octet-stream'];
  show('pickerTypes: 種類の数・すべての拡張子の数・重複', [t.length, all.length, all.length !== new Set(all).size]);
  show('pickerTypes: 拡張子の形（. で始まり 16 文字以内・英数字）', t.flatMap(x => x.accept['application/octet-stream']).filter(e => !/^\.[a-z0-9]{1,15}$/.test(e)));
}
show('escapeHtml', A.escapeHtml(`<img src=x onerror="a('b')">&`));
