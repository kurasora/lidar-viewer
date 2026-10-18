#!/bin/bash
# uibatch.sh <試験名...> … 画面の試験を 1 つの見張り枠の中で順に流す（a07u2 の中で実行すること）
#   例: heavy ip netns exec a07u2 bash t/uibatch.sh ui2 ui3 ui4
W=$(cd "$(dirname "$0")/.." && pwd); cd $W
export NSP=${NSP:-a07u} NET=${NET:-10.117.0}
for t in "$@"; do
  echo "=== $t $(date +%T)"
  timeout ${UITIMEOUT:-300} xvfb-run -a -n 170 node t/$t.js > logs/$t.txt 2>&1; echo "rc=$?" >> logs/$t.txt
  tail -1 logs/$t.txt
done
