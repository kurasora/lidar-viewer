// t_chips.js の結果を、アプリ version の結果（out/app_baseline.jsonl）と README の期待値に照らして表にする
//   node eval_chips.mjs <chips_*.json> [<app_baseline.jsonl>]
//   出力: 標準出力に Markdown の表、out/eval_<名前>.json に判定
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
const file = process.argv[2];
const basePath = process.argv[3] || join(dirname(file), 'app_baseline.jsonl');
const run = JSON.parse(readFileSync(file, 'utf8'));
const exp = JSON.parse(readFileSync('/home/claude/pcd-viewer/tests/sample-generators/samples/out_expected.json', 'utf8'));
const base = existsSync(basePath) ? readFileSync(basePath, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
const src = readFileSync('/home/claude/pcd-viewer/src/samples.js', 'utf8').replace('export const SAMPLE_GROUPS', 'globalThis.G');
eval(src);
const chipFiles = {};
for (const [g, items] of globalThis.G) for (const [label, files] of items) chipFiles[g + '/' + label] = files;
const near = (a, b, tol) => a.every((v, k) => Math.abs(v - b[k]) <= tol);
const rows = [], verdicts = [];
for (const r of run.results) {
  const files = chipFiles[r.group + '/' + r.label] || [];
  const b = base.find(x => JSON.stringify(x.group) === JSON.stringify(files));
  const v = { label: r.label, group: r.group, ms: r.ms, n: r.files.map(f => f.n), msg: r.msg, err: r.msgIsError, timedOut: r.timedOut, chipOk: r.chipOk, notes: [] };
  if (r.timedOut) v.notes.push('時間切れ（読み込みが終わらない）');
  if (r.msgIsError) v.notes.push('エラー表示');
  if (!r.files.length && !r.msgIsError && !r.timedOut) v.notes.push('点群が増えていない');
  if (r.chipOk && (r.msgIsError || r.timedOut || !r.files.length)) v.notes.push('失敗したのにボタンが ok 表示');
  if (r.csp && r.csp.length) v.notes.push('CSP 違反 ' + [...new Set(r.csp.map(c => c.dir + ' ' + c.uri))].join(', '));
  if (r.pageerror && r.pageerror.length) v.notes.push('ページのエラー: ' + r.pageerror.join(' / ').slice(0, 160));
  // 座標の細かさ（10 cm 以上の刻み = float32 の丸め）
  // 画像・ラスター（1 画素 = 1 m）と高さの表（CSV・1 マス = 1 m）は格子そのものが 1 m 刻みなので除く
  if (r.group !== '画像・ラスター') for (const f of r.files) if (f.minGap && !/高さの表/.test(f.fmt || '') && f.minGap.some(g => g != null && g >= 0.05)) v.notes.push(`座標が粗い（最小の刻み ${f.minGap.join(', ')}、offset ${JSON.stringify(r.offset)}）`);
  // アプリ version との比較
  if (b) {
    v.app = { n: b.files.map(f => f.n), msg: b.msg, err: b.msgIsError };
    const A = [...r.files].sort((x, y) => x.name.localeCompare(y.name)), B = [...b.files].sort((x, y) => x.name.localeCompare(y.name));
    if (A.length !== B.length) v.notes.push(`ファイル数がアプリ version と違う（試作 ${A.length}・アプリ ${B.length}）`);
    else A.forEach((f, i) => {
      const g = B[i];
      if (f.n !== g.n) v.notes.push(`${f.name}: 点数がアプリ version と違う（${f.n} / ${g.n}）`);
      else if (!near(f.mean, g.mean, 0.02) || !near(f.min, g.min, 0.05) || !near(f.max, g.max, 0.05)) v.notes.push(`${f.name}: 座標がアプリ version と違う（平均 ${f.mean} / ${g.mean}、最小 ${f.min} / ${g.min}）`);
    });
    if (!!b.msgIsError !== !!r.msgIsError) v.notes.push(`エラーの有無がアプリ version と違う（アプリ: ${b.msg.slice(0, 60)}）`);
  } else v.notes.push('アプリ version の結果なし');
  // README の期待値（5000 点の廊下）
  for (const f of r.files) if (f.n === exp.n) {
    const plain = near(f.mean, exp.mean, 0.01), utm = near(f.mean, exp.mean.map((m, k) => m + exp.utm[k]), 0.05);
    v.expect = plain ? '期待値（そのまま）と一致' : utm ? '期待値（UTM）と一致' : '期待値と違う';
    if (!plain && !utm) v.notes.push(`${f.name}: 5000 点だが平均が期待値と違う（${f.mean}）`);
  }
  verdicts.push(v);
  rows.push(`| ${r.group} | ${r.label} | ${r.files.map(f => f.n).join('+') || '—'} | ${(r.ms / 1000).toFixed(1)} | ${(r.msg || '').replace(/\|/g, '｜').slice(0, 70)} | ${v.notes.join('; ').replace(/\|/g, '｜') || 'OK'} |`);
}
const name = basename(file, '.json');
writeFileSync(join(dirname(file), `eval_${name}.json`), JSON.stringify(verdicts, null, 1));
console.log(`### ${name}（場面 ${run.scene}・${run.mode}、ページの読み直し ${run.reloads || 0} 回）\n`);
console.log('| 群 | ボタン | 点数 | 秒 | 知らせ | 判定 |\n|---|---|---|---|---|---|');
console.log(rows.join('\n'));
const bad = verdicts.filter(v => v.notes.length);
console.log(`\n問題のあるボタン: ${bad.length} / ${verdicts.length}`);
