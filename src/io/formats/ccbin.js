// CloudCompare の BIN（.bin、「CloudCompare entities」）
//   新しい形（BIN v2）: 先頭 4 バイト "CCB2"（4 文字目は読み方の印の数字: 1 = 座標が double、2 = 値の欄が float）
//     → 版（uint32。例: 50 = 5.0）→ 物の木（種類 ID・一意 ID・名前・印・メタデータ・中身・子の数・子 …）
//   数はリトルエンディアン。ただし Qt の QDataStream で書かれた部分（名前・メタデータ・一部の値）はビッグエンディアンで、
//   float も 8 バイトの double で書かれている
//   古い形（BIN v1、印なし）: 点群の数（uint32）→ 点群ごとに 点数・印・名前・float の xyz（+ 色・法線・距離）
//   ・点群の座標は「グローバルシフト」を戻して元の座標にする（元 = 書かれた値 / 倍率 − シフト）
//   ・表示用の変換行列（GL 変換）が有効なら、CloudCompare の表示と同じく当ててから戻す
//   ・メッシュは頂点の点群（子、または一意 ID で指す点群）から面を作り、面の上に点を散らす。ポリラインは線の上に点を並べる
//   ・ファイル全体をメモリに読み、まず木をたどって中身の位置だけを覚え、あとから点を取り出す
import { addMesh, addLines } from '../sink.js';

const CUT = 'BIN ファイルが途中で切れているか、壊れています';
const LAST_KNOWN = 58; // 中身の形を確かめた版（CloudCompare のソースでは 5.7 まで）

// ---- 種類 ID のビット（ccObject.h）
const B = {
  H: 0x1n, LEAF: 0x2n, GROUP: 0x4n, PRIM: 0x8n, ARRAY: 0x10n, LABEL: 0x20n, VIEWPORT: 0x40n, CUSTOM: 0x80n,
  CLOUD: 0x100n, MESH: 0x200n, OCTREE: 0x400n, POLY: 0x800n, IMAGE: 0x1000n, SENSOR: 0x2000n,
  PLANE: 0x4000n, SPHERE: 0x8000n, TORUS: 0x10000n, CYL: 0x20000n, CONE: 0x40000n, BOX: 0x80000n, DISH: 0x100000n, EXTRU: 0x200000n,
  KDTREE: 0x400000n, FACET: 0x800000n, MATERIAL: 0x1000000n, CLIPBOX: 0x2000000n, TRANSBUF: 0x4000000n, GBL: 0x8000000n,
  RGB: 0x10000000n, NORMAL: 0x20000000n, CNORMAL: 0x40000000n, TEX: 0x80000000n, CAMERA: 0x100000000n, QUADRIC: 0x200000000n,
  RGBA: 0x400000000n, CSYS: 0x800000000n, CLIPPART: 0x1000000000n, CIRCLE: 0x2000000000n, DISC: 0x4000000000n,
};
const T = {};
T.HOBJ = B.H; T.CLOUD = B.H | B.CLOUD; T.MESH = B.H | B.MESH; T.SUBMESH = T.MESH | B.LEAF; T.MESHGROUP = T.MESH | B.GROUP;
T.FACET = B.H | B.FACET; T.OCTREE = B.H | B.OCTREE | B.LEAF; T.KDTREE = B.H | B.KDTREE | B.LEAF;
T.POLY = B.H | B.POLY; T.CIRCLE = T.POLY | B.CIRCLE; T.IMAGE = B.H | B.IMAGE; T.CALIB = T.IMAGE | B.LEAF;
T.SENSOR = B.H | B.SENSOR; T.GBL = T.SENSOR | B.GBL; T.CAMERA = T.SENSOR | B.CAMERA;
T.PRIM = T.MESH | B.PRIM; T.PLANE = T.PRIM | B.PLANE; T.SPHERE = T.PRIM | B.SPHERE; T.TORUS = T.PRIM | B.TORUS; T.CONE = T.PRIM | B.CONE;
T.OLDCYL = T.PRIM | B.CYL; T.CYL = T.PRIM | B.CYL | B.CONE; T.BOX = T.PRIM | B.BOX; T.DISH = T.PRIM | B.DISH; T.EXTRU = T.PRIM | B.EXTRU;
T.QUADRIC = T.PRIM | B.QUADRIC; T.CSYS = T.PRIM | B.CSYS; T.DISC = T.PRIM | B.DISC;
T.MATSET = B.MATERIAL | B.GROUP | B.LEAF;
T.NORMALS = B.ARRAY | B.NORMAL | B.LEAF; T.NIDX = B.ARRAY | B.CNORMAL | B.LEAF; T.RGBARR = B.ARRAY | B.RGB | B.LEAF;
T.RGBAARR = B.ARRAY | B.RGBA | B.LEAF; T.TEXARR = B.ARRAY | B.TEX | B.LEAF;
T.LABEL2D = B.H | B.LABEL | B.LEAF; T.VP = B.H | B.VIEWPORT | B.LEAF; T.VPLABEL = T.VP | B.LABEL;
T.CLIPBOX = B.CLIPBOX | B.LEAF; T.CLIPPART = B.CLIPPART | B.LEAF; T.TRANSBUF = B.H | B.TRANSBUF | B.LEAF;
T.CUSTOMH = B.H | B.CUSTOM; T.CUSTOMLEAF = T.CUSTOMH | B.LEAF;

