// app.js・worker.js の中の関数を、ソースから取り出して Node で動かす（元のファイルは書き換えない）
//   topLevel(code)            … いちばん外側の宣言（function / const / let / class）を名前 → ソースの文字列で返す
//   evalDecls(code, names, globals, extra) … 指定した宣言（と extra のコード）を vm の中で評価し、名前 → 値を返す
//   TypeScript の構文解析器を使う（対象のプロジェクトの node_modules、なければ A04 の tools）
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { ROOT } from './harness.mjs';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const cands = [join(ROOT, 'node_modules/typescript'), join(here, '../../tools/node_modules/typescript'), 'typescript'];
let ts = null;
for (const c of cands) { try { if (c === 'typescript' || existsSync(c)) { ts = require(c); break; } } catch { /* 次 */ } }
if (!ts) throw new Error('TypeScript（構文解析に使う）が見つかりません。npm install --prefix <tools> typescript');

export function topLevel(code) {
  const sf = ts.createSourceFile('x.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const m = new Map();
  for (const st of sf.statements) {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) m.set(st.name.text, code.slice(st.getStart(sf), st.end));
    else if (ts.isVariableStatement(st)) {
      const kind = (st.declarationList.flags & ts.NodeFlags.Const) ? 'const' : 'let';
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) m.set(d.name.text, `${kind} ${code.slice(d.getStart(sf), d.end)};`);
    }
  }
  return m;
}
export const readSrc = p => readFileSync(join(ROOT, p), 'utf8');
// names の宣言を順に並べ、最後に名前の一覧を返すコードを付けて評価する
export function evalDecls(code, names, globals = {}, extra = '') {
  const tl = topLevel(code);
  const parts = names.map(n => { const s = tl.get(n); if (!s) throw new Error(`宣言 ${n} が見つかりません`); return s; });
  const body = `${extra}\n${parts.join('\n')}\n;({${names.join(',')}})`;
  const ctx = vm.createContext({ console, Math, Number, Array, Float64Array, Float32Array, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Int32Array, Map, Set, JSON, String, Object, Promise, TextDecoder, TextEncoder, Blob, Infinity, NaN, isFinite, parseFloat, parseInt, ...globals });
  return vm.runInContext(body, ctx, { filename: 'extracted.js' });
}
