// Agisoft PhotoScan / Metashape のプロジェクト（.psz = zip）
//   中の doc.xml に書かれた点群（point_cloud / dense_cloud の points）とメッシュ（model の mesh）を読む
//   入れ子の zip（frame.zip など）の中にあっても探す
import { unzipSync } from 'fflate';
import { decode, parseXML, xmlFind, extOf } from '../util.js';
import { guard } from './image.js';

// 展開するのは、目録（doc.xml）・入れ子の zip・点群とメッシュだけ（写真・深度などは展開しない）
// 宣言された大きさが極端なもの（zip 爆弾）は断る
const WANT = /(^|\/)doc\.xml$|\.(zip|ply|obj|mtl)$/i;
function makeFilter() {
  let total = 0;
  return f => {
    if (!WANT.test(f.name)) return false;
    if (f.originalSize > 2e9 || (f.originalSize > 1e8 && f.size > 0 && f.originalSize / f.size > 1000)) throw new Error(`PhotoScan のプロジェクトの中の ${f.name} が、展開すると極端に大きくなります（ファイルが壊れている可能性があります）`);
    total += f.originalSize;
    if (total > 2e9) throw new Error('PhotoScan のプロジェクトの中身が大きすぎます（展開して 2 GB まで）');
    return true;
  };
}
async function read_(src, sink, ctx) {
  const filter = makeFilter();
  const all = {};
  // 入れ子の zip も開いておく（パスは「外側のパス/中のパス」）。chunk.zip → frame.zip のような 2 段以上も、4 段まで
  const open = (bytes, prefix, depth) => {
    let files;
    try { files = unzipSync(bytes, { filter }); } catch (e) { if (/PhotoScan/.test(e.message) || !depth) throw e; return; /* 中の壊れた zip は飛ばす */ }
    for (const [n, b] of Object.entries(files)) {
      all[prefix + n] = b;
      if (extOf(n) === 'zip' && depth < 4) open(b, prefix + n + '/', depth + 1);
    }
  };
  open(await src.all(), '', 0);
  const docName = Object.keys(all).find(n => /(^|\/)doc\.xml$/i.test(n) && !Object.keys(all).some(z => extOf(z) === 'zip' && n.startsWith(z + '/'))) || Object.keys(all).find(n => /(^|\/)doc\.xml$/i.test(n));
  if (!docName) throw new Error('PhotoScan のプロジェクトの目録（doc.xml）が見つかりません');
  const targets = [], seen = new Set();
  const dir = k => (k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : '');
  // 参照の基準は「目録のあるところ（zip の中）」と「その zip の置かれたフォルダ」の両方
  const resolve = (base, path) => {
    const cands = [base ? base + '/' + path : path, dir(base) ? dir(base) + '/' + path : path, path];
    return cands.find(k => all[k]) || cands[0];
  };
  const visit = (xmlBytes, base, depth) => {
    if (depth > 8) return;
    const root = parseXML(decode(xmlBytes));
    for (const tag of ['points', 'mesh', 'frame', 'chunk']) for (const n of xmlFind(root, tag)) {
      const path = n.attrs.path;
      if (!path) continue;
      const full = resolve(base, path);
      if (extOf(full) === 'zip') {
        if (seen.has(full)) continue; seen.add(full);
        // その zip の中の doc.xml をさらに読む
        const inner = all[full + '/doc.xml'] ? full + '/doc.xml' : null;
        if (inner) visit(all[inner], full, depth + 1);
        else for (const k of Object.keys(all)) if (k.startsWith(full + '/') && /\.(ply|obj)$/i.test(k) && k.slice(full.length + 1).indexOf('.zip/') < 0) targets.push(k);
      } else if (!targets.includes(full)) targets.push(full);
    }
  };
  visit(all[docName], dir(docName), 0);
  // 目録が辿れなければ、中の PLY をすべて読む
  if (!targets.length) for (const k of Object.keys(all)) if (/\.ply$/i.test(k)) targets.push(k);
  if (!targets.length) throw new Error('PhotoScan のプロジェクトに点群もメッシュも見つかりません');
  const done = [], notes = [];
  for (const t of targets) {
    const key = all[t] ? t : Object.keys(all).find(k => k.endsWith('/' + t));
    if (!key || !all[key]) continue;
    const name = key.replace(/^.*\//, '');
    const info = (await ctx.loadInner(new Blob([all[key]]), name)) || {};
    done.push(name);
    if (info.note) notes.push(`${name}: ${info.note}`);
  }
  if (!done.length) throw new Error('PhotoScan のプロジェクトの目録に書かれた点群・メッシュのファイルが見つかりません');
  ctx.progress(1);
  return { format: `PhotoScan プロジェクト（${done.join('、')}）`, note: notes.join('。') };
}
export const read = guard('PhotoScan の PSZ', read_);