const NAMES = new Map([
  [T.HOBJ, 'グループ'], [T.CLOUD, '点群'], [T.MESH, 'メッシュ'], [T.SUBMESH, '部分メッシュ'], [T.MESHGROUP, 'メッシュのグループ'],
  [T.FACET, 'ファセット'], [T.OCTREE, '八分木'], [T.KDTREE, 'kd 木'], [T.POLY, 'ポリライン'], [T.CIRCLE, '円'], [T.IMAGE, '画像'],
  [T.CALIB, '古い「較正済み画像」'], [T.SENSOR, 'センサー'], [T.GBL, '地上レーザーのセンサー'], [T.CAMERA, 'カメラ'],
  [T.PRIM, '基本図形'], [T.PLANE, '平面'], [T.SPHERE, '球'], [T.TORUS, 'トーラス'], [T.CONE, '円錐'], [T.OLDCYL, '円柱'], [T.CYL, '円柱'],
  [T.BOX, '直方体'], [T.DISH, '皿形'], [T.EXTRU, '押し出し形'], [T.QUADRIC, '二次曲面'], [T.CSYS, '座標軸'], [T.DISC, '円板'],
  [T.MATSET, '材質'], [T.NORMALS, '法線の表'], [T.NIDX, '法線の表'], [T.RGBARR, '色の表'], [T.RGBAARR, '色の表'], [T.TEXARR, 'テクスチャ座標'],
  [T.LABEL2D, 'ラベル'], [T.VP, '視点'], [T.VPLABEL, '視点のラベル'], [T.CLIPBOX, '切り抜き箱'], [T.CLIPPART, '切り抜き箱の部品'],
  [T.TRANSBUF, '変換の列'], [T.CUSTOMH, 'プラグインの物'], [T.CUSTOMLEAF, 'プラグインの物'],
]);
const hex = c => '0x' + c.toString(16).toUpperCase();
const unsupported = (name, cls, what) => new Error(`この BIN ファイルの中の「${name || '名前なし'}」（${what || NAMES.get(cls) || '不明な物'}、種類 ${hex(cls)}）にはまだ対応していません`);

const tdUtf8 = new TextDecoder('utf-8');
const tdUtf16 = new TextDecoder('utf-16be');

// ---- バイト列を前から読む（LE = in.read で書かれた値、q… = QDataStream で書かれた値（BE））
class Rd {
  constructor(b) { this.b = b; this.d = new DataView(b.buffer, b.byteOffset, b.length); this.p = 0; }
  need(n) { if (!(n >= 0) || this.p + n > this.b.length) throw new Error(CUT); }
  skip(n) { this.need(n); this.p += n; }
  u8() { this.need(1); return this.b[this.p++]; }
  bool() { return this.u8() !== 0; }
  u16() { this.need(2); const v = this.d.getUint16(this.p, true); this.p += 2; return v; }
  u32() { this.need(4); const v = this.d.getUint32(this.p, true); this.p += 4; return v; }
  i32() { this.need(4); const v = this.d.getInt32(this.p, true); this.p += 4; return v; }
  u64() { this.need(8); const v = this.d.getUint32(this.p, true) + this.d.getUint32(this.p + 4, true) * 4294967296; this.p += 8; return v; }
  big64() { this.need(8); const v = this.d.getBigUint64(this.p, true); this.p += 8; return v; }
  f32() { this.need(4); const v = this.d.getFloat32(this.p, true); this.p += 4; return v; }
  f64() { this.need(8); const v = this.d.getFloat64(this.p, true); this.p += 8; return v; }
  qu16() { this.need(2); const v = this.d.getUint16(this.p, false); this.p += 2; return v; }
  qu32() { this.need(4); const v = this.d.getUint32(this.p, false); this.p += 4; return v; }
  qi32() { this.need(4); const v = this.d.getInt32(this.p, false); this.p += 4; return v; }
  qu64() { this.need(8); const v = this.d.getUint32(this.p, false) * 4294967296 + this.d.getUint32(this.p + 4, false); this.p += 8; return v; }
  qf64() { this.need(8); const v = this.d.getFloat64(this.p, false); this.p += 8; return v; }
  // 文字の固定長の欄（C の char[n]、0 で終わる）
  cstr(n) { this.need(n); const s = this.b.subarray(this.p, this.p + n); this.p += n; const e = s.indexOf(0); return tdUtf8.decode(e < 0 ? s : s.subarray(0, e)); }
  // QString: バイト数（uint32、0xFFFFFFFF なら空）+ UTF-16BE
  qstr() {
    const n = this.qu32();
    if (n === 0xffffffff) return '';
    this.need(n); const s = tdUtf16.decode(this.b.subarray(this.p, this.p + n)); this.p += n; return s;
  }
  // QByteArray / const char*: バイト数（uint32、0xFFFFFFFF なら空）+ 中身
  qbytes() {
    const n = this.qu32();
    if (n === 0xffffffff) return new Uint8Array(0);
    this.need(n); const s = this.b.subarray(this.p, this.p + n); this.p += n; return s;
  }
}

// 4×4 行列（OpenGL と同じ列優先）の積 a·b
function mul(a, b) {
  if (!a) return b; if (!b) return a;
  const m = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[r + 4 * k] * b[k + 4 * c];
    m[r + 4 * c] = s;
  }
  return m;
}
const isIdentity = m => m.every((v, i) => v === (i % 5 === 0 ? 1 : 0));

