set -e
W=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A08
rm -f "$W/tmp/share_port"
ip netns exec a081 node "$W/poc/net/sharer.js" "$W/tmp/share_port" &
SH=$!
ip netns exec a082 node "$W/poc/net/attacker_ws.js" "$W/tmp/share_port"
kill "$SH" 2>/dev/null; wait "$SH" 2>/dev/null; true
