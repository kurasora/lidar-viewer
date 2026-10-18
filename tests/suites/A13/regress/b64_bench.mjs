// 試作ページが起動時にしている base64 の展開（Uint8Array.from(atob(s), c => c.charCodeAt(0))）の時間を、ほかのやり方と比べる（V8）
import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2] || '/home/claude/pcd-viewer/dist-artifact/pcd-viewer.html', 'utf8');
const grab = (marker) => { const i = html.indexOf(marker); const s = i + marker.length; return html.slice(s, html.indexOf('"', s)); };
const worker = grab('Uint8Array.from(atob("'), map = grab('b64:"'), mapi = grab('b64i:"');
const ways = {
  'Uint8Array.from(atob, fn)（今のやり方）': s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
  'atob + for ループ': s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; },
  ...(Uint8Array.fromBase64 ? { 'Uint8Array.fromBase64（新しい API）': s => Uint8Array.fromBase64(s) } : {}),
};
const out = { sizes: { worker: worker.length, map: map.length, mapIntensity: mapi.length } };
for (const [k, f] of Object.entries(ways)) {
  const t = []; for (let r = 0; r < 3; r++) { const t0 = performance.now(); f(worker); f(map); f(mapi); t.push(performance.now() - t0); }
  out[k] = Math.round(Math.min(...t)) + ' ms（3 本の合計、3 回の最小）';
}
console.log(JSON.stringify(out, null, 1));