// ---- BIN v2 の木を読む（点などの大きな配列は、位置だけを覚えて飛ばす）
class Parser {
  constructor(b, version, flags) {
    this.r = new Rd(b); this.v = version;
    this.cs = (flags & 1) ? 8 : 4;    // 座標の 1 成分のバイト数（DF_POINT_COORDS_64_BITS）
    this.ss = (flags & 2) ? 4 : 8;    // 値の欄の 1 つのバイト数（DF_SCALAR_VAL_32_BITS）
    this.normals = false;
  }
  cls() {
    const r = this.r;
    let c = this.v < 34 ? BigInt(r.u32()) : r.big64();
    // 3.5〜4.7 の版では、カメラと二次曲面の種類 ID に誤ってプラグインのビットが立っていた
    if (this.v >= 35 && this.v <= 47 && (c & B.CUSTOM) && ((c & T.CAMERA) === T.CAMERA || (c & T.QUADRIC) === T.QUADRIC)) c &= ~B.CUSTOM;
    if (c === 0n) throw new Error(CUT);
    return c;
  }
  // 配列: 成分の数（1）+ 要素の数（4）+ 中身。size は 1 成分のバイト数
  array(size, comp = 0) {
    const r = this.r;
    const n = r.u8(), count = r.u32(), off = r.p;
    if (comp && n !== comp) throw new Error(CUT);
    r.skip(count * n * size);
    return { comp: n, count, off, size };
  }
  // GL 行列（float 16 個）
  mat() { const r = this.r, m = new Float64Array(16); for (let i = 0; i < 16; i++) m[i] = r.f32(); return m; }

  // 物 1 つ（ccHObject::fromFile）。parentM は親までの GL 変換
  obj(cls, parentM = null) {
    const r = this.r, v = this.v;
    const node = { cls, id: 0, name: '', children: [], M: parentM };
    // ccObject: 一意 ID・名前・印・メタデータ
    node.id = r.u32();
    node.name = v < 22 ? r.cstr(256) : r.qstr();
    node.flags = r.u32();
    node.meta = {};
    if (v >= 30) {
      const n = r.u32();
      for (let i = 0; i < n; i++) {
        const key = r.qstr();
        if (key === 'LAS.vlrs') this.lasVlrs(); // CloudCompare 自身も決まった形で読み飛ばしている
        else node.meta[key] = this.variant(node, key);
      }
    }
    // 中身
    this.meOnly(node, parentM);
    // 子
    const nc = r.u32();
    for (let i = 0; i < nc; i++) node.children.push(this.obj(this.cls(), node.M));
    if (v >= 23) r.skip(4);  // 選んだときの振る舞い
    if (v >= 45) r.skip(64); // 変換の履歴（行列）
    return node;
  }
  // ccHObject の表示の状態と GL 変換
  hobj(node, parentM) {
    const r = this.r;
    r.skip(5); // 表示・表示の固定・色・法線・値の欄の表示
    if (r.bool()) r.skip(3); // 色の上書き
    let M = null;
    if (r.bool()) { M = this.mat(); if (isIdentity(M)) M = null; }
    if (this.v >= 24) r.skip(1); // 名前を 3D に出すか
    node.M = mul(parentM, M);
  }
  meOnly(node, parentM) {
    const c = node.cls, r = this.r, v = this.v;
    if (c === T.HOBJ) return this.hobj(node, parentM);
    if (c === T.CLOUD) return this.cloud(node, parentM);
    if (c === T.MESH) { this.genericMesh(node, parentM); return this.mesh(node); }
    if ((c & T.PRIM) === T.PRIM && (c & ~(T.PRIM | B.PLANE | B.SPHERE | B.TORUS | B.CYL | B.CONE | B.BOX | B.DISH | B.EXTRU | B.QUADRIC | B.CSYS | B.DISC)) === 0n) {
      this.genericMesh(node, parentM); this.mesh(node); return this.primitive(node);
    }
    if (c === T.SUBMESH) { this.genericMesh(node, parentM); r.skip(4); this.array(4, 1); return; }
    if (c === T.MESHGROUP) {
      if (v >= 29) throw unsupported(node.name, c);
      this.genericMesh(node, parentM); r.skip(16); return;
    }
    if (c === T.POLY || c === T.CIRCLE) return this.polyline(node, parentM);
    if (c === T.FACET) {
      this.hobj(node, parentM);
      if (v < 32) throw unsupported(node.name, c);
      node.refs = [r.u32(), r.u32(), r.u32(), r.u32()]; // 元の点・輪郭の点・輪郭の線・面
      r.skip(7 * this.cs + 16 + this.cs); // 平面の式・中心・RMS・面積・最大の辺
      return;
    }
    // 配列（点群の中にも、メッシュの子にも出てくる）。ccHObject の表示の状態は持たない
    if (c === T.RGBARR || c === T.RGBAARR) { node.arr = this.array(1); return; }
    if (c === T.NORMALS) { node.arr = this.array(this.cs, 3); return; }
    if (c === T.NIDX) { node.arr = this.array(v < 41 ? 2 : 4, 1); return; }
    if (c === T.TEXARR) { node.arr = this.array(4, 2); return; }
    if (c === T.MATSET) return this.materials(node, parentM);
    if (c === T.IMAGE) {
      this.hobj(node, parentM);
      r.skip(4);                 // センサーの一意 ID
      r.skip(4 + 4 + 8 + 8 + 8 + 8); // 幅・高さ・縦横比・テクスチャ U・V・透明度
      this.qimage(); r.qstr();
      return;
    }
    if (c === T.GBL || c === T.CAMERA) return this.sensor(node, parentM);
    if (c === T.LABEL2D) {
      this.hobj(node, parentM);
      const n = r.u32();
      for (let i = 0; i < n; i++) { r.skip(8); if (v >= 49) r.skip(4 + 16); if (v >= 50) r.skip(1); }
      r.skip(8 + 1); if (v > 20) r.skip(2);
      return;
    }
    if (c === T.VP || c === T.VPLABEL) {
      this.hobj(node, parentM);
      r.skip(v >= 36 ? 128 : 64);         // 視点の行列
      r.skip(v < 51 ? 16 : 8);            // 画素の大きさ + 拡大率、または焦点距離
      r.skip(8 + 8 + 1 + 1);              // 点の大きさ・線の太さ・透視投影・物中心
      r.skip(v >= 36 ? 48 : 24 + (v >= 25 ? 24 : 0)); // 回転の中心・カメラの位置
      r.skip(16);                         // 画角・縦横比
      if (v < 25) r.skip(16);
      if (v >= 30 && v < 51) r.skip(8);
      if (v >= 53) r.skip(16);            // 手前と奥の切り取り
      if (c === T.VPLABEL) { if (v < 21) throw unsupported(node.name, c); r.skip(32); }
      return;
    }
    if (c === T.TRANSBUF) {
      this.hobj(node, parentM);
      const n = r.u32();
      r.skip(n * (64 + 8)); r.skip(1 + 1 + 4);
      return;
    }
    if ((c & T.CUSTOMH) === T.CUSTOMH) {
      const cn = node.meta.class_name, pn = node.meta.plugin_name;
      throw unsupported(node.name, c, `プラグイン${pn ? `「${pn}」` : ''}の物${cn ? `「${cn}」` : ''}`);
    }
    throw unsupported(node.name, c);
  }

