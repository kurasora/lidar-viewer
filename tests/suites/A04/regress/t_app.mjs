// src/app.js の中の純粋な関数（取り出して実行）
import { test, eq, ok, near, setFile } from './lib/harness.mjs';
import { appFns, vertexShader } from './lib/appfns.mjs';
setFile('t_app');
const A = appFns();
test('OK-AP01', 'fmt・fmtN・percentile', () => {
  eq([A.fmt(1.005), A.fmt(NaN), A.fmt(null), A.fmt(Infinity), A.fmt(2.5, 0), A.fmt(-1.234, 1)], [(1.005).toFixed(2), '—', '—', '—', '3', '-1.2']);
  eq([A.fmtN(1234567)], ['1,234,567']);
  eq([A.percentile([], 0.5), A.percentile([1, 2, 3], 0), A.percentile([1, 2, 3], 1), A.percentile([1, 2, 3, 4], 0.5)], [0, 1, 3, 3]);
});
test('OK-AP02', 'findCeiling: 床 0 m・天井 2.6 m の高さの分布で天井（2.6 − 0.2 付近）を見つける', () => {
  const z = []; for (let i = 0; i < 100000; i++) { const t = i % 10; z.push(t < 4 ? (i % 7) * 0.003 : t < 8 ? 2.6 + (i % 5) * 0.004 : (i * 0.6180339887) % 2.6); }
  z.sort((a, b) => a - b);
  const c = A.findCeiling(z); ok(c && Math.abs(c.z - 2.4) < 0.1, JSON.stringify(c));
});
for (const range of [8000, 20000, 100000]) {
  test('A04-015', `findCeiling: 高さの範囲が ${range} m（DEM・16 bit のラスター）でも例外を出さない`, () => {
    const z = []; for (let i = 0; i < 400000; i++) z.push((i / 400000) * range);
    try { A.findCeiling(z); } catch (e) { throw new Error(`${e.name}: ${e.message}`); }
  });
}
test('A04-016', 'カテゴリの色: 値の幅が 64 以上（例 {0, 100, 200}）でも、画面の色と凡例の色が一致し、別の値が同じ色にならない', () => {
  const vs = vertexShader(), m = /clamp\(floor\(scalar - uCatMin \+ 0\.5\), 0\.0, ([\d.]+)\)/.exec(vs);
  ok(m, 'シェーダーのカテゴリの式が見つからない');
  const maxIdx = Number(m[1]), C = A.CAT_COLORS, vals = [0, 100, 200];
  const shader = v => C[Math.min(maxIdx, Math.max(0, Math.floor(v - vals[0] + 0.5))) % C.length], legend = v => C[(v - vals[0]) % C.length];
  const mism = vals.filter(v => shader(v) !== legend(v));
  ok(!mism.length, `画面と凡例が違う値 ${mism.map(v => `${v}（画面 ${shader(v)}・凡例 ${legend(v)}）`).join(' ')}`);
  ok(new Set(vals.map(shader)).size === vals.length, `画面で同じ色になる値がある: ${vals.map(v => `${v}→${shader(v)}`).join(' ')}`);
});
test('OK-AP03', 'updateEq: 均等化の表は単調で 0〜255。点が少ない・lo=hi なら直線', () => {
  const z = []; for (let i = 0; i < 10000; i++) z.push(i < 8000 ? 0 : i / 10000);
  A.updateEq(z, 0, 1);
  for (let i = 1; i < 1024; i++) ok(A.eqData[4 * i] >= A.eqData[4 * (i - 1)], `単調でない i=${i}`);
  eq([A.eqData[0] <= 5, A.eqData[4 * 1023]], [true, 255]);
  A.updateEq([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], 5, 5); eq([A.eqData[0], A.eqData[4 * 1023]], [0, 255]);
});
test('OK-AP04', 'CMAPS: 0〜1 で色の成分が −0.05〜1.05 の間（テクスチャでは 0〜1 に切る）', () => {
  for (const [k, f] of Object.entries(A.CMAPS)) for (let i = 0; i <= 1000; i++) for (const v of f(i / 1000)) ok(v > -0.05 && v < 1.05, `${k}(${i / 1000}) = ${v}`);
});
const file = (name, text) => ({ name, slice: (a, b) => ({ text: async () => text.slice(a, b) }) });
test('OK-AP05', 'isTrajectory: .tum・.mcap・名前（traj/odom/pose/path）・1 行目の見出し・8 列で単位四元数', async () => {
  for (const [nm, txt, want] of [['a.tum', '', true], ['a.mcap', '', true], ['traj.txt', '1 2 3', true], ['ODOM.CSV', 'x', true], ['data.txt', '1700000000.1 1 2 3 0 0 0 1\n', true], ['gt.csv', '#timestamp,x,y,z\n', true], ['scan.txt', '1 2 3 4 5 6 7 8\n', false], ['cloud.xyz', '1 2 3', false]])
    eq(await A.isTrajectory(file(nm, txt)), want, `${nm} ${JSON.stringify(txt)}`);
});
test('A04-041', 'isTrajectory: 時刻が 0 から始まる TUM 形式の .txt（相対時刻）も軌跡と判定する', async () => {
  eq(await A.isTrajectory(file('result.txt', '0.0 1 2 3 0 0 0 1\n0.1 1 2 3 0 0 0 1\n')), true);
});
test('OK-AP06', 'companionsOf: .sbf.data・.shp の付属・.mtl・glTF の .bin と画像は単独で開かない。CloudCompare の .bin は開く', () => {
  const names = ['a.shp', 'a.dbf', 'A.SHX', 'b.dbf', 'c.sbf', 'c.sbf.data', 'm.gltf', 'm.bin', 'tex.png', 'x.mtl'];
  const f = A.companionsOf(names.map(n => ({ name: n })));
  eq(names.filter(n => f({ name: n })), ['a.dbf', 'A.SHX', 'c.sbf.data', 'm.bin', 'tex.png', 'x.mtl']);
  const g = A.companionsOf([{ name: 'cloud.bin' }, { name: 'photo.jpg' }]);
  eq(['cloud.bin', 'photo.jpg'].filter(n => g({ name: n })), []);
});
test('OK-AP07', 'pickerTypes: 「すべて」を先頭に、形式ごとに 1 行。拡張子は重複なしで . から始まる英数字', () => {
  const t = A.pickerTypes(A.OPEN_TYPES, 'すべて'), all = t[0].accept['application/octet-stream'];
  eq([t.length, t[0].description, new Set(all).size === all.length], [A.OPEN_TYPES.length + 1, 'すべて', true]);
  for (const x of t) for (const e of x.accept['application/octet-stream']) ok(/^\.[a-z0-9]{1,15}$/.test(e), e);
});
test('OK-AP08', 'escapeHtml・stripIpc', () => {
  eq(A.escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  eq(A.stripIpc("Error invoking remote method 'live:open': Error: ポートが使われています"), 'ポートが使われています');
});
test('A04-044', 'companionsOf: glTF と一緒に選んだ、glTF が参照しない CloudCompare の .bin・写真は単独で開く（付属扱いにしない）', () => {
  const f = A.companionsOf([{ name: 'model.gltf' }, { name: 'cloud.bin' }, { name: 'photo.jpg' }]);
  eq(['cloud.bin', 'photo.jpg'].filter(n => f({ name: n })), []);
});
test('A04-046', 'fmt: −0.001 を "-0.00" と表示しない', () => { eq(A.fmt(-0.001), '0.00'); });
test('A04-048', 'companionsOf: .icm と一緒に選んだ画像の目録（.wrl）は単独で開かない（「.wrl は開けない形式です」を出さない）', () => {
  const f = A.companionsOf([{ name: 'handmade_images.icm' }, { name: 'icm_cloud.asc' }, { name: 'icm_images.wrl' }]);
  eq(f({ name: 'icm_images.wrl' }), true);
});
