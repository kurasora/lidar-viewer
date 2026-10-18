import { readFileSync } from 'node:fs';
const P='/home/claude/pcd-viewer'; const { loadFile }=await import(P+'/src/io/index.js');
async function tryLoad(bytes,name){ try{ const {sink,info}=await loadFile(new Blob([bytes]),name,{cap:3e7,offset:null},()=>{}); const r=sink.finish(); return `ok n=${r.n} ${info.format}`;}catch(e){return `ERR ${e.constructor.name}: ${e.message}`;} }
const conv=(b,mode)=>{ const out=[]; for(const c of b){ if(c===10){ if(mode==='cr')out.push(13); else if(mode==='crlf')out.push(13,10); else out.push(10);} else out.push(c);} return Uint8Array.from(out); };
for(const f of ['pcl_ascii.pcd','cc_cloud.asc','cc_cloud.xyz','cc_cloud_ascii.ply','cc_mesh.obj','cc_cloud.vtk']){
  const b=new Uint8Array(readFileSync(P+'/sample/formats/'+f));
  console.log(f);
  console.log('  LF  :', await tryLoad(conv(b,'lf'),f));
  console.log('  CRLF:', await tryLoad(conv(b,'crlf'),f));
  console.log('  CR  :', await tryLoad(conv(b,'cr'),f));
  console.log('  BOM :', await tryLoad(Uint8Array.from([0xef,0xbb,0xbf,...conv(b,'lf')]),f));
}
