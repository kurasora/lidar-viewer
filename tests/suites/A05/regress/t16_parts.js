// t16 一緒に選んだ「付属ファイル」の扱い: 関係のないファイルまで付属とみなして黙って捨てないか
//   heavy node t16_parts.js
const L = require('./lib.js');
const D = L.DATA, SF = L.SF;

(async () => {
  const R = L.recorder('t16_parts');
  const { p, errors, close } = await L.page();
  const cases = [
    ['P1 OBJ のメッシュと CloudCompare の .bin 点群を一緒に開く → 2 つとも開く', [`${SF}/cc_mesh.obj`, `${SF}/cc_cloud.bin`], 2],
    ['P2 glTF と、関係のない CloudCompare の .bin 点群 → 2 つとも開く', [`${SF}/trimesh_mesh.gltf`, `${SF}/cc_cloud.bin`], 2],
    ['P3（参考）OBJ と PNG 画像（貼り付けの画像かもしれない）', [`${SF}/cc_mesh.obj`, `${SF}/pillow_topview.png`], null],
    ['P4 .sbf と .sbf.data（対照: 付属は 1 つにまとまる）', [`${SF}/cc_cloud.sbf`, `${SF}/cc_cloud.sbf.data`], 1],
  ];
  for (const [name, files, n] of cases) {
    await L.closeAll(p);
    await p.evaluate(() => { document.getElementById('statMsg').textContent = ''; });
    await L.open(p, files, { limit: 180000 });
    const st = await L.state(p);
    R.ok(name, n === null ? true : st.files.length === n, { files: st.files.map(f => f.name), msg: st.msg });
  }
  // .mtl だけを選んだとき（何も起きない？）
  await L.closeAll(p);
  require('fs').writeFileSync(`${L.W}/tmp/only.mtl`, 'newmtl a\nKd 1 0 0\n');
  await p.evaluate(() => { document.getElementById('statMsg').textContent = ''; });
  await L.drop(p, [`${L.W}/tmp/only.mtl`]);
  const m = await L.msg(p);
  R.ok('P5 .mtl だけを落とすと、開けない理由が知らせに出る（黙って何もしない、にならない）', !!m.text, m);
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
