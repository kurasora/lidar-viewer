// 展開に WebAssembly の部品を使う形式
//   .drc        … Draco（Google）。draco3d の展開器
//   .ifc        … IFC（BIM）。web-ifc で形を三角形にする
//   .stp .step  … STEP（CAD）。occt-import-js（OpenCASCADE）で形を三角形にする
import { IfcAPI } from 'web-ifc';
import occtimportjs from 'occt-import-js';
import { addMesh } from '../sink.js';
import { guard } from './image.js';
// three.js に入っている Draco の展開器（最後に export を足した写し）
import DracoDecoderModule from '../vendor/draco_wasm_wrapper.js';

const mods = {};
const once = (k, f) => (mods[k] ||= f().catch(e => { delete mods[k]; throw e; }));

// ------------------------------------------------------------------ Draco
export const readDRC = guard('Draco', readDRC_);
async function readDRC_(src, sink, ctx) {
  const D = await once('draco', async () => {
    const wasmBinary = await ctx.asset('draco_decoder.wasm');
    return new Promise((res, rej) => { try { DracoDecoderModule({ wasmBinary, onModuleLoaded: m => res(m) }); } catch (e) { rej(e); } });
  });
  const data = await src.all();
  const buf = new D.DecoderBuffer();
  buf.Init(new Int8Array(data.buffer, data.byteOffset, data.length), data.length);
  const dec = new D.Decoder();
  const type = dec.GetEncodedGeometryType(buf);
  let geo, status;
  if (type === D.TRIANGULAR_MESH) { geo = new D.Mesh(); status = dec.DecodeBufferToMesh(buf, geo); }
  else if (type === D.POINT_CLOUD) { geo = new D.PointCloud(); status = dec.DecodeBufferToPointCloud(buf, geo); }
  else throw new Error('Draco の形式が分かりません');
  try {
    if (!status.ok() || geo.ptr === 0) throw new Error('Draco を展開できませんでした: ' + status.error_msg());
    const n = geo.num_points();
    const attr = (t) => { const id = dec.GetAttributeId(geo, t); return id >= 0 ? dec.GetAttribute(geo, id) : null; };
    const read = (a, comps) => { const arr = new D.DracoFloat32Array(); dec.GetAttributeFloatForAllPoints(geo, a, arr); const out = new Float64Array(n * comps); for (let i = 0; i < n * comps; i++) out[i] = arr.GetValue(i); D.destroy(arr); return out; };
    const pa = attr(D.POSITION);
    if (!pa) throw new Error('Draco に座標がありません');
    const V = read(pa, 3);
    const ca = attr(D.COLOR);
    let C = null;
    if (ca) {
      const nc = ca.num_components();
      const f = read(ca, nc);
      const norm = (ca.normalized?.() ?? false) || ca.data_type?.() === D.DT_FLOAT32;
      let mx = 0; for (let i = 0; i < f.length; i++) mx = Math.max(mx, f[i]);
      const sc = norm && mx <= 1.0001 ? 255 : 1;
      C = new Uint8Array(n * 3);
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) C[3 * i + k] = Math.round(f[nc * i + k] * sc);
    }
    ctx.progress(0.6);
    if (type === D.TRIANGULAR_MESH) {
      const nf = geo.num_faces();
      const T = new Uint32Array(nf * 3), ia = new D.DracoInt32Array();
      for (let i = 0; i < nf; i++) { dec.GetFaceFromMesh(geo, i, ia); T[3 * i] = ia.GetValue(0); T[3 * i + 1] = ia.GetValue(1); T[3 * i + 2] = ia.GetValue(2); }
      D.destroy(ia);
      addMesh(sink, V, T, C);
      return { format: `Draco（メッシュ、三角形 ${nf.toLocaleString()}）`, note: '面の上に点を散らして表示しています' };
    }
    if (C) sink.rgb();
    sink.hint(n);
    for (let i = 0; i < n; i++) { const k = sink.slot(V[3 * i], V[3 * i + 1], V[3 * i + 2]); if (k >= 0 && C) { sink.C[3 * k] = C[3 * i]; sink.C[3 * k + 1] = C[3 * i + 1]; sink.C[3 * k + 2] = C[3 * i + 2]; } }
    return { format: 'Draco（点群）' };
  } finally { D.destroy(geo); D.destroy(dec); D.destroy(buf); }
}

