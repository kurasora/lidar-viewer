// 距離の道具で 2 点を測る（天井は表示にする）。測った端点（局所座標＋シフト）と表の文字を返す
const P = window.__pcd, S = P.S, f = S.files[0];
if (S.hideCeil) document.getElementById('btnCeil').click();
P.setView('top', false); await H.wait(600);
document.querySelector('[data-tool="measure"]').click(); await H.wait(200);
const res = [];
for (const [ia, ib, shift] of ARGS.pairs) {
  const a = [f.positions[3 * ia], f.positions[3 * ia + 1], f.positions[3 * ia + 2]], b = [f.positions[3 * ib], f.positions[3 * ib + 1], f.positions[3 * ib + 2]];
  const sa = H.proj(a), sb = H.proj(b);
  await window.pwClick(sa.x, sa.y); await H.wait(600);
  await window.pwMove(sb.x, sb.y); await H.wait(600);
  const live = H.text('mLive');
  await window.pwClick(sb.x, sb.y, shift); await H.wait(700);
  const m = S.measures[S.measures.length - 1];
  res.push({ shift, a: m && m.a.toArray().map((v, k) => v + S.offset[k]), b: m && m.b.toArray().map((v, k) => v + S.offset[k]), aLocal: m && m.a.toArray(), bLocal: m && m.b.toArray(), live, row: H.q('#measureTable tbody tr').slice(-1)[0] });
}
return { offset: S.offset, level: !!S.levelInfo, res };
