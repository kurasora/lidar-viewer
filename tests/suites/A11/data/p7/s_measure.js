// 0.4.1 から: 画面には全部の点を持たない（f.positions はなく、先頭 20 万点の標本 f.sample だけ。点は読み込み時に混ぜてあるので無作為な標本）
// 距離の道具で 2 点を測る（天井は表示にする）。測った端点（局所座標＋シフト）と表の文字を返す
const P = window.__pcd, S = P.S, f = S.files[0];
if (S.hideCeil) document.getElementById('btnCeil').click();
P.setView('top', false); await H.wait(600);
document.querySelector('[data-tool="measure"]').click(); await H.wait(200);
const res = [];
for (const [ia, ib, shift] of ARGS.pairs) {
  const a = [f.sample[3 * ia], f.sample[3 * ia + 1], f.sample[3 * ia + 2]], b = [f.sample[3 * ib], f.sample[3 * ib + 1], f.sample[3 * ib + 2]];
  const sa = H.proj(a), sb = H.proj(b);
  await window.pwClick(sa.x, sa.y); await H.wait(600);
  await window.pwMove(sb.x, sb.y); await H.wait(600);
  const live = null; // 2 点目を選ぶ前の長さの表示（mLive）は 0.4.2 でなくした
  await window.pwClick(sb.x, sb.y, shift); await H.wait(700);
  const m = S.measures[S.measures.length - 1];
  res.push({ shift, a: m && m.a.toArray().map((v, k) => v + S.offset[k]), b: m && m.b.toArray().map((v, k) => v + S.offset[k]), aLocal: m && m.a.toArray(), bLocal: m && m.b.toArray(), live, row: H.q('#measureTable tbody tr').slice(-1)[0] });
}
return { offset: S.offset, level: !!S.levelInfo, res };
