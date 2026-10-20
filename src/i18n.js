// 画面の言葉の切り替え（日本語 ⇔ English）
// プログラムの中の文は日本語のまま持ち、English のときは「画面に出る直前」に訳す:
//   ・画面の文字（HTML の文字・aria-label など）は、変わるたびに見張って訳す（MutationObserver）
//   ・画像（canvas）に描く文字は、描くときに訳す
//   ・ファイルを選ぶ画面の種類の名前は tr() を通す
// 訳は i18n-en.js。そこに無い文は、知っている言葉だけ置き換え、残りは日本語のまま出す。
import { EN } from './i18n-en.js';

const JA = /[぀-ヿ㐀-鿿！-｠]/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = s => s.replace(/\s+/g, ' ').trim();
const exact = new Map();
const pats = [];
for (const [ja, en] of EN) {
  const k = norm(ja);
  if (!k.includes('{}')) { exact.set(k, en); continue; }
  const parts = k.split('{}');
  // 当てる順: 決まった文字（空白・記号を除く）が多い、具体的なものから。区切りだけの「{} ・ {}」は最後
  const w = k === '{} ・ {}' ? -1 : parts.join('').replace(/[\s・、。（）()「」:：\/／,.-]/g, '').length;
  pats.push({ ja: jaCount(parts.join('')), re: new RegExp('^' + parts.map(esc).join('([\\s\\S]*?)') + '$'), re2: new RegExp('^' + parts.map(esc).join('([\\s\\S]*)') + '$'), en, w });
}
pats.sort((a, b) => b.w - a.w);
const words = [...exact.keys()].filter(k => JA.test(k) && k.length >= 2).sort((a, b) => b.length - a.length);

let lang = 'ja';
export const getLang = () => lang;

// {} は順に、{0} {1} … は番号の所に入れる（英語で語順が変わるとき）
function fill(en, caps) {
  const nums = [...en.matchAll(/\{(\d)\}/g)].map(m => +m[1]);
  let seq = nums.length ? Math.max(...nums) + 1 : 0;
  return en.replace(/\{(\d?)\}/g, (m, d) => (d !== '' ? caps[+d] : caps[seq++]) ?? '');
}
// 訳し方の良さ = 表の決まった文字（日本語）でどれだけ覆えたか。いくつかの訳し方があるときは、いちばん覆えたものを使う
// 返す値: [訳, 覆えた日本語の文字数]
const memo = new Map();
function full(k, depth, sep = null) {
  if (exact.has(k)) return [exact.get(k), jaCount(k)];
  if (depth >= 6) return null;
  let best = null;
  for (const p of pats) {
    // 入れる所の切れ目は、短く取る・長く取るの両方を試す（かっこが入れ子のときなど）
    for (const re of [p.re, p.re2]) {
      const m = k.match(re);
      if (!m) continue;
      if (sep && m.slice(1).some(c => c.includes(sep))) continue; // 区切りをまたいで入れる所に取り込まない
      let score = p.ja;
      const caps = m.slice(1).map(c => { if (!JA.test(c)) return c; const [x, s] = core2(norm(c), depth + 1); score += s; return x; });
      const r = tidy(fill(p.en, caps));
      if (!best || score > best[1] || (score === best[1] && jaCount(r) < jaCount(best[0]))) best = [r, score];
      if (re === p.re && !JA.test(r) && score === jaCount(k)) return best; // 全部覆えた
    }
  }
  return best;
}
// 区切り（「。」「、」）で分けた部分を、表に当たるいちばん長いひと続きごとに訳す（いくつかの知らせがつながった文など）
function runs(parts, sep, depth) {
  const out = []; let score = 0;
  for (let i = 0; i < parts.length;) {
    let j = parts.length, got = null;
    for (; j > i; j--) {
      const cand = norm(parts.slice(i, j).join(sep));
      if (!cand) { got = ['', 0]; break; }
      const r = j > i + 1 ? full(cand, depth + 1, sep) : core2(cand, depth + 1);
      if (r && (j === i + 1 || !JA.test(r[0]))) { got = r; break; }
    }
    if (got[0]) out.push(got[0]);
    score += got[1]; i = Math.max(j, i + 1);
  }
  return [out, score];
}
function core2(k, depth) {
  const key = depth + '\u0000' + k;
  if (memo.has(key)) return memo.get(key);
  let best = full(k, depth);
  if (depth < 6) {
    let alt = null;
    // 文がいくつか続くとき・「、」で並んでいるとき
    if (/。./.test(k)) { const [o, s] = runs(k.split('。'), '。', depth); alt = [o.join('. ') + (k.endsWith('。') ? '.' : ''), s]; }
    else if (k.includes('、')) { const [o, s] = runs(k.split('、'), '、', depth); alt = [o.join(', '), s]; }
    if (alt && (!best || alt[1] > best[1] || (alt[1] === best[1] && jaCount(alt[0]) <= jaCount(best[0])))) best = [tidy(alt[0]), alt[1]]; // 同じなら区切りで分けた方
  }
  if (!best || JA.test(best[0])) {
    // 最後の手段: 知っている言葉を置き換え、日本語の記号を英語の記号に
    let r = best ? best[0] : k, s = best ? best[1] : 0;
    for (const w of words) if (r.includes(w)) { r = r.split(w).join(exact.get(w)); s += jaCount(w) / 4; } // 言葉の置き換えは、表の文に当たるより弱い
    best = [r.replace(/・/g, ' · ').replace(/（/g, ' (').replace(/）/g, ')').replace(/、/g, ', ').replace(/。/g, '. ').replace(/：/g, ': ')
      .replace(/[「」]/g, '"').replace(/／/g, '/').replace(/ {2,}/g, ' ').trim(), s];
  }
  if (memo.size > 5000) memo.clear();
  memo.set(key, best);
  return best;
}
const core = (k, depth) => core2(k, depth)[0];
function jaCount(s) { let n = 0; for (const ch of s) if (JA.test(ch)) n++; return n; }
// 空白を整える。「 .」は文の終わりの点のときだけ詰める（「.icm」のような拡張子の点は残す）
function tidy(s) { return s.replace(/ {2,}/g, ' ').replace(/ ([,)])/g, '$1').replace(/ \.(?=\s|$)/g, '.').trim(); }
export function tr(s) {
  if (lang !== 'en' || typeof s !== 'string' || s.length > 800 || !JA.test(s)) return s;
  if (s.includes('\n')) return s.split('\n').map(tr).join('\n'); // 行ごとに
  const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0];
  return lead + core(norm(s), 0) + tail;
}

