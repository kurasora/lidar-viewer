// 状況に合った知らせが出るか（右上の知らせを、操作ごとに記録する）（Chromium）
const L = require('./lib.js');
(async () => {
  const { p, close, errors } = await L.chromium({ w: 1280, h: 800 });
  await p.evaluate(() => {
    window.__log = []; const el = document.getElementById('statMsg');
    new MutationObserver(() => window.__log.push([el.textContent, !!el.style.color])).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  });
  const res = [];
  const step = async (name, fn) => {
    await p.evaluate(() => { window.__log = []; });
    await fn();
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => ({ log: window.__log.filter(x => x[0]).map(x => (x[1] ? '[赤] ' : '') + x[0]), now: document.getElementById('statMsg').textContent, ceilOn: document.getElementById('btnCeil').classList.contains('on'), colorMode: document.getElementById('colorMode').value, field: document.getElementById('fieldSel').value, files: window.__pcd.S.files.length }));
    res.push({ step: name, ...r });
  };
  const click = sel => p.evaluate(s => document.querySelector(s).click(), sel);
  // ファイルなし
  await step('ファイルなしで「反射」を押す', () => click('#colorBasic [data-val="field"]'));
  await step('ファイルなしで「RGB」を押す', () => click('#colorBasic [data-val="rgb"]'));
  await click('#colorBasic [data-val="height"]');
  await step('ファイルなしで「天井を隠す」を押す（1 回目）', () => click('#btnCeil'));
  await step('ファイルなしで「天井を隠す」を押す（2 回目）', () => click('#btnCeil'));
  await step('ファイルなしで C キー', () => p.keyboard.press('c'));
  await step('ファイルなしで「画像を保存」', () => click('#btnShot'));
  await step('ファイルなしで「自動で水平にする」', () => click('#btnLevel'));
  await step('ファイルなしで視点「上」', () => click('[data-view="top"]'));
  await step('ファイルなしで「透視」', () => click('#btnProj'));
  await click('#btnProj');
  // intensity と label を持つファイル
  await step('intensity と label を持つファイルを開く', () => L.openFiles(p, [L.FILES + '/corr_int_label.pcd']));
  await step('「反射」を押す（label もあるファイル）', () => click('#colorBasic [data-val="field"]'));
  res[res.length - 1].legend = await p.evaluate(() => document.getElementById('legend').innerText);
  await step('天井を隠すを押す', () => click('#btnCeil'));
  await step('天井を隠すをもう一度押す', () => click('#btnCeil'));
  await step('「反射」のまま最後のファイルを閉じる', () => L.closeAll(p));
  await click('#colorBasic [data-val="height"]');
  // intensity だけのファイル → 項目なしのファイルを足して、前のファイルを閉じる
  await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
  await L.openFiles(p, [L.FILES + '/corr_xyz.pcd']);
  await click('#colorBasic [data-val="field"]');
  await step('反射の色分けで、intensity のあるファイルだけを閉じる（項目なしのファイルが残る）', () => p.evaluate(() => document.querySelector('#fileList li [data-act=remove]').click()));
  await L.closeAll(p);
  await click('#colorBasic [data-val="height"]');
  // RGB のファイル
  await step('RGB のファイルを開く', () => L.openFiles(p, ['/home/claude/pcd-viewer/sample/formats/pcl_binary.pcd']));
  await step('RGB のまま閉じる', () => L.closeAll(p));
  // 水平にできないもの（平らな画像）
  await step('画像（平ら）を開く', () => L.openFiles(p, ['/home/claude/pcd-viewer/sample/formats/pillow_topview.png']));
  await step('平らな点群で「自動で水平にする」', () => click('#btnLevel'));
  await L.closeAll(p);
  // 点数の上限を変える
  const setCap = v => p.evaluate(v => { const s = document.getElementById('capSel'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  await step('読み込む最大点数を変える', () => setCap('100000000'));
  await setCap('30000000');
  // 座標・距離
  await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
  await step('座標を入れて点のない所をクリック', async () => { await click('[data-tool="info"]'); await p.mouse.click(1250, 120); });
  await click('[data-tool="info"]');
  L.fs.mkdirSync(L.W + '/out', { recursive: true });
  L.fs.writeFileSync(L.W + '/out/messages.json', JSON.stringify({ res, errors }, null, 1));
  for (const r of res) console.log(`- ${r.step}: ${r.log.length ? r.log.join(' → ') : '（知らせなし）'}${r.legend ? ' ／ 凡例: ' + r.legend.replace(/\n/g, ' ') : ''}${r.hud ? ' ／ 右上: ' + r.hud.join(' | ') : ''} [天井ボタン ${r.ceilOn ? 'on' : 'off'}・色 ${r.colorMode}/${r.field}]`);
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
