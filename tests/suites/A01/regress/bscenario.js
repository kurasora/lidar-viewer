// 複数のファイル・順序・軌跡の重なりなどの「場面」の試験（Chromium で dist/index.html）
//   使い方: node bscenario.js <data フォルダ> <出力フォルダ> [場面名の正規表現]
//   出力: <出力フォルダ>/<場面>.json（各段階の S.files・S.trajs・S.offset・知らせ・ページのエラー）。判定は scen_check.py
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'), path = require('path');
const [DATA, OUT, filt] = process.argv.slice(2);
const PAGE = process.env.PAGE || 'file:///home/claude/pcd-viewer/dist/index.html';
const D = f => path.join(DATA, f);
const SAMPLE = '/home/claude/pcd-viewer/sample/formats/';

async function open(b) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.__errors = [];
  p.on('pageerror', e => p.__errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') p.__errors.push('console: ' + m.text()); });
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.evaluate(() => {
    const el = document.getElementById('statMsg'); window.__msgs = [];
    new MutationObserver(() => { if (el.textContent) window.__msgs.push((el.style.color ? '[赤] ' : '') + el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  });
  return p;
}
async function settle(p, limit = 90000) {
  const t0 = Date.now(); let last = '', since = Date.now();
  await p.waitForTimeout(300);
  while (true) {
    const s = await p.evaluate(() => JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length, window.__pcd.S.trajs.length, document.getElementById('statMsg').textContent]));
    if (s !== last) { last = s; since = Date.now(); }
    if (JSON.parse(s)[0] && Date.now() - since > 1000) return false;
    if (Date.now() - t0 > limit) return true;
    await p.waitForTimeout(200);
  }
}
async function state(p, withPoints = true) {
  return p.evaluate(async withPoints => {
    const S = window.__pcd.S, o = S.offset || [0, 0, 0];
    const b64 = a => { let s = ''; const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
    const files = S.files.map(f => {
      const P = new Float64Array(3 * f.n);
      for (let i = 0; i < 3 * f.n; i++) P[i] = f.positions[i] + o[i % 3];
      // 画面に描くときの座標（world の変換を当てたもの）の範囲
      const e = window.__pcd.world.matrix.elements;
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < f.n; i++) {
        const x = f.positions[3 * i], y = f.positions[3 * i + 1], z = f.positions[3 * i + 2];
        const w = [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
        for (let k = 0; k < 3; k++) { if (w[k] < lo[k]) lo[k] = w[k]; if (w[k] > hi[k]) hi[k] = w[k]; }
      }
      const rgb = f.geom.getAttribute('rgbc');
      return { name: f.name, n: f.n, total: f.total, sampled: f.sampled, skipped: f.skipped, format: f.header.data, rgb: !!f.hasRgb, P: withPoints ? b64(P) : null, C: withPoints && rgb ? b64(rgb.array) : null, worldMin: lo, worldMax: hi };
    });
    const trajs = S.trajs.map(t => {
      const e = window.__pcd.world.matrix.elements, P = t.P, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < t.count; i++) {
        const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
        const w = [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
        for (let k = 0; k < 3; k++) { if (w[k] < lo[k]) lo[k] = w[k]; if (w[k] > hi[k]) hi[k] = w[k]; }
      }
      return { name: t.name, count: t.count, length: t.length, duration: t.duration, topic: t.topic, P: b64(t.P), worldMin: lo, worldMax: hi };
    });
    const el = document.getElementById('statMsg');
    return { files, trajs, offset: S.offset, msg: el.textContent, msgIsError: !!el.style.color, msgs: [...window.__msgs], progressHidden: document.getElementById('progress').hidden, info: document.getElementById('info').innerText };
  }, withPoints);
}
async function closeAll(p) {
  await p.evaluate(() => {
    let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click();
    while ((x = document.querySelector('#trajList [data-act=tremove]'))) x.click();
    window.__msgs = [];
  });
}
// ドラッグ＆ドロップ（ファイルの中身をページに渡し、drop の出来事を起こす）
async function drop(p, files) {
  const items = files.map(f => ({ name: path.basename(f), b64: fs.readFileSync(f).toString('base64') }));
  await p.evaluate(items => {
    const dt = new DataTransfer();
    for (const it of items) { const bin = atob(it.b64), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i); dt.items.add(new File([u], it.name)); }
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, items);
}

const SCENES = {
  // 同じファイルを 2 回開く
  same_twice: async p => {
    const st = [];
    await p.setInputFiles('#fileInput', [D('pcd/xyz_f4_bin.pcd')]); await settle(p); st.push(await state(p, false));
    await p.setInputFiles('#fileInput', [D('pcd/xyz_f4_bin.pcd')]); await settle(p); st.push(await state(p));
    return st;
  },
  // 違う形式を同時に選ぶ（PCD・LAS・E57・PLY・文字・PTX・SBF（+.data）・BIN）
  mixed_at_once: async p => {
    await p.setInputFiles('#fileInput', [D('pcd/rgb_u4_bin.pcd'), D('las/v1.4_pf7.las'), D('e57/color8.e57'), D('ply/basic_ble.ply'), D('ascii/head_cc_slash.txt'), D('ptx/2scans_rgb.ptx'), SAMPLE + 'cc_cloud.sbf', SAMPLE + 'cc_cloud.sbf.data', SAMPLE + 'cc_cloud.bin']);
    await settle(p, 180000); return [await state(p)];
  },
  // 原点の大きく違う 2 つ: ローカル → UTM
  local_then_utm: async p => {
    const st = [];
    await p.setInputFiles('#fileInput', [D('pcd/xyz_f4_bin.pcd')]); await settle(p); st.push(await state(p, false));
    await p.setInputFiles('#fileInput', [D('las/utm_1mm.las')]); await settle(p); st.push(await state(p));
    return st;
  },
  // UTM → ローカル
  utm_then_local: async p => {
    const st = [];
    await p.setInputFiles('#fileInput', [D('las/utm_1mm.las')]); await settle(p); st.push(await state(p, false));
    await p.setInputFiles('#fileInput', [D('pcd/xyz_f4_bin.pcd')]); await settle(p); st.push(await state(p));
    return st;
  },
  // 同時に選ぶ（ローカル + UTM）
  local_utm_at_once: async p => {
    await p.setInputFiles('#fileInput', [D('pcd/xyz_f4_bin.pcd'), D('las/utm_1mm.las')]); await settle(p); return [await state(p)];
  },
  // 全部閉じてから UTM を開く（シフトが新しく決まるか）
  close_then_utm: async p => {
    const st = [];
    await p.setInputFiles('#fileInput', [D('pcd/xyz_f4_bin.pcd')]); await settle(p);
    await closeAll(p);
    await p.setInputFiles('#fileInput', [D('las/utm_1mm.las')]); await settle(p); st.push(await state(p));
    return st;
  },
  // UTM の点群 + UTM の軌跡（重なるか）
  utm_cloud_traj: async p => {
    const st = [];
    await p.setInputFiles('#fileInput', [D('las/utm_1mm.las')]); await settle(p);
    await p.setInputFiles('#trajInput', [D('traj/utm.txt')]); await settle(p); st.push(await state(p, false));
    await p.screenshot({ path: path.join(OUT, 'utm_cloud_traj.png') });
    return st;
  },
  // ローカルの点群 + ローカルの軌跡（基準: 重なる）
  local_cloud_traj: async p => {
    await p.setInputFiles('#fileInput', [D('pcd/xyz_f4_bin.pcd')]); await settle(p);
    await p.setInputFiles('#trajInput', [D('traj/tum.txt')]); await settle(p); return [await state(p, false)];
  },
  // 軌跡のファイルを「開く」（点群の入口）から選ぶ
  traj_via_fileinput: async p => {
    await p.setInputFiles('#fileInput', [D('traj/tum.txt')]); await settle(p); return [await state(p, false)];
  },
  // ドラッグ＆ドロップ: 軌跡（名前に traj）・点群（名前に path が入る）・8 列の点群
  drop_traj_and_cloud: async p => {
    const st = [];
    const tmp = path.join(OUT, 'tmp'); fs.mkdirSync(tmp, { recursive: true });
    fs.copyFileSync(D('traj/tum.txt'), path.join(tmp, 'robot_trajectory.txt'));
    await drop(p, [path.join(tmp, 'robot_trajectory.txt')]); await settle(p); st.push(await state(p, false));
    await closeAll(p);
    fs.copyFileSync(D('ascii/cols6_rgb.xyz'), path.join(tmp, 'path_scan.txt'));
    await drop(p, [path.join(tmp, 'path_scan.txt')]); await settle(p); st.push(await state(p, false));
    await closeAll(p);
    fs.copyFileSync(D('ascii/cols6_rgb.xyz'), path.join(tmp, 'scan_room.txt'));
    await drop(p, [path.join(tmp, 'scan_room.txt')]); await settle(p); st.push(await state(p, false));
    return st;
  },
  // ドラッグ＆ドロップ: 軌跡と取り違えやすい点群（見出しに Timestamp・Horizontal、名前に pose/path を含む）
  drop_misdetect: async p => {
    const st = [];
    const tmp = path.join(OUT, 'tmp'); fs.mkdirSync(tmp, { recursive: true });
    const rows = fs.readFileSync(D('ascii/cols4.xyz'), 'utf8').trim().split('\n').map((l, i) => l.trim().split(/\s+/).join(',') + ',' + (1700000000 + i * 1e-4).toFixed(4));
    fs.writeFileSync(path.join(tmp, 'ouster_export.csv'), 'X,Y,Z,Intensity,Timestamp\n' + rows.join('\n') + '\n');
    const rows2 = fs.readFileSync(D('ascii/cols4.xyz'), 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/).join(','));
    fs.writeFileSync(path.join(tmp, 'scan_angles.csv'), 'X,Y,Z,Horizontal_Angle\n' + rows2.join('\n') + '\n');
    fs.copyFileSync(D('ascii/cols6_rgb.xyz'), path.join(tmp, 'purpose_scan.txt'));
    for (const f of ['ouster_export.csv', 'scan_angles.csv', 'purpose_scan.txt']) {
      await closeAll(p); await drop(p, [path.join(tmp, f)]); await settle(p); const s = await state(p, false); s.dropped = f; st.push(s);
    }
    return st;
  },
  // 高さの幅が大きい点群（mm 単位）を開いたあと、別のファイルを開けるか
  tall_then_next: async p => {
    const st = [];
    await p.setInputFiles('#fileInput', [D('pcd/coord_I4_bin.pcd')]); await settle(p); st.push(await state(p, false));
    await p.setInputFiles('#fileInput', [D('pcd/xyz_f4_bin.pcd')]); await settle(p, 20000); st.push(await state(p, false));
    await p.screenshot({ path: path.join(OUT, 'tall_then_next.png') });
    return st;
  },
  // 開けないファイル → 開けるファイル → 開けないファイル（知らせ）
  error_sequence: async p => {
    const st = [];
    await p.setInputFiles('#fileInput', [D('pcd/points0.pcd')]); await settle(p); st.push(await state(p, false));
    await p.setInputFiles('#fileInput', [D('pcd/xyz_f4_bin.pcd')]); await settle(p); st.push(await state(p, false));
    await p.setInputFiles('#fileInput', [D('pcd/points_more_bin.pcd')]); await settle(p); st.push(await state(p, false));
    return st;
  },
  // 開けないファイルを含めて同時に選ぶ（どのファイルが開けなかったか分かるか）
  multi_with_errors: async p => {
    await p.setInputFiles('#fileInput', [D('pcd/points0.pcd'), D('pcd/xyz_f4_bin.pcd'), D('pcd/points_more_bin.pcd'), D('las/v1.2_pf3.las')]);
    await settle(p); return [await state(p, false)];
  },
  // CloudCompare の BIN（点群）と OBJ（メッシュ）を同時に選ぶ（BIN が glTF の付属ファイル扱いにならないか）
  bin_with_obj: async p => {
    await p.setInputFiles('#fileInput', [SAMPLE + 'cc_cloud.bin', SAMPLE + 'cc_mesh.obj', SAMPLE + 'pcl_binary.pcd']);
    await settle(p, 180000); return [await state(p, false)];
  },
  // 欄の名前が HTML の PLY を開き、「情報」を出す（名前がそのまま HTML として入らないか）
  html_field_name: async p => {
    await p.setInputFiles('#fileInput', [D('ply/html_field_name_ble.ply')]); await settle(p);
    await p.evaluate(() => { const n = document.querySelector('#fileList [data-act=select]'); if (n) n.click(); document.getElementById('infoBox').open = true; });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({ infoH1: document.querySelectorAll('#info h1').length, infoText: document.getElementById('info').innerText.slice(0, 300),
      fieldSelHtml: document.getElementById('fieldSel').innerHTML.slice(0, 300), anyH1: document.querySelectorAll('h1').length }));
    await p.screenshot({ path: path.join(OUT, 'html_field_name.png') });
    const s = await state(p, false); s.inject = r; return [s];
  },
  // 拡張子のないファイル・知らない拡張子
  no_extension: async p => {
    const tmp = path.join(OUT, 'tmp'); fs.mkdirSync(tmp, { recursive: true });
    fs.copyFileSync(D('pcd/xyz_f4_bin.pcd'), path.join(tmp, 'scan_without_ext'));
    await p.setInputFiles('#fileInput', [path.join(tmp, 'scan_without_ext')]); await settle(p); return [await state(p, false)];
  },
  // 点の少ない点群（5,000 点）を開いたときの知らせ（自動の水平補正が失敗する）
  small_cloud_message: async p => {
    await p.setInputFiles('#fileInput', [SAMPLE + 'pcl_binary.pcd']); await settle(p);
    const s = await state(p, false);
    await p.screenshot({ path: path.join(OUT, 'small_cloud_message.png') });
    return [s];
  },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  for (const [name, fn] of Object.entries(SCENES)) {
    if (filt && !new RegExp(filt).test(name)) continue;
    const p = await open(b);
    const t0 = Date.now();
    let steps, err = null;
    try { steps = await fn(p); } catch (e) { err = e.message; }
    fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ name, ms: Date.now() - t0, err, steps, errors: p.__errors.slice(0, 10) }));
    console.log(name, err || 'ok', p.__errors.length ? p.__errors[0] : '');
    await p.close();
  }
  await b.close();
})().catch(e => { console.log('fatal', e.message); process.exit(1); });
