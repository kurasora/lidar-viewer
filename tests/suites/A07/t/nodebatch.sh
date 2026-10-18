#!/bin/bash
# nodebatch.sh <試験名...> … Node の試験（a07 の組）を 1 つの見張り枠の中で順に流す。普通の名前空間から: light bash t/nodebatch.sh proto multi ...
W=$(cd "$(dirname "$0")/.." && pwd); cd $W
export NSP=a07 NET=10.107.0
for t in "$@"; do
  echo "=== $t $(date +%T)"
  case $t in
    topo|compat|probe_check|hw_check) timeout 400 node t/$t.js ;;
    sec_a) timeout 400 ip netns exec a072 lib/enode t/sec.js peer beacons acks ;;
    sec_b) timeout 400 ip netns exec a072 lib/enode t/sec.js bigmsg slowframe stuck hold ;;
    loadab) timeout 600 ip netns exec a072 bash t/loadab.sh ;;
    *) timeout 400 ip netns exec a072 lib/enode t/$t.js ;;
  esac > logs/$t.txt 2>&1
  echo "rc=$?" >> logs/$t.txt
  grep -cE "^PASS" logs/$t.txt | sed "s/^/  PASS /"; grep -E "^(FAIL|FATAL)" logs/$t.txt | cut -c1-160
done
