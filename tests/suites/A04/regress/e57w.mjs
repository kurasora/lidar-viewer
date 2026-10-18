// 試験用の小さな E57 書き出し（ASTM E2807 の物理ページ・圧縮ベクトル・bitPack を手で組み立てる）
//   buildE57({ page, scans: [{ fields, records, chunk, pose, colorLimits, extraXml }] }) → Uint8Array
//   fields: [{ name, type: 'ScaledInteger'|'Integer'|'Float', min, max, scale, offset, precision }]
//   records: [[値（欄の順）], ...]（ScaledInteger は実際の値、Integer は整数）
//   chunk: 1 パケットに入れる 1 つの流れのバイト数の上限（値がパケットの境目をまたぐように小さくできる）
//   CRC は 0 のまま（読み込み部品は CRC を確かめない）
export function bitsOf(f) { const r = BigInt(f.max) - BigInt(f.min); return r > 0n ? r.toString(2).length : 0; }
function streamBytes(f, vals) {
  if (f.type === 'Float') {
    const sz = f.precision === 'single' ? 4 : 8;
    const b = new Uint8Array(sz * vals.length), dv = new DataView(b.buffer);
    vals.forEach((v, i) => sz === 4 ? dv.setFloat32(4 * i, v, true) : dv.setFloat64(8 * i, v, true));
    return b;
  }
  const bits = bitsOf(f);
  if (!bits) return new Uint8Array(0);
  const totalBits = bits * vals.length;
  const out = new Uint8Array(Math.ceil(totalBits / 8));
  let pos = 0;
  for (const v of vals) {
    let raw;
    if (f.type === 'ScaledInteger') raw = BigInt(Math.round((v - (f.offset || 0)) / (f.scale || 1))) - BigInt(f.min);
    else raw = BigInt(v) - BigInt(f.min);
    for (let k = 0; k < bits; k++) { if ((raw >> BigInt(k)) & 1n) out[(pos + k) >> 3] |= 1 << ((pos + k) & 7); }
    pos += bits;
  }
  return out;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function protoXml(f) {
  if (f.type === 'Float') return `<${f.name} type="Float"${f.precision === 'single' ? ' precision="single"' : ''}${f.min !== undefined ? ` minimum="${f.min}"` : ''}${f.max !== undefined ? ` maximum="${f.max}"` : ''}/>`;
  if (f.type === 'ScaledInteger') return `<${f.name} type="ScaledInteger" minimum="${f.min}" maximum="${f.max}" scale="${f.scale}" offset="${f.offset || 0}"/>`;
  return `<${f.name} type="Integer" minimum="${f.min}" maximum="${f.max}"/>`;
}
export function buildE57({ page = 1024, scans }) {
  const L = page - 4;
  const phys = l => Math.floor(l / L) * page + (l % L);
  const parts = []; let len = 48;
  const put = b => { const at = len; parts.push([at, b]); len += b.length; return at; };
  const scanInfo = [];
  for (const sc of scans) {
    const streams = sc.fields.map((f, j) => streamBytes(f, sc.records.map(r => r[j])));
    const chunk = sc.chunk || 4096;
    // 見出し（32 バイト）を置き、あとで中身を書く
    const head = new Uint8Array(32);
    const headAt = put(head);
    const firstPacketAt = len;
    const pos = streams.map(() => 0);
    let guard = 0;
    while (streams.some((s, j) => pos[j] < s.length) && guard++ < 1e7) {
      const take = streams.map((s, j) => Math.min(chunk, s.length - pos[j]));
      const nb = streams.length;
      let plen = 6 + 2 * nb + take.reduce((a, b) => a + b, 0);
      const pad = (4 - (plen % 4)) % 4; plen += pad;
      const pk = new Uint8Array(plen), dv = new DataView(pk.buffer);
      pk[0] = 1; dv.setUint16(2, plen - 1, true); dv.setUint16(4, nb, true);
      let o = 6 + 2 * nb;
      take.forEach((t, j) => { dv.setUint16(6 + 2 * j, t, true); pk.set(streams[j].subarray(pos[j], pos[j] + t), o); o += t; pos[j] += t; });
      put(pk);
    }
    if (!streams.some(s => s.length)) { // 全部が定数の欄でもパケットを 1 つ置く
      const nb = streams.length; let plen = 6 + 2 * nb; plen += (4 - plen % 4) % 4;
      const pk = new Uint8Array(plen), dv = new DataView(pk.buffer); pk[0] = 1; dv.setUint16(2, plen - 1, true); dv.setUint16(4, nb, true); put(pk);
    }
    const hv = new DataView(head.buffer);
    head[0] = 1; hv.setBigUint64(8, BigInt(len - headAt), true); hv.setBigUint64(16, BigInt(phys(firstPacketAt)), true); hv.setBigUint64(24, 0n, true);
    scanInfo.push({ fileOffset: phys(headAt) });
  }
  const scanXml = scans.map((sc, i) => {
    const pose = sc.pose ? `<pose type="Structure">${sc.pose.q ? `<rotation type="Structure"><w type="Float">${sc.pose.q[0]}</w><x type="Float">${sc.pose.q[1]}</x><y type="Float">${sc.pose.q[2]}</y><z type="Float">${sc.pose.q[3]}</z></rotation>` : ''}${sc.pose.t ? `<translation type="Structure"><x type="Float">${sc.pose.t[0]}</x><y type="Float">${sc.pose.t[1]}</y><z type="Float">${sc.pose.t[2]}</z></translation>` : ''}</pose>` : '';
    const cl = sc.colorLimits ? `<colorLimits type="Structure"><colorRedMinimum type="Integer">0</colorRedMinimum><colorRedMaximum type="Integer">${sc.colorLimits}</colorRedMaximum></colorLimits>` : '';
    return `<vectorChild type="Structure"><guid type="String"><![CDATA[scan${i}]]></guid>${pose}${cl}${sc.extraXml || ''}<points type="CompressedVector" fileOffset="${scanInfo[i].fileOffset}" recordCount="${sc.recordCount ?? sc.records.length}"><prototype type="Structure">${sc.fields.map(protoXml).join('')}</prototype><codecs type="Vector" allowHeterogeneousChildren="1"></codecs></points></vectorChild>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<e57Root type="Structure" xmlns="http://www.astm.org/COMMIT/E57/2010-e57-v1.0"><formatName type="String"><![CDATA[ASTM E57 3D Imaging Data File]]></formatName><data3D type="Vector" allowHeterogeneousChildren="1">${scanXml}</data3D></e57Root>`;
  const xb = new TextEncoder().encode(xml);
  const xmlAt = put(xb);
  // 論理の列
  const logical = new Uint8Array(len);
  for (const [at, b] of parts) logical.set(b, at);
  logical.set(new TextEncoder().encode('ASTM-E57'), 0);
  const dvh = new DataView(logical.buffer);
  dvh.setUint32(8, 1, true); dvh.setUint32(12, 0, true);
  const physLen = Math.ceil(len / L) * page;
  dvh.setBigUint64(16, BigInt(physLen), true); dvh.setBigUint64(24, BigInt(phys(xmlAt)), true); dvh.setBigUint64(32, BigInt(xb.length), true); dvh.setBigUint64(40, BigInt(page), true);
  // 物理の列（ページごとに 4 バイトの CRC の場所を空ける）
  const out = new Uint8Array(physLen);
  for (let l = 0, p = 0; l < len; l += L, p += page) out.set(logical.subarray(l, Math.min(len, l + L)), p);
  return out;
}
