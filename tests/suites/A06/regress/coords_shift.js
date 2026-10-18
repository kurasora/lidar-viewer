// （担当外の確認）大きな座標（グローバルシフト）の点群で、画面の各所に出る座標がそろっているか
//   座標の吹き出し・情報の範囲・断面の位置・切り出しの範囲・回転の中心の知らせ を、元のファイルの座標と比べる
const L = require('./lib.js');
const S = require('./states.js');
(async () => {
  const { p, close, errors } = await L.chromium({ w: 1280, h: 800 });
  const out = {};
  for (const f of ['/home/claude/pcd-viewer/sample/formats/laspy_utm.las', L.FILES + '/corr_1e7.pcd']) {
    await L.closeAll(p);
    await L.openFiles(p, [f]);
    const r = { file: L.path.basename(f) };
    r.offset = await p.evaluate(() => window.__pcd.S.offset);
    r.level = await p.evaluate(() => { const l = window.__pcd.S.levelInfo; return l ? { tiltDeg: l.tiltDeg, yawDeg: l.yawDeg, floorZ: l.floorZ } : null; });
    await p.click('[data-tool="info"]');
    const q = await S.findVisiblePoint(p);
    await p.mouse.click(q.x, q.y); await p.waitForTimeout(600);
    r.pickShown = await p.evaluate(() => [...document.querySelectorAll('#pickBox .pc-xyz span')].map(s => s.textContent));
    // 同じ点の、元のファイルの座標（local + offset）
    r.pickOriginal = await p.evaluate(async ([x, y]) => { const h = await window.__pcd.pickAt(x, y, true); const o = window.__pcd.S.offset || [0, 0, 0]; return h ? [h.local.x + o[0], h.local.y + o[1], h.local.z + o[2]].map(v => v.toFixed(3)) : null; }, [q.x, q.y]);
    await p.click('[data-tool="info"]');
    await L.openCard(p, 'open'); await p.evaluate(() => { document.getElementById('infoBox').open = true; });
    r.infoRanges = await p.evaluate(() => [...document.querySelectorAll('#info dt')].map(dt => dt.textContent + ' ' + dt.nextElementSibling.textContent).filter(s => s.startsWith('範囲') || s.startsWith('シフト')));
    await L.closeCards(p); await L.openCard(p, 'section'); await p.click('.axes3 [data-axis="0"]');
    r.sectionPos = await p.evaluate(() => document.getElementById('secPosVal').textContent);
    await p.click('.axes3 [data-axis="0"]');
    await p.click('#tabClip'); r.clip = await p.evaluate(() => [...document.querySelectorAll('#paneClip .dual')].map(d => d.querySelector('.dlabel').textContent + ' ' + d.querySelector('.dval').textContent));
    await p.click('#tabSec');
    await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#tabColorBasic');
    r.colorMode = await p.evaluate(() => document.getElementById('colorMode').value);
    await p.click('#colorBasic [data-val="height"]').catch(() => {}); await p.click('#tabColorDetail').catch(() => {});
    r.colorRange = await p.evaluate(() => document.querySelector('#colorRange .dval').textContent + ' ／ 凡例 ' + ((document.querySelector('#legend .ticks') || {}).textContent || '（なし）'));
    await p.click('#tabColorBasic'); await L.closeCards(p);
    out[r.file] = r;
  }
  L.fs.writeFileSync(L.W + '/out/coords_shift.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
