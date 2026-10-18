#!/bin/bash
# heavyall.sh … A07 の重い試験（Chromium・Electron）をまとめて 1 つの見張り枠で順に流す（普通の名前空間から）
#   MEM=3500 TIMEOUT=6000 heavy bash t/heavyall.sh [ring demo ui1 ui2 ui3 ui4 share share2 endure]
W=$(cd "$(dirname "$0")/.." && pwd); cd $W
list=${*:-ring demo ui2 ui3 ui4 share share2 endure}
run() { local name=$1 to=$2; shift 2; echo "=== $name $(date +%T)"; timeout $to "$@" > logs/$name.txt 2>&1; echo "rc=$?" >> logs/$name.txt; grep -cE "^PASS" logs/$name.txt | sed 's/^/  PASS /'; grep -E "^(FAIL|FATAL)" logs/$name.txt | cut -c1-160; }
for t in $list; do
  case $t in
    ring|demo) run $t 600 node t/$t.js ;;
    ui1|ui2|ui3|ui4) run $t 600 env NSP=a07u NET=10.117.0 ip netns exec a07u2 xvfb-run -a -n 170 node t/$t.js ;;
    share) echo "=== share $(date +%T)"; timeout 1200 bash t/share.sh; for f in share_host share_v1 share_v2; do grep -cE "^PASS" logs/$f.txt | sed "s/^/  $f PASS /"; grep -E "^(FAIL|FATAL)" logs/$f.txt | cut -c1-160; done ;;
    share2) run share2 600 env NSP=a07u NET=10.117.0 ip netns exec a07u3 xvfb-run -a -n 170 node t/share2.js ;;
    endure) run endure $(( ${DUR:-2100} + 600 )) env NSP=a07e NET=10.127.0 ip netns exec a07e2 xvfb-run -a -n 170 node t/endure.js ;;
  esac
done
echo "=== heavyall done $(date +%T)"