  // ---- 点群（ccGenericPointCloud + ccPointCloud）
  cloud(node, parentM) {
    const r = this.r, v = this.v;
    this.hobj(node, parentM);
    node.shift = [r.f64(), r.f64(), r.f64()];
    node.scale = v >= 33 ? r.f64() : 1;
    if (!(node.scale > 0) || !isFinite(node.scale)) node.scale = 1;
    if (r.bool()) this.array(1, 1); // 見える・見えないの表
    if (v >= 24) r.skip(1);         // 点の大きさ
    node.pts = this.array(this.cs, 3);
    // 色
    if (r.bool()) {
      const c = this.cls();
      if (c !== T.RGBARR && c !== T.RGBAARR) throw new Error(CUT);
      const a = this.obj(c).arr;
      if (a.count) node.col = a;
    }
    // 法線（使わないが、読み飛ばす）
    if (r.bool()) {
      const c = this.cls();
      if (c !== T.NIDX) throw new Error(CUT);
      this.obj(c);
      this.normals = true;
    }
    // 値の欄
    const nsf = r.u32();
    node.sfs = [];
    for (let i = 0; i < nsf; i++) node.sfs.push(this.scalarField());
    if (v < 27) r.skip(1);
    r.skip(1 + 4); // 色の目盛りの表示・表示中の値の欄
    // 格子（スキャンの並び）
    if (v >= 41) {
      const n = r.u32();
      for (let i = 0; i < n; i++) {
        const w = r.u32(), h = r.u32();
        r.skip(128 + 4 * w * h);
        if (r.bool()) r.skip(3 * w * h);
      }
    }
    // 波形（フルウェーブフォーム）
    if (v >= 44 && r.bool()) {
      const nd = r.u32();
      r.skip(nd * (1 + 25));
      const nw = r.u32();
      for (let i = 0; i < nw; i++) if (r.u8() !== 0) r.skip(4 + 8 + 24 + 8 + (v > 46 ? 1 : 0));
      r.skip(r.u64());
    }
  }
  scalarField() {
    const r = this.r, v = this.v;
    let name;
    if (v < 55) name = r.cstr(256);
    else { const n = r.u16(); r.need(n); name = tdUtf8.decode(r.b.subarray(r.p, r.p + n)); r.p += n; }
    if (v < 26) r.skip(1);
    const a = this.array(this.ss, 1);
    r.skip(6 * 8);                    // 表示の範囲・飽和の範囲
    if (v < 27) r.skip(1);
    r.skip(1);                        // 対数目盛り
    if (v < 27) r.skip(1);
    else r.skip(3);                   // 対称・NaN を灰色・0 を常に表示
    if (v < 27) r.skip(4);
    else if (r.bool()) this.colorScale();
    r.skip(4);                        // 色の段数
    const offset = v >= 42 ? r.f64() : 0;
    return { name, a, offset };
  }
  colorScale() {
    const r = this.r, v = this.v;
    r.qstr(); r.qstr();               // 名前・UUID
    r.skip(1 + 8 + 8 + 1);
    const n = r.u32();
    r.skip(n * (8 + 11));             // 位置（double）+ QColor
    if (v >= 40) {
      const m = r.u32();
      for (let i = 0; i < m; i++) { r.skip(8); if (v >= 54) r.qstr(); }
    }
  }

