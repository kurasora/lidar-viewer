const path=require('node:path');
const live=require(path.join('/home/claude/pcd-viewer','live.js'));
const L=new live.Live();
(async()=>{ await L.open(); setTimeout(()=>{ console.log(JSON.stringify({peers:L.finder.list()})); L.close(); process.exit(0); },3000); })()
.catch(e=>{console.log(JSON.stringify({err:e.message}));process.exit(3);});
