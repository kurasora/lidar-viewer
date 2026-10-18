// 拡張子から読み方を選ぶ（CloudCompare で開ける形式をできるだけそろえる）
import { Src, extOf } from './util.js';
import { Sink } from './sink.js';
import * as pcd from './formats/pcd.js';
import * as ascii from './formats/ascii.js';
import * as las from './formats/las.js';
import * as ply from './formats/ply.js';
import * as e57 from './formats/e57.js';
import * as ptx from './formats/ptx.js';
import * as sbf from './formats/sbf.js';
import * as ccbin from './formats/ccbin.js';
import * as simple from './formats/simple.js';
import * as mesh from './formats/mesh.js';
import * as cad from './formats/cad.js';
import * as image from './formats/image.js';
import * as wasm from './formats/wasm.js';
import * as psz from './formats/psz.js';

export const READERS = {
  pcd: pcd.read,
  txt: ascii.read, asc: ascii.read, neu: ascii.read, xyz: ascii.read, pts: ascii.read, csv: ascii.read,
  las: las.read, laz: las.read,
  ply: ply.read,
  e57: e57.read,
  ptx: ptx.read,
  sbf: sbf.read, data: sbf.read,
  bin: ccbin.read,
  pn: simple.readPN, pv: simple.readPV, soi: simple.readSOI, out: simple.readBundler,
  poly: simple.readSalome, sx: simple.readSinusx,
  obj: mesh.readOBJ, stl: mesh.readSTL, off: mesh.readOFF, vtk: mesh.readVTK, gltf: mesh.readGLTF, glb: mesh.readGLTF,
  dxf: cad.readDXF, shp: cad.readSHP, pdms: cad.readPDMS, pdmsmac: cad.readPDMS, mac: cad.readPDMS,
  drc: wasm.readDRC, ifc: wasm.readIFC, stp: wasm.readSTEP, step: wasm.readSTEP,
  psz: psz.read,
  tif: image.readRaster, tiff: image.readRaster,
};
for (const e of image.IMAGE_EXTS) READERS[e] = image.readImage;

// メーカー専用のライブラリが必要で、ここでは読めない形式
export const UNSUPPORTED = {
  rdb: 'RIEGL', rsp: 'RIEGL', rds: 'RIEGL', rdbx: 'RIEGL RDB', vxls: 'RIEGL RDB', ptch: 'RIEGL RDB', mtch: 'RIEGL RDB', dp: 'DotProduct',
};

// 単独では開けないが、ほかのファイルの付属・フォルダの一部であるもの
const NOT_ALONE = {
  '': 'フォルダや拡張子のないファイルは開けません。rosbag2 の記録のフォルダなら、中の .mcap を「軌跡を開く」で選んでください',
  yaml: 'metadata.yaml は rosbag2 の目録です。同じフォルダの .mcap を「軌跡を開く」で選んでください',
  db3: 'rosbag2 の .db3（SQLite 形式）には対応していません。ros2 bag convert などで .mcap にしてから「軌跡を開く」で選んでください',
  wrl: '.wrl（VRML）は単独では開けません。.icm の付属のファイルなら、.icm と点群のファイルと一緒に選んでください',
  mcap: '.mcap は軌跡のファイルです。「軌跡を開く」で選んでください',
};

const isJapanese = s => /[぀-ヿ一-鿿]/.test(s);
// 読み方の中で出た英語の内部例外（RangeError・TypeError・ライブラリの例外）や Error 以外の例外を、日本語の知らせに包む
export function friendlyError(e, ext) {
  const msg = e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
  if (e instanceof Error && isJapanese(msg)) return e;
  // WebAssembly が使えない画面の知らせは、別スレッドの側で言い換えるのでそのまま返す
  if (/WebAssembly|wasm|unsafe-eval|Content Security Policy/i.test(msg)) return e instanceof Error ? e : new Error(msg);
  const what = ext ? `この .${ext} ファイル` : 'このファイル';
  let text;
  if (/allocation failed|Invalid typed array length|Invalid array length|out of memory|Array buffer/i.test(msg)) text = `メモリが足りないため ${what}を開けません。「表示」の「読み込む最大点数」を減らすか、ほかのファイルを閉じてください`;
  else if (/Maximum call stack/i.test(msg)) text = `${what}は入れ子が深すぎて読めません（壊れている可能性があります）`;
  else if (e && (e.name === 'NotReadableError' || e.name === 'NotFoundError')) text = `${what}を読めませんでした（読み込み中にファイルが移動・変更・削除された可能性があります）`;
  else text = `${what}は壊れているか、途中で切れているため開けません`;
  const out = new Error(text);
  out.cause = e;
  return out;
}

export async function loadFile(blob, name, opts, progress) {
  const ext = extOf(name);
  if (UNSUPPORTED[ext]) throw new Error(`${UNSUPPORTED[ext]} の形式（.${ext}）は、メーカーの専用ライブラリが必要なため開けません。CloudCompare などで LAS / E57 / PLY に書き出してから開いてください`);
  const fn = READERS[ext];
  if (!fn) throw new Error(NOT_ALONE[ext] ?? `.${ext} は開けない形式です`);
  const src = new Src(blob, name);
  const sink = new Sink({ cap: opts.cap, offset: opts.offset, bytes: blob.size, selfShift: opts.selfShift });
  const ctx = { ext, name, progress, companions: opts.companions || {}, asset: opts.asset, assetURL: opts.assetURL, loadInner: (b, n) => loadInto(b, n, sink, ctx) };
  let info;
  try {
    info = (await fn(src, sink, ctx)) || {};
  } catch (e) { throw friendlyError(e, ext); }
  // グローバルシフトを決める。前のファイルの原点と大きく違うときは注記に足す
  const shiftNote = sink.settle();
  if (shiftNote) info.note = info.note ? `${info.note}。${shiftNote}` : shiftNote;
  return { sink, info };
}

// 入れ子のファイル（PhotoScan の中の PLY など）を同じ入れ物に読む
async function loadInto(blob, name, sink, ctx) {
  const ext = extOf(name);
  const fn = READERS[ext];
  if (!fn) throw new Error(`中の .${ext} は開けない形式です`);
  return fn(new Src(blob, name), sink, { ...ctx, ext, name });
}

export function loadMesh(m, opts) {
  const sink = new Sink({ cap: opts.cap, offset: opts.offset, selfShift: opts.selfShift });
  return { sink, mesh: m };
}
