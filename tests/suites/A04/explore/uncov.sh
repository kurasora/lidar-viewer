#!/bin/bash
W=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A04
cd /home/claude/pcd-viewer && $W/tools/node_modules/.bin/c8 report --temp-directory $W/out/regress-1/cov-raw --reports-dir $W/out/regress-1/lcov --reporter=lcovonly --allowExternal --include '**/src/**' --exclude '**/vendor/**' --exclude '**/node_modules/**' >/dev/null 2>&1
python3 - <<'PY'
import re
f='/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A04/out/regress-1/lcov/lcov.info'
cur=None; out={}
for line in open(f):
    line=line.strip()
    if line.startswith('SF:'): cur=re.sub(r'^.*?src/','',line[3:]); out[cur]={'lines':[], 'br':[]}
    elif line.startswith('DA:'):
        n,c=line[3:].split(',')[:2]
        if c=='0': out[cur]['lines'].append(int(n))
    elif line.startswith('BRDA:'):
        n,b,br,c=line[5:].split(',')
        if c in ('0','-'): out[cur]['br'].append(int(n))
for k in ['io/formats/ccbin.js','io/formats/psz.js','io/formats/sbf.js','io/index.js','io/formats/cad.js','io/formats/las.js','io/formats/e57.js','io/formats/pcd.js','io/formats/ply.js','io/formats/image.js','io/formats/mesh.js','io/formats/ascii.js','io/sink.js','io/util.js','trajectory.js','io/formats/simple.js','io/formats/ptx.js']:
    if k in out:
        print(k, '未実行の行', sorted(set(out[k]['lines']))[:80], '未実行の分岐のある行', sorted(set(out[k]['br']))[:80])
PY
