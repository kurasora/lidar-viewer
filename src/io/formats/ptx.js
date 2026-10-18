// PTX（Leica）: スキャンごとに 列数・行数・スキャナー位置・軸・4×4 の変換行列、続いて 列×行 個の点
//   点は x y z 強度 [r g b]。0 0 0 は「測れなかったマス」なので除く。変換は行ベクトル × 行列（最後の行が平行移動）
import { eachLine, numbersIn } from '../util.js';

export async function read(src, sink, ctx) {
  const v = new Float64Array(16);
  let state = 'cols', cols = 0, rows = 0, left = 0, hdr = 0, scans = 0, hasRgb = false;
  const M = new Float64Array(16);
  const fi = sink.field('intensity');
  await eachLine(src, 0, (b, s, e) => {
    const n = numbersIn(b, s, e, v);
    if (!n) return;
    if (state === 'cols') { cols = v[0]; state = 'rows'; return; }
    if (state === 'rows') { rows = v[0]; left = cols * rows; state = 'hdr'; hdr = 0; return; }
    if (state === 'hdr') {
      // 3 行（位置・3 軸）+ 4 行（変換行列）
      if (hdr >= 4) for (let j = 0; j < 4; j++) M[4 * (hdr - 4) + j] = v[j];
      if (++hdr === 8) { state = 'pts'; scans++; if (!left) state = 'cols'; }
      return;
    }
    // 点
    // 色はスキャンごと・点ごとに見る（1 つ目のスキャンに色がなくても、あとのスキャンの色を捨てない。色のない点は灰色）
    if (n >= 7 && !hasRgb) { hasRgb = true; sink.rgb(); }
    left--;
    const x = v[0], y = v[1], z = v[2];
    if (!(x === 0 && y === 0 && z === 0)) {
      const k = sink.slot(x * M[0] + y * M[4] + z * M[8] + M[12], x * M[1] + y * M[5] + z * M[9] + M[13], x * M[2] + y * M[6] + z * M[10] + M[14]);
      if (k >= 0) {
        sink.F[fi][k] = n >= 4 ? v[3] : 0;
        if (hasRgb) { if (n >= 7) { sink.C[3 * k] = v[4]; sink.C[3 * k + 1] = v[5]; sink.C[3 * k + 2] = v[6]; } else sink.gray(k); }
      }
    }
    if (left <= 0) state = 'cols';
  }, ctx.progress);
  return { format: `PTX（スキャン ${scans} 個）` };
}
