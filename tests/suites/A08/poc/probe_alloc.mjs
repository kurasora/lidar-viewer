const rss = () => (process.memoryUsage().rss/1048576).toFixed(0);
console.log('start rss MB', rss());
// 1) 宣言 usize に相当する確保（触らない）
try { const a = new Uint8Array(1900000000); console.log('alloc 1.9e9 ok, rss MB', rss(), 'len', a.length); }
catch(e){ console.log('alloc 1.9e9 THROW', e.message); }
// 2) 4GB 近辺
try { const b = new Uint8Array(0xFFFFFFFF); console.log('alloc 4GB-1 ok, rss MB', rss(), 'len', b.length); }
catch(e){ console.log('alloc 4GB-1 THROW', e.message); }
// 3) 触った場合
try { const c = new Uint8Array(1200000000); for(let i=0;i<c.length;i+=4096) c[i]=1; console.log('touched 1.2e9, rss MB', rss()); }
catch(e){ console.log('touch THROW', e.message); }