  // ---- メッシュ
  genericMesh(node, parentM) {
    this.hobj(node, parentM);
    this.r.skip(1);
    if (this.v >= 29) this.r.skip(3);
  }
  mesh(node) {
    const r = this.r;
    node.vert = r.u32();
    r.skip(12); // 面の法線・テクスチャ座標・材質の一意 ID
    node.tri = this.array(4, 3);
    if (r.bool()) this.array(4, 1);   // 面ごとの材質
    if (r.bool()) this.array(4, 3);   // 面ごとのテクスチャ座標の番号
    if (this.v < 29) r.skip(1);
    if (r.bool()) this.array(4, 3);   // 面ごとの法線の番号
    if (this.v < 29) r.skip(2);
  }
  primitive(node) {
    const r = this.r, c = node.cls;
    r.skip(64 + 4); // 形の行列・描く細かさ
    const d = 8;    // QDataStream の数は float も 8 バイト
    if (c === T.PLANE || c === T.CSYS) r.skip(2 * d);
    else if (c === T.SPHERE || c === T.DISC) r.skip(d);
    else if (c === T.TORUS) r.skip(2 * d + 1 + d + d);
    else if (c === T.CONE || c === T.CYL || c === T.OLDCYL) r.skip(5 * d);
    else if (c === T.BOX || c === T.DISH) r.skip(3 * d);
    else if (c === T.EXTRU) { r.skip(d); const n = r.qi32(); if (n <= 0) throw new Error(CUT); r.skip(n * 2 * d); }
    else if (c === T.QUADRIC) r.skip(10 * d);
    else throw unsupported(node.name, c);
  }

  // ---- ポリライン（円も同じ形 + 半径・細かさ）
  polyline(node, parentM) {
    const r = this.r, v = this.v;
    this.hobj(node, parentM);
    if (v < 28) throw unsupported(node.name, node.cls);
    node.vert = r.u32();
    const n = r.u32();
    r.need(4 * n);
    node.idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) node.idx[i] = r.u32();
    if (v >= 39) { node.shift = [r.f64(), r.f64(), r.f64()]; node.scale = r.f64(); }
    node.closed = r.bool();
    node.rgb = [r.u8(), r.u8(), r.u8()];
    r.skip(2);           // 2D 表示・前面
    if (v >= 31) r.skip(8); // 線の太さ
    if (node.cls === T.CIRCLE) r.skip(8 + 4);
  }

  // ---- 材質（テクスチャの画像も中に入る）
  materials(node, parentM) {
    const r = this.r, v = this.v;
    this.hobj(node, parentM);
    const n = r.u32();
    if (!n) return;
    for (let i = 0; i < n; i++) {
      r.qstr();
      if (v < 37) this.qimage(); else r.qstr();
      r.skip(5 * 16 + 2 * 8);
    }
    if (v >= 37) {
      const t = r.qu32();
      for (let i = 0; i < t; i++) { r.qstr(); this.qimage(); }
    }
  }
  // QImage: 印（int32、0 なら空）+ PNG のファイルそのもの（長さは書かれないので、PNG の区切りをたどる）
  qimage() {
    const r = this.r;
    if (r.qi32() === 0) return;
    r.need(8);
    if (r.b[r.p] !== 0x89 || r.b[r.p + 1] !== 0x50 || r.b[r.p + 2] !== 0x4e || r.b[r.p + 3] !== 0x47) throw new Error('BIN ファイルの中の画像が読めません（PNG ではありません）');
    r.skip(8);
    for (;;) {
      const len = r.qu32();
      r.need(4); const type = String.fromCharCode(...r.b.subarray(r.p, r.p + 4)); r.p += 4;
      r.skip(len + 4);
      if (type === 'IEND') break;
    }
  }

  // ---- センサー
  sensor(node, parentM) {
    const r = this.r, v = this.v, c = node.cls;
    this.hobj(node, parentM);
    if (v < 34) throw unsupported(node.name, c);
    r.skip(64);        // 位置と向き
    r.skip(8 + 8);     // 今の番号・表示の大きさ
    r.skip(3 + 4);     // 色・位置の列の一意 ID
    if (c === T.GBL) {
      r.skip(4 + 6 * 8 + 2 * 8 + 8);
      if (v >= 38) r.skip(2);
      return;
    }
    if (v < 35) throw unsupported(node.name, c);
    if (v < 38) r.skip(64);
    r.skip(8 + 4 + 4 + 16 + 8 + 8 + 8 + 8); // 焦点距離・画素数・画素の大きさ・ゆがみ・画角・手前・奥
    if (v >= 43) r.skip(16);                // 主点
    const model = v < 38 ? 2 : r.qu32();
    if (model === 1) r.skip(2 * 8);
    else if (model === 3) r.skip(3 * 8);
    else if (model === 2) r.skip(9 * 8);
    if (v < 38) r.skip(1);
    r.skip(2 + 3 * 8);                      // 視錐台の表示・中心
    if (v < 38) r.skip(8 * 3 * 8);
  }

  // ---- メタデータ（QVariant）
  variant(node, key) {
    const r = this.r;
    const t = r.qu32();
    r.skip(1); // 空かどうか
    if (t === 1024 || t === 65536) { // 利用者が決めた型
      const nm = tdUtf8.decode(r.qbytes()).replace(/\0+$/, '');
      throw new Error(`この BIN ファイルの中の「${node.name || '名前なし'}」のメタデータ「${key}」（型 ${nm}）が読めません`);
    }
    switch (t) {
      case 0: case 51: return null;
      case 1: return r.u8() !== 0;
      case 2: return r.qi32();
      case 3: return r.qu32();
      case 4: case 5: case 32: case 35: return r.qu64();
      case 6: case 38: return r.qf64();
      case 7: case 33: case 36: return r.qu16();
      case 34: case 37: case 40: return r.u8();
      case 8: case 28: { const n = r.qu32(), o = {}; for (let i = 0; i < n; i++) { const k = r.qstr(); o[k] = this.variant(node, key); } return o; }
      case 9: { const n = r.qu32(), a = []; for (let i = 0; i < n; i++) a.push(this.variant(node, key)); return a; }
      case 10: case 17: case 18: return r.qstr();
      case 11: { const n = r.qu32(), a = []; for (let i = 0; i < n; i++) a.push(r.qstr()); return a; }
      case 12: return r.qbytes();
      case 13: { const n = r.qu32(); r.skip(Math.ceil(n / 8)); return null; }
      case 14: r.skip(8); return null;            // QDate
      case 15: r.skip(4); return null;            // QTime
      case 16: {                                  // QDateTime
        r.skip(8 + 4);
        const spec = r.u8();
        if (spec === 2) r.skip(4); else if (spec === 3) r.qstr();
        return null;
      }
      case 19: case 23: r.skip(16); return null;  // QRect・QLine
      case 20: case 24: r.skip(32); return null;  // QRectF・QLineF
      case 21: case 25: r.skip(8); return null;   // QSize・QPoint
      case 22: case 26: r.skip(16); return null;  // QSizeF・QPointF
      case 30: r.skip(16); return null;           // QUuid
      case 49: { const n = r.qu32(), a = []; for (let i = 0; i < n; i++) a.push(r.qbytes()); return a; }
      case 67: r.skip(11); return null;           // QColor（Qt 5）
    }
    throw new Error(`この BIN ファイルの中の「${node.name || '名前なし'}」のメタデータ「${key}」（QVariant の型 ${t}）にはまだ対応していません`);
  }
  // LAS の VLR（CloudCompare の LAS プラグインが入れる独自の型）
  lasVlrs() {
    const r = this.r;
    r.skip(16);
    const n = r.qu64();
    for (let i = 0; i < n; i++) { r.skip(2 + 16 + 2); const len = r.qu16(); r.skip(32 + len); }
    r.skip(272 * r.qu64());
  }
}

