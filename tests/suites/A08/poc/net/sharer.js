const path=require('node:path'), fs=require('node:fs');
const live = require(path.join('/home/claude/pcd-viewer','live.js'));
const L = new live.Live();
(async()=>{
  const port = await L.sharer.start({ model:'MID-360', sn:'SECRET-SN-123' }); // 全 IF(0.0.0.0) に bind、認証なし
  fs.writeFileSync(process.argv[2], String(port));
  const n=100, xyz=new Float32Array(3*n), refl=new Uint8Array(n).fill(7);
  for(let i=0;i<3*n;i++) xyz[i]=i*0.01;
  const b={n,xyz,refl};
  const t=setInterval(()=>L.sharer.send(b),150);
  setTimeout(()=>{clearInterval(t);L.close();process.exit(0);},9000);
})().catch(e=>{console.error('sharer err',e.message);process.exit(3);});
