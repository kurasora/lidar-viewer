// 0.4.1 から: 画面には全部の点を持たない（f.positions はなく、先頭 20 万点の標本 f.sample だけ。点は読み込み時に混ぜてあるので無作為な標本）
// 読み込んだ点の範囲と平均（シフトを足した元の座標）、形式の説明、距離の単位の表示
const P = window.__pcd, S = P.S, f = S.files[0];
if (!f) return { msg: H.text('statMsg') };
const o = S.offset, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], m = [0, 0, 0];
for (let i = 0; i < (f.sample.length / 3); i++) for (let k = 0; k < 3; k++) { const v = f.sample[3 * i + k] + o[k]; m[k] += v; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
return { n: f.n, header: f.header, lo, hi, mean: m.map(v => v / f.n), info: H.info(), level: S.levelInfo && { tilt: S.levelInfo.tiltDeg, yaw: S.levelInfo.yawDeg, floorZ: S.levelInfo.floorZ }, msg: H.text('statMsg'), levelResult: H.text('levelResult') };
