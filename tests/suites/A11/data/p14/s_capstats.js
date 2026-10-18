// 点数の上限を 1 万点にして（試験用に選択肢を足す）開き、統計の表示を見る
return { info: H.info(), fileSub: H.q('#fileList .sub'), statPoints: H.text('statPoints'), msg: H.text('statMsg'), n: window.__pcd.S.files[0] && window.__pcd.S.files[0].n, total: window.__pcd.S.files[0] && window.__pcd.S.files[0].total };
