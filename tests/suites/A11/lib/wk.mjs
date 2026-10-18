// worker.js を Node でそのまま動かすための土台（self.onmessage を直接呼ぶ）
//   const wk = await loadWorker(); const r = await wk.send({type:'load', ...}) → 'loaded' と 'spacing' を集める
const P = '/home/claude/pcd-viewer';
export async function loadWorker() {
  const msgs = [];
  let waiters = [];
  globalThis.self = {
    postMessage(m) { msgs.push(m); const w = waiters; waiters = []; for (const f of w) f(); },
  };
  await import(P + '/src/worker.js');
  const onmessage = globalThis.self.onmessage;
  async function send(msg) {
    const start = msgs.length;
    await onmessage({ data: msg });
    return msgs.slice(start);
  }
  return { send, msgs };
}
