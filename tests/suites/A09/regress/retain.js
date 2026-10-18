// 閉じたあとも画面側に残る大きな ArrayBuffer を、ヒープスナップショットで探して「何がつかんでいるか」（保持の経路）を出す
//   node retain.js [--wait=ms] [--electron] <ファイル>
//   1) 開いて落ち着くまで待つ 2) × で閉じる 3) wait ms 待つ 4) GC 5) ヒープスナップショット → 50 MB 以上の ArrayBuffer の保持経路
const { launch, openFiles } = require('./lib.js');
const path = require('path');
const fs = require('fs');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const file = path.resolve(argv.filter(a => !a.startsWith('--'))[0]);

function analyze(snap, minBytes = 50e6) {
  const m = snap.snapshot.meta, nf = m.node_fields.length, ef = m.edge_fields.length;
  const types = m.node_types[0], etypes = m.edge_types[0];
  const N = snap.nodes, E = snap.edges, S = snap.strings;
  const iType = m.node_fields.indexOf('type'), iName = m.node_fields.indexOf('name'), iSelf = m.node_fields.indexOf('self_size'), iEc = m.node_fields.indexOf('edge_count'), iId = m.node_fields.indexOf('id');
  const eType = m.edge_fields.indexOf('type'), eName = m.edge_fields.indexOf('name_or_index'), eTo = m.edge_fields.indexOf('to_node');
  const n = N.length / nf;
  // 逆向きの辺
  const firstEdge = new Uint32Array(n + 1);
  for (let i = 0, e = 0; i < n; i++) { firstEdge[i] = e; e += N[i * nf + iEc] * ef; }
  firstEdge[n] = E.length;
  const rev = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += ef) { if (etypes[E[e + eType]] === 'weak') continue; const to = E[e + eTo] / nf; if (rev[to].length < 8) rev[to].push([i, e]); }
  const label = i => `${types[N[i * nf + iType]]}:${S[N[i * nf + iName]].slice(0, 60)}`;
  const elabel = e => { const t = etypes[E[e + eType]]; const nm = E[e + eName]; return t === 'element' || t === 'hidden' ? `[${nm}]` : `${t}:${typeof nm === 'number' ? S[nm] : nm}`; };
  const out = [];
  for (let i = 0; i < n; i++) {
    if (N[i * nf + iSelf] < minBytes) continue;
    // 根へ向かって幅優先（最短の保持経路）
    const prev = new Map([[i, null]]); const q = [i]; let root = null;
    while (q.length && root === null) {
      const x = q.shift();
      for (const [p, e] of rev[x]) { if (prev.has(p)) continue; prev.set(p, [x, e]); if (p === 0 || label(p).includes('(GC roots)')) { root = p; break; } q.push(p); if (prev.size > 200000) break; }
    }
    const pathOut = [];
    let x = root;
    while (x !== null && x !== undefined && prev.get(x)) { const [child, e] = prev.get(x); pathOut.push(`${label(x)} -${elabel(e)}-> `); x = child; }
    pathOut.push(label(i));
    out.push({ bytes: N[i * nf + iSelf], node: label(i), path: pathOut.join('') });
  }
  return out;
}

(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const { page, cdp } = ctx;
  const res = { test: 'retain', file: path.basename(file) };
  try {
    await openFiles(ctx, [file]);
    res.loaded = await ctx.heap();
    await ctx.closeAll();
    await page.waitForTimeout(+(opt('wait') || 500));
    await ctx.gc();
    res.afterClose = await ctx.heap();
    const chunks = [];
    cdp.on('HeapProfiler.addHeapSnapshotChunk', ev => chunks.push(ev.chunk));
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
    const snap = JSON.parse(chunks.join(''));
    res.snapshotNodes = snap.snapshot.node_count;
    res.big = analyze(snap, 20e6);
    res.afterSnapshot = await ctx.heap();
  } catch (e) { res.fatal = e.message; }
  await ctx.close();
  console.log(JSON.stringify(res, null, 1));
  process.exit(0);
})();
