// 画面の大きさ × デバイスピクセル比 × テーマ ごとに、全状態の写真と崩れの検査（Chromium）
//   node matrix_chromium.js "900x600,1280x800" "1,2" "dark,light"
const L = require('./lib.js');
const S = require('./states.js');
(async () => {
  const sizes = (process.argv[2] || '900x600,1280x800,1920x1080,3840x2160').split(',');
  const dprs = (process.argv[3] || '1').split(',').map(Number);
  const schemes = (process.argv[4] || 'dark').split(',');
  L.fs.mkdirSync(L.W + '/out', { recursive: true });
  for (const sz of sizes) for (const dpr of dprs) for (const scheme of schemes) {
    const [w, h] = sz.split('x').map(Number);
    const tag = `${w}x${h}_d${dpr}_${scheme}`;
    const t0 = Date.now();
    const { p, errors, close } = await L.chromium({ w, h, dpr, scheme });
    let res;
    try { res = await S.run(p, `matrix/${tag}/c`); } catch (e) { res = [{ fatal: e.stack }]; }
    await close();
    const sum = res.map(r => ({ state: r.state, n: (r.issues || []).length, fatal: r.fatal }));
    L.fs.writeFileSync(`${L.W}/out/matrix_chromium_${tag}.json`, JSON.stringify({ tag, ms: Date.now() - t0, errors, res }, null, 1));
    console.log(tag, Date.now() - t0, 'ms', JSON.stringify(sum.filter(s => s.n || s.fatal)), errors.slice(0, 3));
  }
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
