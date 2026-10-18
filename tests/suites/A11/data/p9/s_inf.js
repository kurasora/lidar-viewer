const P = window.__pcd, S = P.S, f = S.files[0];
const sel = document.getElementById('fieldSel'); sel.value = 'intensity';
const cm = document.getElementById('colorMode'); cm.value = 'field'; cm.dispatchEvent(new Event('change')); await H.wait(800);
return { stats: f.stats.intensity, legend: H.q('#legend .ticks span'), range: H.q('#colorRange .dval') };
