// ページの中で使う補助（batch.js が evaluate で入れる）
(() => {
  const H = window.H = {};
  H.wait = ms => new Promise(r => setTimeout(r, ms));
  H.text = id => document.getElementById(id).textContent;
  H.q = s => [...document.querySelectorAll(s)].map(e => e.textContent.trim());
  H.V3 = window.__pcd.cam.position.constructor;
  H.canvas = () => window.__pcd.renderer.domElement;
  // 局所座標（positions と同じ、シフトを引いた値）→ 画面の座標（clientX, clientY）
  H.proj = (l) => {
    const P = window.__pcd;
    P.world.updateMatrixWorld(true);
    const cam = P.cam; cam.updateMatrixWorld();
    const v = new H.V3(l[0], l[1], l[2]).applyMatrix4(P.world.matrixWorld).project(cam);
    const r = H.canvas().getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, z: v.z };
  };
  H.pickXY = async (x, y) => { const hit = await window.__pcd.pickAt(x, y, true); return hit ? { local: hit.local.toArray(), world: hit.world.toArray(), file: hit.file && hit.file.name, index: hit.index } : null; };
  H.pickLocal = async (l) => { const s = H.proj(l); return H.pickXY(s.x, s.y); };
  H.info = () => { const k = H.q('#info dt'), v = H.q('#info dd'); return Object.fromEntries(k.map((x, i) => [x, v[i]])); };
  H.levelSeen = false;
  H.settle = async (limit = 180000) => {
    const t0 = Date.now(); let last = '', since = Date.now();
    for (;;) {
      const msg = document.getElementById('statMsg').textContent;
      const s = JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length, window.__pcd.S.trajs.length, msg]);
      if (s !== last) { last = s; since = Date.now(); }
      let busy = /調べています|探しています/.test(msg);
      // 開いたときの自動の水平補正は、知らせが「開きました」に上書きされるので、結果（水平補正しました／できませんでした）が出るまで待つ
      const S = window.__pcd.S, f0 = S.files[0];
      if (f0 && S.files.length === 1 && document.getElementById('autoLevel').checked && !H.levelSeen) {
        const b = f0.bbox, flat = !((b.max[2] - b.min[2]) > 1e-6 * Math.max(1, b.max[0] - b.min[0], b.max[1] - b.min[1]));
        if (!flat) { if (/水平補正/.test(msg) || S.levelInfo) H.levelSeen = true; else busy = true; }
      }
      if (JSON.parse(s)[0] && !busy && Date.now() - since > 1000) return 'ok';
      if (Date.now() - t0 > limit) return 'timeout';
      await H.wait(150);
    }
  };
  // ファイルを開く（ページの中から）。開き終わるまで待つ
  H.open = async (list, input) => { await window.pwOpen(list, input); await H.wait(300); return H.settle(); };
  // 見えている点（天井・切り抜きで隠れていない）かどうか
  H.isVisibleLocal = (l) => {
    const S = window.__pcd.S, M = window.__pcd.world.matrixWorld.elements;
    const w = [0, 1, 2].map(k => M[k] * l[0] + M[4 + k] * l[1] + M[8 + k] * l[2] + M[12 + k]);
    const c = S.hideCeil && S.ceil;
    return !(c && c.n.x * w[0] + c.n.y * w[1] + c.n.z * w[2] > c.d);
  };
})();
