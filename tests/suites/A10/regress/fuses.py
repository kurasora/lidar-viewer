#!/usr/bin/env python3
# Electron の fuse（実行ファイルに焼き込まれた機能のスイッチ）を読む
#   python3 -I fuses.py <バイナリ>...  （Linux: lidar-viewer、Windows: LiDAR Viewer.exe、mac: Electron Framework）
# 出力: 1 行 1 ファイルの JSON
import sys, json, mmap
SENTINEL = b'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
NAMES = ['RunAsNode', 'EnableCookieEncryption', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments',
         'EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar', 'LoadBrowserProcessSpecificV8Snapshot',
         'GrantFileProtocolExtraPrivileges', 'WasmTrapHandlers']
STATE = {0x30: 'off', 0x31: 'ON', 0x72: 'removed'}
for p in sys.argv[1:]:
    with open(p, 'rb') as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        hits = []
        i = mm.find(SENTINEL)
        while i >= 0:
            ver = mm[i + len(SENTINEL)]
            n = mm[i + len(SENTINEL) + 1]
            wire = mm[i + len(SENTINEL) + 2: i + len(SENTINEL) + 2 + n]
            hits.append({'offset': i, 'version': ver, 'fuses': {NAMES[k] if k < len(NAMES) else f'fuse{k}': STATE.get(b, hex(b)) for k, b in enumerate(wire)}})
            i = mm.find(SENTINEL, i + 1)
    print(json.dumps({'file': p, 'wires': hits}, ensure_ascii=False))
