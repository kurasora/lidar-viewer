const path=require('node:path'), fs=require('node:fs');
const WS = require(path.join('/home/claude/pcd-viewer','node_modules','ws'));
const live = require(path.join('/home/claude/pcd-viewer','live.js'));
const ip='10.108.0.1', portFile=process.argv[2];
(async()=>{
  let port; for(let i=0;i<60&&!port;i++){ try{port=Number(fs.readFileSync(portFile,'utf8'))}catch{} if(!port) await new Promise(r=>setTimeout(r,100)); }
  if(!port){console.log(JSON.stringify({ok:false,reason:'no port file'}));process.exit(2);}
  let frames=0,pts=0,sample=null;
  const ws=new WS(`ws://${ip}:${port}`); ws.binaryType='nodebuffer';
  await new Promise((res,rej)=>{ws.once('open',res);ws.once('error',rej);});
  ws.on('message',d=>{const b=live.decodeBatch(d); if(b){frames++;pts=b.n; if(!sample)sample=Array.from(b.xyz.slice(0,6));}});
  const extra=[]; for(let i=0;i<40;i++){ const w=new WS(`ws://${ip}:${port}`); w.on('error',()=>{}); extra.push(w); }
  await new Promise(r=>setTimeout(r,2500));
  console.log(JSON.stringify({ok:true, authRequired:false, receivedFrames:frames, pointsPerFrame:pts, sampleXYZ:sample, extraConnectionsOpen:extra.filter(w=>w.readyState===1).length}));
  try{ws.close()}catch{} for(const w of extra) try{w.terminate()}catch{}
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({ok:false,err:e.message}));process.exit(3);});
