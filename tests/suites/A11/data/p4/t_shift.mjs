// Sink のグローバルシフトの決め方と Float32 の誤差を測る
import { Sink } from '/home/claude/pcd-viewer/src/io/sink.js';
function run(name, pts, offset = null) {
  const s = new Sink({ cap: 1e7, offset });
  for (const p of pts) s.slot(p[0], p[1], p[2]);
  const r = s.finish();
  let maxErr = 0, at = -1;
  for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) {
    const e = Math.abs(r.positions[3 * i + k] + r.offset[k] - pts[i][k]);
    if (e > maxErr) { maxErr = e; at = i; }
  }
  // 2 点の距離の誤差（最初の 2 つの「本物の」点の間）
  console.log(JSON.stringify({ name, offset: r.offset, maxErr_mm: +(maxErr * 1000).toFixed(3), worstPoint: pts[at] }));
  return r;
}
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const utm = (n) => Array.from({ length: n }, () => [539000 + 30 * rnd(), 3836000 + 30 * rnd(), 30 + 3 * rnd()]);
const A = utm(10000);
run('a1 UTM そのまま', A);
run('a2 UTM で最初の点だけ (0,0,0)', [[0, 0, 0], ...A]);
run('b  UTM で最初の点が遠くの外れ値 (1e7,1e7,0)', [[1e7, 1e7, 0], ...A]);
const L = Array.from({ length: 10000 }, () => [100 * rnd(), 100 * rnd(), 3 * rnd()]);
run('b2 局所の地図で最初の点が外れ値 (2e7,0,0)', [[2e7, 0, 0], ...L]);
run('c  2 つ目のファイル: 1 つ目が局所（シフト 0）で 2 つ目が UTM', A, [0, 0, 0]);
run('c2 2 つ目のファイル: 1 つ目が UTM で 2 つ目が局所', L, [539000, 3836000, 0]);
run('d  最初の点 x=9999（シフトなし）で残りは 9990〜30000', [[9999, 5, 0], ...Array.from({ length: 10000 }, () => [9990 + 20010 * rnd(), 5, 0])]);
run('e  UTM で 100 km に広がる地図', [[500000, 3800000, 0], ...Array.from({ length: 10000 }, () => [500000 + 1e5 * rnd(), 3800000 + 1e5 * rnd(), 50 * rnd()])]);
run('f  z だけ大きい（ECEF 風 z=4.3e6）', Array.from({ length: 10000 }, () => [-3.9e6 + 30 * rnd(), 3.4e6 + 30 * rnd(), 3.6e6 + 30 * rnd()]));