// ---- 点群の座標を元の座標で読む関数（i 番目 → out[0..2]）
function pointReader(b, cloud, M, shiftOwner) {
  const d = new DataView(b.buffer, b.byteOffset, b.length);
  const a = cloud.pts, off = a.off, dbl = a.size === 8;
  const own = shiftOwner || cloud;
  const sh = own.shift || [0, 0, 0], sc = own.scale || 1;
  return (i, out) => {
    const o = off + 3 * a.size * i;
    let x, y, z;
    if (dbl) { x = d.getFloat64(o, true); y = d.getFloat64(o + 8, true); z = d.getFloat64(o + 16, true); }
    else { x = d.getFloat32(o, true); y = d.getFloat32(o + 4, true); z = d.getFloat32(o + 8, true); }
    if (M) {
      const X = M[0] * x + M[4] * y + M[8] * z + M[12], Y = M[1] * x + M[5] * y + M[9] * z + M[13], Z = M[2] * x + M[6] * y + M[10] * z + M[14];
      const w = M[3] * x + M[7] * y + M[11] * z + M[15];
      if (w !== 1 && w !== 0) { x = X / w; y = Y / w; z = Z / w; } else { x = X; y = Y; z = Z; }
    }
    // 元 = 書かれた値 / 倍率 − シフト
    out[0] = x / sc - sh[0]; out[1] = y / sc - sh[1]; out[2] = z / sc - sh[2];
  };
}

// addMesh は先に頂点を nv 個入れてから面の上の点を入れる。頂点がすでに点群として入っているときは、
// 最初の nv 個を捨てる入れ物を間にはさみ、面の上の点だけを足す
function facesOnly(sink, nv) {
  let skip = nv;
  return {
    rgb: () => sink.rgb(),
    get C() { return sink.C; },
    gray: k => sink.gray(k),
    slot: (x, y, z) => (skip > 0 ? (skip--, -1) : sink.slot(x, y, z)),
  };
}

