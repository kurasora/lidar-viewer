set -e
W=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A08
ip netns exec a081 node "$W/poc/net/victim_finder.js" > "$W/tmp/victim_out.json" &
VI=$!
sleep 0.6
ip netns exec a082 node "$W/poc/net/attacker_beacon.js"
wait "$VI" 2>/dev/null; true
echo "VICTIM SAW:"; cat "$W/tmp/victim_out.json"
