#!/bin/bash
# A07 ライブ機能（LiDAR 直結・配信）の再試験一式
#
#   bash run.sh            … 耐久以外を全部（Node の試験 → 画面の試験 → 配信の試験）。順番待ちを除いて約 40 分
#   bash run.sh node       … Node の試験だけ（通信手順・複数 LiDAR・ポート・ロボットの点群を奪う・重なった操作・脅威・ネットワークの形・負荷・旧版互換）
#   bash run.sh ui         … 画面の試験だけ（Electron＋Playwright。返事の知らせ・混ざり・ポートの知らせ・洪水・壊れた配信・入れ物・デモ）
#   bash run.sh share      … 配信の試験だけ（配信元 1 台＋見る側 2 台、遅い回線、線が抜ける、ファイアウォール）
#   bash run.sh endure     … 耐久（35 分。DUR=秒 で変えられる）
#   bash run.sh hw [LiDARのIP]  … 実機（本物の MID-360、実験室の LAN）。netns を使わず、この PC のネットワークでそのまま動かす
#   bash run.sh clean      … netns などの片付けだけ
#
# 結果: logs/<試験名>.txt（1 行ずつ PASS / FAIL / INFO と中身の JSON）・logs/<試験名>.json。最後に一覧を出す。
# 必要なもの: このフォルダ一式（lib/ t/）、$T/bin の light/heavy/mknet/rmnet/mkcopy、/home/claude/pcd-viewer（読むだけ）
#   ・FAIL は「直っていない」の意味（このときの報告 A07-xxx に対応）。直したあとは PASS になるはず
#   ・試験のアプリは /home/claude/pcd-viewer（APPDIR で変えられる。直した版を試すときは APPDIR=<そのフォルダ>）
set -u
R=$(cd "$(dirname "$0")" && pwd)
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
APP=${APPDIR:-/home/claude/pcd-viewer}
mode=${1:-all}
cd $R; mkdir -p logs tmp ud

setup() {
  # netns の組: a07（Node の試験）・a07u（画面）・a07e（耐久）。LiDAR 役（1・4）には既定の経路（255.255.255.255 で返事を出すため）
  $T/bin/rmnet a07 5; $T/bin/rmnet a07u 5; $T/bin/rmnet a07e 3; ip netns del a076 2>/dev/null
  $T/bin/mknet a07 107 5 && $T/bin/mknet a07u 117 5 && $T/bin/mknet a07e 127 3 || { echo "netns を作れません"; exit 1; }
  for n in a071 a074 a07u1 a07u4 a07e1; do ip -n $n route add default dev eth0; done
  # 旧版 0.2.0 の live.js（互換の試験）と、計測用の写し（window.__lv を足しただけ）
  if [ ! -f old020/app/live.js ]; then mkdir -p old020 && $APP/node_modules/.bin/asar e /home/claude/release-archive/release-0.2.0/linux-unpacked/resources/app.asar old020/app; fi
  if [ ! -f proj/dist/app.js ] || [ $APP/src/app.js -nt proj/dist/app.js ]; then
    rm -rf proj; $T/bin/mkcopy $R/proj >/dev/null
    sed -i 's|^window.__pcd = { S, enqueue|window.__lv = { LV, LIVE_MAX, liveIngest: b => liveIngest(b), liveExpire: t => liveExpire(t), liveColAttr, livePosAttr, demo }; // A07: 計測用\nwindow.__pcd = { S, enqueue|' proj/src/app.js
    (cd proj && $T/bin/light node build.mjs)
  fi
}
cleanup() {
  ip netns exec a07usw tc qdisc del dev a07uh3 root 2>/dev/null
  $T/bin/rmnet a07 5; $T/bin/rmnet a07u 5; $T/bin/rmnet a07e 3; ip netns del a076 2>/dev/null; ip -n a07sw link del a07h6 2>/dev/null
  echo "netns を片付けました"
}
summary() {
  echo; echo "==== まとめ（FAIL は未修正の問題。A07-xxx は報告の番号）"
  for f in logs/*.txt; do
    p=$(grep -c '^PASS' $f); x=$(grep -c '^FAIL' $f); [ $((p + x)) -gt 0 ] || continue
    printf '%-22s PASS %3d  FAIL %3d\n' $(basename $f .txt) $p $x
    grep '^FAIL' $f | cut -c1-150 | sed 's/^/    /'
  done
}
export APPDIR=$APP
case $mode in
  clean) cleanup; exit 0 ;;
  hw)
    # 実機: ほかのソフト（LiDAR Viewer・livox_ros_driver2・Livox Viewer）を閉じてから
    E=$APP/node_modules/electron/dist/electron
    echo "== 1. 本物の MID-360 の振る舞い（probe_mid360.js、最後に送り先を元に戻す）"
    ELECTRON_RUN_AS_NODE=1 $E lib/probe_mid360.js ${2:+--ip $2} --stream 10 --types --out logs/hw_probe.json | tee logs/hw_probe.txt | head -80
    echo "== 2. アプリの live.js そのもの（hw_live.js）"
    ELECTRON_RUN_AS_NODE=1 $E lib/hw_live.js --live $APP/live.js --secs 10 --share | tee logs/hw_live.json | head -80
    echo "== 3. 電源を入れ直しても送り先が残るか: 次を順に実行"
    echo "   ELECTRON_RUN_AS_NODE=1 $E lib/probe_mid360.js --stream 3 --no-restore   # 送り先をこの PC にしたまま終える"
    echo "   （LiDAR の電源を切って入れる）"
    echo "   ELECTRON_RUN_AS_NODE=1 $E lib/probe_mid360.js --query-only              # pointcloud_host_ipcfg がこの PC のままなら「残る」"
    exit 0 ;;
esac
setup
if [ $mode = all ] || [ $mode = node ]; then
  MEM=2600 TIMEOUT=3000 $T/bin/light bash t/nodebatch.sh proto multi ports steal races sec_a sec_b topo compat probe_check hw_check load
fi
if [ $mode = all ] || [ $mode = ui ]; then
  TIMEOUT=600 $T/bin/heavy node t/ring.js > logs/ring.txt 2>&1
  TIMEOUT=600 $T/bin/heavy node t/demo.js > logs/demo.txt 2>&1
  MEM=2000 TIMEOUT=2400 $T/bin/heavy ip netns exec a07u2 bash t/uibatch.sh ui1 ui2 ui3 ui4
fi
if [ $mode = all ] || [ $mode = share ]; then
  MEM=3500 TIMEOUT=1200 $T/bin/heavy bash t/share.sh
  NSP=a07u NET=10.117.0 MEM=2000 TIMEOUT=600 $T/bin/heavy ip netns exec a07u3 xvfb-run -a -n 170 node t/share2.js > logs/share2.txt 2>&1
fi
if [ $mode = endure ]; then
  NSP=a07e NET=10.127.0 MEM=2500 TIMEOUT=$(( ${DUR:-2100} + 600 )) $T/bin/heavy ip netns exec a07e2 xvfb-run -a -n 170 node t/endure.js > logs/endure.txt 2>&1
fi
cleanup
summary
