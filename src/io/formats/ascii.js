// 文字の点群（.txt .asc .neu .xyz .pts .csv）と、CSV の高さの表（CSV matrix）
//   列の意味は CloudCompare と同じく「見出しがあれば見出しで、なければ並びと値から推測」する
//     x y z [強度] [r g b] [nx ny nz] …（色は 0〜255 の整数 3 つ、法線は長さ 1 の 3 つ組を探す）
import { eachLine, numbersIn, cellsIn, decode, wordsIn, parseToken } from '../util.js';

const NAMES = {
  // 「X_m」「px」「pos_x」「position.x」「point_x」も座標とみなす（R12-004）
  x: /^((p|pos|position|point)?[._]?x([._]?m)?|east(ing)?|e|lon(gitude)?)$/i, y: /^((p|pos|position|point)?[._]?y([._]?m)?|north(ing)?|n|lat(itude)?)$/i, z: /^((p|pos|position|point)?[._]?z([._]?m)?|h|height|elev(ation)?|alt(itude)?|up)$/i,
  r: /^(r|red|colou?r_?r)$/i, g: /^(g|green|colou?r_?g)$/i, b: /^(b|blue|colou?r_?b)$/i,
  nx: /^(nx|normal_?x)$/i, ny: /^(ny|normal_?y)$/i, nz: /^(nz|normal_?z)$/i,
};

// CSV の高さの表とみなすのは、名前に matrix / grid / dem の語（demo などの一部ではなく）があるか、
// 見出しがなく 32 列以上の数がそろっているときだけ。見出しに x があれば点群
function looksMatrix(rows, ext, name, names) {
  if (ext !== 'csv') return false;
  // 単位付きの見出し（「x [m]」「Easting (m)」など）も x とみなす（R2-002）
  if (names && names.some(s => NAMES.x.test(bare(s)))) return false;
  const base = name.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  const w = rows[0]?.length || 0;
  // 名前で表とみなすのは 8 列以上のときだけ（「x y z」の 3〜7 列は、名前に dem などがあっても点の並び）（R2-002）
  if (w >= 8 && /(^|[^a-z0-9])(matrix|grid|dem)([^a-z0-9]|$)/i.test(base)) return true;
  return !names && w >= 32 && rows.every(r => r.length === w);
}