// ---- BIN v1（古い形）
function readV1(b, sink, ctx) {
  const r = new Rd(b);
  const nc = r.u32();
  const NOT = 'CloudCompare の BIN ファイルではないようです（先頭に「CCB2」の印がなく、古い形としても読めません）';
  if (nc === 0 || nc > 100000) throw new Error(NOT);
  // まず形を確かめる（サイズがぴったり合うか）
  const clouds = [];
  try {
    for (let k = 0; k < nc; k++) {
      const n = r.u32(), f = r.u8();
      const c = { n, rgb: !!(f & 2), nrm: !!(f & 4), sf: !!(f & 8), name: '', sfName: 'scalar field' };
      const zstr = max => { const s = r.p; let e = s; while (e < s + max && e < b.length && b[e] !== 0) e++; const t = tdUtf8.decode(b.subarray(s, e)); r.p = Math.min(e + 1, s + max); return t; };
      if (f & 16) c.name = zstr(256);
      if (f & 32) c.sfName = zstr(1024) || 'scalar field';
      c.stride = 12 + (c.rgb ? 3 : 0) + (c.nrm ? 12 : 0) + (c.sf ? 8 : 0);
      c.off = r.p;
      r.skip(n * c.stride);
      clouds.push(c);
    }
  } catch (e) { throw new Error(NOT); }
  if (r.p !== b.length) throw new Error(NOT);
  const d = r.d;
  const total = clouds.reduce((s, c) => s + c.n, 0);
  sink.hint(total);
  if (clouds.some(c => c.rgb)) sink.rgb();
  const fi = new Map();
  for (const c of clouds) if (c.sf && !fi.has(c.sfName.toLowerCase())) fi.set(c.sfName.toLowerCase(), sink.field(c.sfName.toLowerCase()));
  let done = 0;
  for (const c of clouds) {
    const f = c.sf ? fi.get(c.sfName.toLowerCase()) : -1;
    for (let i = 0; i < c.n; i++) {
      const o = c.off + i * c.stride;
      const k = sink.slot(d.getFloat32(o, true), d.getFloat32(o + 4, true), d.getFloat32(o + 8, true));
      if ((++done & 0xffff) === 0) ctx.progress(done / total);
      if (k < 0) continue;
      if (c.rgb) { sink.C[3 * k] = b[o + 12]; sink.C[3 * k + 1] = b[o + 13]; sink.C[3 * k + 2] = b[o + 14]; }
      else if (sink.C) sink.gray(k);
      for (const [, j] of fi) sink.F[j][k] = 0;
      if (f >= 0) {
        const val = d.getFloat64(o + 12 + (c.rgb ? 3 : 0) + (c.nrm ? 12 : 0), true);
        sink.F[f][k] = val === -1 ? NaN : val; // 昔の「隠した点」は -1
      }
    }
  }
  ctx.progress(1);
  return { format: `CloudCompare BIN（古い形 v1、点群 ${nc} 個、${total.toLocaleString()} 点）`, note: clouds.some(c => c.nrm) ? '法線は使いません' : '' };
}

