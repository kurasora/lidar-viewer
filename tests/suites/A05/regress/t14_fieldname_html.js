// t14 （担当外・セキュリティ）ファイルの欄の名前が HTML としてそのまま画面に入らないか（項目の選択・凡例・情報の欄）
//   アプリ version のページ（dist/index.html、CSP あり）と試作ページ（dist-artifact/pcd-viewer.html、CSP なし）の両方
//   heavy node t14_fieldname_html.js
const L = require('./lib.js');
const D = L.DATA;

(async () => {
  const R = L.recorder('t14_fieldname_html');
  for (const [label, url] of [['アプリ version のページ', L.PAGE], ['試作ページ', 'file:///home/claude/pcd-viewer/dist-artifact/pcd-viewer.html']]) {
    const { p, errors, close } = await L.page({ url });
    await p.waitForTimeout(label === '試作ページ' ? 4000 : 300);
    await L.idle(p, { limit: 120000 });
    await L.closeAll(p);
    await L.drop(p, [`${D}/inj_field.pcd`]);
    await L.card(p, 'color');
    await p.click('#colorBasic [data-val="field"]'); await p.waitForTimeout(600);
    await p.click('#tabColorDetail').catch(() => {});
    await p.selectOption('#fieldSel', { index: 0 }).catch(() => {});
    await p.waitForTimeout(500);
    await L.card(p, 'open');
    await p.click('#fileList li:nth-child(1) .name'); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({
      legendU: document.querySelectorAll('#legend u').length, infoU: document.querySelectorAll('#info u').length, infoImg: document.querySelectorAll('#info img').length,
      legendImg: document.querySelectorAll('#legend img').length, optionAttrs: [...document.querySelectorAll('#fieldSel option')].map(o => o.getAttributeNames().join('|')),
      xss: window.__xss === 1, fields: window.__pcd.S.files[0] && window.__pcd.S.files[0].header.fields,
    }));
    await L.shot(p, `t14_${label === '試作ページ' ? 'artifact' : 'app'}`);
    R.ok(`${label}: 欄の名前の HTML が情報の欄・凡例に要素として入らない`, !r.legendU && !r.infoU && !r.infoImg && !r.legendImg, r);
    R.ok(`${label}: 欄の名前の中のスクリプト（onerror）が動かない`, !r.xss, { xss: r.xss, csp: errors.filter(e => /Content Security Policy|inline event handler/i.test(e)).length });
    await close();
  }
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