// ---- 画面の文字を見張って訳す
const ATTRS = ['aria-label', 'alt', 'placeholder'];
const texts = new Map();   // 文字の部品 → 元の日本語（訳したものだけ）
const attrs = new Map();   // 要素 → { 属性: 元の日本語 }
let obs = null;
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
function doText(n) {
  const d = n.data;
  // プログラムの文字（script など）や、とても長い文字は訳さない（長い文字に型を当てると固まるため）
  if (d.length > 800 || (n.parentNode && SKIP.has(n.parentNode.nodeName))) return;
  if (!JA.test(d)) { texts.delete(n); return; }
  const t = tr(d);
  if (t !== d) { texts.set(n, d); n.data = t; }
}
function doAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || !JA.test(v)) continue;
    const t = tr(v);
    if (t !== v) { const o = attrs.get(el) || {}; o[a] = v; attrs.set(el, o); el.setAttribute(a, t); }
  }
}
function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
  doAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
}
function onMut(ms) {
  for (const m of ms) {
    if (m.type === 'characterData') doText(m.target);
    else if (m.type === 'attributes') doAttrs(m.target);
    else for (const n of m.addedNodes) walk(n);
  }
  obs.takeRecords(); // 自分で書き換えた分は見ない
}
// 片付け: 画面から消えた部品の控えを捨てる（たまに）
function sweep() { for (const n of texts.keys()) if (!n.isConnected) texts.delete(n); for (const e of attrs.keys()) if (!e.isConnected) attrs.delete(e); }

// canvas に描く文字
const C2 = typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D.prototype : null;
if (C2) for (const f of ['fillText', 'strokeText', 'measureText']) { const o = C2[f]; C2[f] = function (t, ...a) { return o.call(this, tr(t), ...a); }; }
if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') { const P = OffscreenCanvasRenderingContext2D.prototype; for (const f of ['fillText', 'strokeText', 'measureText']) { const o = P[f]; P[f] = function (t, ...a) { return o.call(this, tr(t), ...a); }; } }

export function setLang(l) {
  l = l === 'en' ? 'en' : 'ja';
  if (l === lang) return;
  lang = l;
  document.documentElement.lang = l;
  if (l === 'en') {
    if (!obs) obs = new MutationObserver(onMut);
    walk(document.body);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    if (!setLang.t) setLang.t = setInterval(sweep, 30000);
  } else {
    if (obs) obs.disconnect();
    for (const [n, d] of texts) if (n.isConnected) n.data = d;
    for (const [e, o] of attrs) for (const a of Object.keys(o)) e.setAttribute(a, o[a]);
    texts.clear(); attrs.clear();
  }
}