const MAX_COLS = 1000;
const toNum = s => (s === '' ? NaN : Number(s));
const numLike = s => s === '' || Number.isFinite(Number(s)) || /^[+-]?(nan|inf(inity)?)$/i.test(s);
const bare = s => s.replace(/\s*[[(（].*$/, '').trim(); // 単位を除いた見出し（「x [m]」→「x」）
const cleanName = s => s.replace(/^\/\//, '').trim().replace(/^["']+|["']+$/g, '').trim();

export async function read(src, sink, ctx) {
  const ext = ctx.ext;
  const head = decode(await src.read(0, 1 << 16)); // 先頭の BOM は TextDecoder が除く
  const lines = head.split(/\r\n|\r|\n/);
  if (src.size > (1 << 16)) lines.pop(); // 途中で切れた最後の行は使わない
  // 区切り: 数の行にカンマ（なければセミコロン）があれば CSV（空のセルも 1 列に数える）、なければ空白
  const dataLines = lines.map(l => l.trim()).filter(t => t && !t.startsWith('//') && !t.startsWith('#')).slice(0, 50);
  // 行末のカンマだけ（「x y z 5,」のような空白区切り）は CSV とみなさない（R8-003）。区切りで 3 つ以上のセルになる行があれば CSV
  const cellsBy = (t, d) => { const c = t.split(d); while (c.length && c[c.length - 1].trim() === '') c.pop(); return c.length; };
  const delim = dataLines.some(t => cellsBy(t, ',') >= 3) ? ',' : dataLines.some(t => cellsBy(t, ';') >= 3) ? ';' : null;
  const split = t => (delim ? t.split(delim).map(s => s.trim().replace(/^["']+|["']+$/g, '').trim()) : wordsIn(t));
  // 先頭の注釈・見出し・点の数の行を飛ばす
  let skip = 0, names = null, count = 0;
  const sampleRows = [], sampleRaw = [];
  for (let li = 0; li < lines.length && sampleRows.length < 200; li++) {
    const raw = lines[li], t = raw.trim();
    if (!sampleRows.length) {
      if (!t) { skip++; continue; }
      if (t.startsWith('//') || t.startsWith('#')) {
        const w = split(t.replace(/^(\/\/|#)\s*/, '')).map(cleanName);
        if (w.length >= 3 && w.some(s => NAMES.x.test(bare(s)))) names = w;
        skip++; continue;
      }
      const w = split(t);
      if (w.length === 1 && Number.isInteger(Number(w[0]))) { count = Number(w[0]); skip++; continue; } // .pts の点の数
      if (!w.every(numLike)) { // 英字などを含む語がある = 見出しの行（nan・inf は数とみなす）
        if (w.length >= 3) names = w.map(cleanName);
        skip++; continue;
      }
    }
    if (!t) continue;
    const w = split(t);
    sampleRaw.push(w);
    sampleRows.push(w.map(toNum));
  }
  if (!sampleRows.length) throw new Error('数値の行が見つかりません');
  if (looksMatrix(sampleRows, ext, src.name, names)) return readMatrix(src, sink, ctx);

  const ncol = names ? Math.max(names.length, sampleRows[0].length) : sampleRows[0].length;
  if (ncol < 3) throw new Error(`列が ${ncol} 列しかありません（x y z の 3 列以上が必要です）`);
  if (ncol > MAX_COLS) throw new Error(`1 行の列が多すぎます（${ncol.toLocaleString()} 列）。改行の形式が違うか、点群の文字ファイルではない可能性があります`);
  // 列の役割を決める
  const role = new Array(ncol).fill(null);
  if (names) {
    names.forEach((nm, i) => {
      const s = bare(nm.replace(/^\/\//, '').trim());
      for (const [k, re] of Object.entries(NAMES)) if (re.test(s) && !role.includes(k)) { role[i] = k; break; }
    });
  }
  // 見出しで x が決まらず、1 列目が時刻・番号の見出しなら、2〜4 列目を x y z にする（時刻を x にしない。R12-004）
  const timeFirst = names && ncol >= 4 && /^(t|time|times?tamp|stamp|sec|secs|gps_?time|id|index|no|#)([._ ]?(s|sec|ms|us|ns))?$/i.test(bare(names[0] || ''));
  if (!role.includes('x')) { const o = timeFirst ? 1 : 0; role[o] = 'x'; role[o + 1] = 'y'; role[o + 2] = 'z'; }
  const isByte = c => sampleRows.every(r => r.length > c && Number.isInteger(r[c]) && r[c] >= 0 && r[c] <= 255);
  const isUnit = c => sampleRows.every(r => r.length > c + 2 && Math.abs(Math.hypot(r[c], r[c + 1], r[c + 2]) - 1) < 0.02);
  const free = c => role[c] === null && (!names || !names[c] || !/^(sf|scalar|i|int|intensity|value)/i.test(names[c]));
  // .pts は「x y z 強度 r g b」が決まりの並び（Leica）。5〜7 列目が小数点のない 0〜255 の整数なら、強度が 0〜255 でも 4 列目を色にしない
  // （CloudCompare の .pts は「x y z r g b 強度」で、強度を 41.000000 のように小数で書くので 4〜6 列目が色になる）
  const intTok = c => sampleRaw.every(r => /^\d{1,3}$/.test(r[c] ?? '') && Number(r[c]) <= 255);
  // 見出しのない 7 列ですべて整数（x y z i r g b か x y z r g b i か分からない）ときも、スキャナーで普通の x y z i r g b とみなす
  const ptsOrder = !names && ncol >= 7 && intTok(4) && intTok(5) && intTok(6) && (ext === 'pts' || (ncol === 7 && intTok(3)));
  const firstColorCol = ptsOrder ? 4 : 3;
  if (!role.includes('r')) for (let c = firstColorCol; c + 2 < ncol; c++) if (free(c) && free(c + 1) && free(c + 2) && isByte(c) && isByte(c + 1) && isByte(c + 2)) { role[c] = 'r'; role[c + 1] = 'g'; role[c + 2] = 'b'; break; }
  if (!role.includes('nx')) for (let c = 3; c + 2 < ncol; c++) if (role[c] === null && role[c + 1] === null && role[c + 2] === null && isUnit(c)) { role[c] = 'nx'; role[c + 1] = 'ny'; role[c + 2] = 'nz'; break; }
  // 残りは値の欄（強度など）
  let sfi = 0;
  const fieldIdx = new Int32Array(ncol).fill(-1);
  for (let c = 0; c < ncol; c++) {
    if (role[c] !== null) continue;
    let nm = names && names[c] ? names[c].replace(/^\/\//, '').replace(/^scalar_/i, '') : null;
    if (!nm) nm = (ext === 'pts' && !sink.names.includes('intensity')) || (ncol === 4 && c === 3) || (ptsOrder && c === 3) ? 'intensity' : `sf${++sfi}`;
    // 大きな値（時刻など）の列は double で持つ（finish で基準値を引いて float32 にする）
    const wide = sampleRows.some(r => Math.abs(r[c]) >= 1e5);
    fieldIdx[c] = sink.field(nm.toLowerCase(), wide);
  }
  const ri = role.indexOf('r'), gi = role.indexOf('g'), bi = role.indexOf('b');
  if (ri >= 0) sink.rgb();
  // 色が 0〜1 の小数で書かれていれば 0〜255 に直す
  const unitColor = ri >= 0 && sampleRows.every(r => [ri, gi, bi].every(c => !(r[c] > 1) && !(r[c] < 0)));
  const cs = unitColor ? 255 : 1;
  const cv = x => (x === x ? Math.max(0, Math.min(255, Math.round(x * cs))) : 200);
  const sepByte = delim ? delim.charCodeAt(0) : 0;
  const xi = role.indexOf('x'), yi = role.indexOf('y'), zi = role.indexOf('z');
  if (count) sink.hint(count);
  else sink.hint(Math.floor(src.size / Math.max(16, head.length / Math.max(1, lines.length))));

  // 本体
  let lineNo = 0;
  const v = new Float64Array(ncol + 8);
  const F = sink.F, fieldCols = [];
  for (let c = 0; c < ncol; c++) if (fieldIdx[c] >= 0) fieldCols.push(c);
  await eachLine(src, 0, (b, s, e) => {
    if (lineNo++ < skip) return;
    if (e <= s) return;
    if (b[s] === 47 || b[s] === 35) return; // 途中の注釈
    const n = sepByte ? cellsIn(b, s, e, v, sepByte) : numbersIn(b, s, e, v);
    if (n < 3) return;
    if (xi >= n || yi >= n || zi >= n) { sink.skipped++; return; } // 座標の列が足りない行は除く（前の行の値を使わない。R8-002）
    const k = sink.slot(v[xi], v[yi], v[zi]);
    if (k < 0) return;
    for (const c of fieldCols) sink.F[fieldIdx[c]][k] = c < n ? v[c] : NaN;
    if (ri >= 0) {
      const C = sink.C;
      if (ri < n && gi < n && bi < n) { C[3 * k] = cv(v[ri]); C[3 * k + 1] = cv(v[gi]); C[3 * k + 2] = cv(v[bi]); } else sink.gray(k); // 色の列が足りない行は灰色
    }
  }, ctx.progress);
  void F;
  const used = role.map((r, c) => r || (fieldIdx[c] >= 0 ? sink.names[fieldIdx[c]] : '')).filter(Boolean);
  return { format: `文字の点群（${ncol} 列: ${used.join(' ')}）`, note: role.includes('nx') ? '法線の列は使いません' : '' };
}

// CSV の表: 1 つのマスが 1 点。列番号が x、行番号が y、値が高さ z（CloudCompare の CSV matrix と同じ）
async function readMatrix(src, sink, ctx) {
  let row = 0, width = -1;
  const k0 = sink.field('height');
  await eachLine(src, 0, (b, s, e) => {
    if (e <= s) return;
    if (b[s] === 47 && b[s + 1] === 47) return;
    let col = 0, t = s;
    for (let i = s; i <= e; i++) {
      if (i === e || b[i] === 44 || b[i] === 59 || b[i] === 9) {
        if (i > t) {
          const z = parseToken(b, t, i);
          const k = sink.slot(col, -row, z);
          if (k >= 0) sink.F[k0][k] = z;
        }
        col++; t = i + 1;
      }
    }
    if (width < 0) width = col;
    row++;
  }, ctx.progress);
  return { format: `CSV の高さの表（${width} 列 × ${row} 行、1 マス = 1 m）` };
}
