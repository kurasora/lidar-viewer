// 実機で Node なしに測るための「開発者ツールに貼る」計測（LiDAR Viewer の画面で F12 → Console に全部貼って Enter）
//   貼ったあと、いつもどおりファイルを開く。1 ファイルごとに、次の時間を Console に表で出す:
//     読み込み（進み具合が出てから一覧に出るまで）・点の間隔の計算まで・水平補正まで、点数、画面の JS ヒープ
//   window.__a09.rows に全部たまる。copy(JSON.stringify(window.__a09.rows)) でクリップボードへ
(() => {
  const P = window.__pcd;
  if (!P) { console.log('LiDAR Viewer の画面で実行してください'); return; }
  if (window.__a09) { console.log('もう動いています'); return; }
  const A = window.__a09 = { rows: [], cur: null };
  const prog = document.getElementById('progress'), msg = document.getElementById('statMsg');
  const mem = () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  let known = new Set(P.S.files.map(f => f.id));
  let lastFrame = performance.now(), maxGap = 0;
  const fr = t => { maxGap = Math.max(maxGap, t - lastFrame); lastFrame = t; requestAnimationFrame(fr); };
  requestAnimationFrame(fr);
  new MutationObserver(() => {
    if (!prog.hidden && !A.cur) { A.cur = { start: performance.now(), heap0: mem() }; maxGap = 0; }
  }).observe(prog, { attributes: true, attributeFilter: ['hidden'] });
  setInterval(() => {
    const S = P.S;
    for (const f of S.files) {
      if (known.has(f.id)) continue;
      const c = A.cur || { start: performance.now() };
      c.shown = performance.now(); c.file = f; known.add(f.id); A.cur = null;
      const wait = () => {
        if (f.spacing === undefined && performance.now() - c.shown < 600000) { setTimeout(wait, 100); return; }
        c.spacing = performance.now();
        setTimeout(() => {
          const row = { name: f.name, MB: +(f.size / 1048576).toFixed(1), n: f.n, total: f.total, '表示まで s': +((c.shown - c.start) / 1000).toFixed(2), '点の間隔まで s': +((c.spacing - c.start) / 1000).toFixed(2), '画面の最長停止 ms': Math.round(maxGap), 'JSヒープ MB（前→後）': `${c.heap0}→${mem()}`, '知らせ': msg.textContent };
          A.rows.push(row);
          console.table(A.rows);
        }, 2000);
      };
      wait();
    }
    for (const id of [...known]) if (!S.files.some(f => f.id === id)) known.delete(id);
  }, 100);
  console.log('計測を始めました。ファイルを開いてください（結果は window.__a09.rows）');
})();