export async function read(src, sink, ctx) {
  const b = await src.all();
  if (b.length < 8) throw new Error('CloudCompare の BIN ファイルではないようです（短すぎます）');
  if (b[0] !== 0x43 || b[1] !== 0x43 || b[2] !== 0x42) return readV1(b, sink, ctx); // "CCB" でなければ古い形
  const fc = b[3] - 48;
  if (!(fc >= 0 && fc <= 8)) throw new Error(`CloudCompare の BIN ファイルの先頭の印が違います（4 文字目が「${String.fromCharCode(b[3])}」）`);
  const v = new DataView(b.buffer, b.byteOffset, 8).getUint32(4, true);
  if (v < 20) throw new Error(`CloudCompare の BIN ファイルの版（${v}）がおかしいです`);
  const vs = `${Math.floor(v / 10)}.${v % 10}`;

  // 1) 木を読む
  const P = new Parser(b, v, fc);
  P.r.p = 8;
  let root;
  try {
    root = P.obj(P.cls());
  } catch (e) {
    if (v > LAST_KNOWN && e.message === CUT) throw new Error(`この BIN ファイルは新しい版（${vs}）の CloudCompare で書かれていて、読めませんでした`);
    throw e;
  }
  ctx.progress(0.02);

  // 2) 出すものを集める
  const all = [];
  const walk = n => { all.push(n); n.children.forEach(walk); };
  walk(root);
  const byId = new Map();
  for (const n of all) if (n.cls === T.CLOUD && !byId.has(n.id)) byId.set(n.id, n);
  const meshes = all.filter(n => n.tri);
  const polys = all.filter(n => n.idx);
  // メッシュやポリラインの中にしまわれた頂点の点群（ふつうは子の「vertices」）は単独では出さない。
  // 外の点群をそのまま頂点に使うもの（2.5D の三角形分割など）は、点群は点群として出し、メッシュは面の上の点だけを足す
  const inside = (n, id) => n.children.some(c => c.id === id || inside(c, id));
  const used = new Set();
  for (const n of [...meshes, ...polys]) { n.own = inside(n, n.vert); if (n.own) used.add(n.vert); }
  for (const n of all) if (n.refs) n.refs.forEach(id => used.add(id)); // ファセットの中の点群・線・面
  const clouds = all.filter(n => n.cls === T.CLOUD && !used.has(n.id) && n.pts.count);
  let missing = 0;
  const meshOut = meshes.filter(n => { const c = byId.get(n.vert); if (!c || !c.pts.count) { if (n.tri.count) missing++; return false; } return n.tri.count > 0 || c.pts.count > 0; });
  const polyOut = polys.filter(n => { const c = byId.get(n.vert); if (!c) { missing++; return false; } return n.idx.length > 0; });
  const skippedKinds = new Set();
  for (const n of all) {
    if (n.cls === T.LABEL2D || n.cls === T.VP || n.cls === T.VPLABEL) skippedKinds.add('ラベル');
    else if (n.cls === T.GBL || n.cls === T.CAMERA) skippedKinds.add('センサー');
    else if (n.cls === T.IMAGE) skippedKinds.add('画像');
  }
  if (!clouds.length && !meshOut.length && !polyOut.length) throw new Error('この BIN ファイルには点群・メッシュ・ポリラインが入っていません');

  // 3) 値の欄と色を先にそろえる（点群ごとに欄が違っても、ない欄は 0 にする）
  const total = clouds.reduce((s, c) => s + c.pts.count, 0);
  sink.hint(total + meshOut.reduce((s, m) => s + byId.get(m.vert).pts.count, 0));
  const anyColor = clouds.some(c => c.col) || meshOut.some(m => byId.get(m.vert).col);
  if (anyColor) sink.rgb();
  const fieldIdx = new Map();
  for (const c of clouds) for (const sf of c.sfs) {
    const nm = (sf.name || 'scalar field').toLowerCase();
    // CloudCompare が付けた値のずれがある・double の欄は double で持つ（足し戻したあと float32 にすると桁が落ちる）
    fieldIdx.set(nm, sink.field(nm, !!sf.offset || sf.a?.size === 8));
  }
  const allFields = [...fieldIdx.values()];
  const d = new DataView(b.buffer, b.byteOffset, b.length);
  const P3 = [0, 0, 0];

  // 4) 点群
  let done = 0;
  const work = Math.max(1, total);
  for (const c of clouds) {
    const get = pointReader(b, c, c.M);
    const n = c.pts.count;
    const col = c.col && c.col.count >= n && c.col.comp >= 3 ? c.col : null;
    const sfs = c.sfs.filter(sf => sf.a.count >= n).map(sf => ({ k: fieldIdx.get((sf.name || 'scalar field').toLowerCase()), off: sf.a.off, sz: sf.a.size, add: sf.offset || 0 }));
    const own = new Set(sfs.map(s => s.k));
    const others = allFields.filter(k => !own.has(k));
    const cc = col ? col.comp : 0;
    for (let i = 0; i < n; i++) {
      get(i, P3);
      const k = sink.slot(P3[0], P3[1], P3[2]);
      if ((++done & 0xffff) === 0) ctx.progress(0.02 + 0.9 * done / work);
      if (k < 0) continue;
      if (col) { const o = col.off + cc * i; sink.C[3 * k] = b[o]; sink.C[3 * k + 1] = b[o + 1]; sink.C[3 * k + 2] = b[o + 2]; }
      else if (sink.C) sink.gray(k);
      for (let j = 0; j < sfs.length; j++) {
        const s = sfs[j];
        sink.F[s.k][k] = (s.sz === 4 ? d.getFloat32(s.off + 4 * i, true) : d.getFloat64(s.off + 8 * i, true)) + s.add;
      }
      for (let j = 0; j < others.length; j++) sink.F[others[j]][k] = 0;
    }
  }
  ctx.progress(0.92);

  // 5) メッシュ（基本図形も含む）
  let nTri = 0;
  for (const m of meshOut) {
    const c = byId.get(m.vert), nv = c.pts.count;
    const get = pointReader(b, c, m.M);
    const V = new Float64Array(3 * nv);
    for (let i = 0; i < nv; i++) { get(i, P3); V[3 * i] = P3[0]; V[3 * i + 1] = P3[1]; V[3 * i + 2] = P3[2]; }
    const tri = new Uint32Array(3 * m.tri.count);
    let t = 0;
    for (let i = 0; i < m.tri.count; i++) {
      const o = m.tri.off + 12 * i, a = d.getUint32(o, true), bb = d.getUint32(o + 4, true), cc = d.getUint32(o + 8, true);
      if (a >= nv || bb >= nv || cc >= nv) continue; // 頂点の番号が範囲外の面は捨てる
      tri[t++] = a; tri[t++] = bb; tri[t++] = cc;
    }
    nTri += t / 3;
    let C = null;
    if (c.col && c.col.count >= nv && c.col.comp >= 3) {
      C = new Uint8Array(3 * nv);
      for (let i = 0; i < nv; i++) { const o = c.col.off + c.col.comp * i; C[3 * i] = b[o]; C[3 * i + 1] = b[o + 1]; C[3 * i + 2] = b[o + 2]; }
    }
    addMesh(m.own ? sink : facesOnly(sink, nv), V, tri.subarray(0, t), C);
  }
  ctx.progress(0.97);

  // 6) ポリライン
  if (polyOut.length) {
    const colored = !!sink.C || (!clouds.length && !meshOut.length);
    const lines = [];
    for (const pl of polyOut) {
      const c = byId.get(pl.vert), nv = c.pts.count;
      const get = pointReader(b, c, pl.M, pl.shift ? pl : c);
      const V = [];
      for (const i of pl.idx) { if (i >= nv) continue; get(i, P3); V.push(P3[0], P3[1], P3[2]); }
      if (V.length) lines.push(colored ? { V, closed: pl.closed, C: pl.rgb } : { V, closed: pl.closed });
    }
    if (lines.length) addLines(sink, lines);
  }
  ctx.progress(1);

  // 7) 説明
  const parts = [`v${vs}`];
  if (clouds.length) parts.push(`点群 ${clouds.length} 個、${total.toLocaleString()} 点`);
  if (meshOut.length) parts.push(`メッシュ ${meshOut.length} 個、三角形 ${nTri.toLocaleString()}`);
  if (polyOut.length) parts.push(`ポリライン ${polyOut.length} 本`);
  const notes = [];
  if (meshOut.length) notes.push('面の上に点を散らして表示しています');
  if (polyOut.length) notes.push('線の上に点を並べて表示しています');
  if (P.normals) notes.push('法線は使いません');
  if (skippedKinds.size) notes.push(`${[...skippedKinds].join('・')}は表示しません`);
  if (missing) notes.push(`頂点の点群が見つからないメッシュ・ポリライン ${missing} 個を除きました`);
  return { format: `CloudCompare BIN（${parts.join('、')}）`, note: notes.join('。') };
}
