#!/bin/bash
# 間引き（Algorithm L）の偏りをアプリの Sink で確かめる（light で流す。数分）
cd "$(dirname "$0")"
for a in "50000000 30000000 app" "50000000 30000000 math" "50000000 10000000 app" "50000000 10000000 math" "1000000000 10000000 app" "1000000000 10000000 math"; do node sim_reservoir.mjs $a; done
