import { readFileSync } from 'node:fs';
const P='/home/claude/pcd-viewer'; const { loadFile }=await import(P+'/src/io/index.js');
const data='1e300 1e300 1e300\n1 2 3\n4 5 6\n7 8 9\n';
const {sink,info}=await loadFile(new Blob([new TextEncoder().encode(data)]),'x.xyz',{cap:3e7,offset:null},()=>{});
const r=sink.finish();
console.log('format',info.format,'n',r.n,'offset',r.offset);
let nf=0; for(const v of r.positions) if(!Number.isFinite(v)) nf++;
console.log('positions:',Array.from(r.positions),'nonFinite',nf,'of',r.positions.length);
