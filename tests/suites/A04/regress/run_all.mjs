// A04 の単体試験をまとめて流す: node --no-warnings run_all.mjs [--only <正規表現>] [--json]
//   環境変数 PCDV_ROOT（対象のプロジェクト）・LAS_DIR（作った LAS を使い回す）
import { run } from './lib/harness.mjs';
const args = process.argv.slice(2);
const only = args.includes('--only') ? new RegExp(args[args.indexOf('--only') + 1]) : null;
const files = ['t_util', 't_sink', 't_pcd', 't_e57_las', 't_ascii_ply', 't_mesh_cad', 't_misc', 't_traj', 't_worker', 't_app', 't_props'];
for (const f of files) {
  try { await import(`./${f}.mjs`); }
  catch (e) { console.log(`ERROR    ${f}.mjs を読み込めません: ${e && e.stack}`); }
}
const res = await run({ filter: only, json: args.includes('--json') });
process.exitCode = res.some(r => r.status !== 'PASS') ? 1 : 0;