// ------------------------------------------------------------------ IFC
export const readIFC = guard('IFC', readIFC_);
async function readIFC_(src, sink, ctx) {
  const api = await once('ifc', async () => {
    const a = new IfcAPI();
    const url = await ctx.assetURL('web-ifc.wasm');
    await a.Init(() => url, true);
    return a;
  });
  const data = await src.all();
  const model = api.OpenModel(data, { COORDINATE_TO_ORIGIN: false });
  const Vs = [], Ts = [], Cs = [];
  let nv = 0, count = 0;
  try {
    api.StreamAllMeshes(model, (mesh) => {
      const pg = mesh.geometries;
      for (let i = 0; i < pg.size(); i++) {
        const pl = pg.get(i);
        const g = api.GetGeometry(model, pl.geometryExpressID);
        const va = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
        const ix = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
        const M = pl.flatTransformation, c = pl.color;
        const m = va.length / 6; // x y z nx ny nz
        const V = new Float64Array(m * 3), C = new Uint8Array(m * 3);
        for (let j = 0; j < m; j++) {
          const x = va[6 * j], y = va[6 * j + 1], z = va[6 * j + 2];
          // web-ifc は Y が上の座標で返すので、Z が上に戻す
          const X = M[0] * x + M[4] * y + M[8] * z + M[12], Y = M[1] * x + M[5] * y + M[9] * z + M[13], Z = M[2] * x + M[6] * y + M[10] * z + M[14];
          V[3 * j] = X; V[3 * j + 1] = -Z; V[3 * j + 2] = Y;
          C[3 * j] = c.x * 255; C[3 * j + 1] = c.y * 255; C[3 * j + 2] = c.z * 255;
        }
        Vs.push(V); Cs.push(C); Ts.push(Array.from(ix, k => k + nv)); nv += m;
        g.delete?.();
      }
      count++;
    });
  } finally { api.CloseModel(model); }
  if (!nv) throw new Error('IFC に形が見つかりません');
  ctx.progress(0.8);
  const V = new Float64Array(nv * 3), C = new Uint8Array(nv * 3);
  let o = 0; Vs.forEach((a, i) => { V.set(a, o); C.set(Cs[i], o); o += a.length; });
  const T = Uint32Array.from(Ts.flat());
  addMesh(sink, V, T, C);
  return { format: `IFC（部材 ${count.toLocaleString()} 個、三角形 ${(T.length / 3).toLocaleString()}）`, note: '面の上に点を散らして表示しています' };
}

// ------------------------------------------------------------------ STEP
export const readSTEP = guard('STEP', readSTEP_);
async function readSTEP_(src, sink, ctx) {
  const occt = await once('occt', async () => occtimportjs({ wasmBinary: await ctx.asset('occt-import-js.wasm') }));
  const data = await src.all();
  const r = occt.ReadStepFile(data, { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 });
  if (!r.success) throw new Error('STEP を読めませんでした');
  const Vs = [], Ts = [], Cs = [];
  let nv = 0;
  for (const m of r.meshes) {
    const P = m.attributes.position.array, I = m.index.array, n = P.length / 3;
    const col = m.color ? m.color.map(x => Math.round(255 * x)) : [190, 190, 200];
    const C = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) C.set(col, 3 * i);
    // 面ごとの色があれば使う
    for (const bf of m.brep_faces || []) if (bf.color) { const fc = bf.color.map(x => Math.round(255 * x)); for (let t = bf.first; t <= bf.last; t++) for (let k = 0; k < 3; k++) C.set(fc, 3 * I[3 * t + k]); }
    Vs.push(Float64Array.from(P)); Cs.push(C); Ts.push(Array.from(I, k => k + nv)); nv += n;
  }
  if (!nv) throw new Error('STEP に形が見つかりません');
  ctx.progress(0.8);
  const V = new Float64Array(nv * 3), C = new Uint8Array(nv * 3);
  let o = 0; Vs.forEach((a, i) => { V.set(a, o); C.set(Cs[i], o); o += a.length; });
  const T = Uint32Array.from(Ts.flat());
  addMesh(sink, V, T, C);
  return { format: `STEP（形 ${r.meshes.length} 個、三角形 ${(T.length / 3).toLocaleString()}）`, note: '面の上に点を散らして表示しています（CloudCompare と同じく単位は mm のまま）' };
}
