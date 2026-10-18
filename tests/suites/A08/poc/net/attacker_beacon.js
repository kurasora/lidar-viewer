const dgram=require('node:dgram');
const s=dgram.createSocket({type:'udp4',reuseAddr:true});
s.bind(0,()=>{ s.setBroadcast(true);
  const msg=Buffer.from(JSON.stringify({app:'pcd-viewer',v:1,name:'EVIL-HOST',port:31337,model:'MID-360',sn:'SPOOFED',id:'evil123'}));
  const t=setInterval(()=>s.send(msg,47800,'10.108.0.255',()=>{}),200);
  setTimeout(()=>{clearInterval(t);s.close();process.exit(0);},3500);
});
