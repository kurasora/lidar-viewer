#!/usr/bin/env python3
# drvsim.py — livox_ros_driver2（Livox-SDK2）と同じ作り方でポートを持つプロセス（A07 自作）
#   SDK2 の sdk_core/base/network/unix/network_util.cpp と device_manager.cpp に合わせる:
#     ・すべてのソケットに SO_REUSEADDR、受信バッファ 200 MB を要求
#     ・設定ファイルの host_ip（例 192.168.1.5）に bind（"local" なら 0.0.0.0）。検出と状態通知は 255.255.255.255 にも bind
#   mode=sdk2     … 上のとおり
#   mode=generic  … SO_REUSEADDR なしで 0.0.0.0 に bind（ふつうのソフト）
#   mode=generic_ip … SO_REUSEADDR なしで host_ip に bind
#   --configure LIDAR_IP … SDK2 と同じく、検出した LiDAR に「点群の送り先 = host_ip」を設定する（1 回だけ）
#   標準出力に 1 秒ごとに受けた数を JSON で出す
import socket, sys, json, time, struct, zlib, select, argparse

ap = argparse.ArgumentParser()
ap.add_argument('--mode', default='sdk2')
ap.add_argument('--host-ip', default='10.107.0.2')
ap.add_argument('--ports', default='56000,56101,56201,56301,56401')
ap.add_argument('--configure', default='')
ap.add_argument('--secs', type=float, default=1e9)
a = ap.parse_args()

def crc16(b):
    c = 0xffff
    for x in b:
        c ^= x << 8
        for _ in range(8):
            c = ((c << 1) ^ 0x1021) & 0xffff if c & 0x8000 else (c << 1) & 0xffff
    return c

def pack(cmd, data=b'', seq=1):
    h = bytearray(24)
    h[0] = 0xaa; h[1] = 0; struct.pack_into('<HIHBB', h, 2, 24 + len(data), seq, cmd, 0, 0)
    struct.pack_into('<H', h, 18, crc16(bytes(h[:18])))
    struct.pack_into('<I', h, 20, zlib.crc32(data) & 0xffffffff if data else 0)
    return bytes(h) + data

socks = {}
errs = []
def mk(port, addr, reuse):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    if reuse:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 200 * 1024 * 1024)
    except OSError:
        pass
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    try:
        s.bind((addr, port))
    except OSError as e:
        errs.append({'port': port, 'addr': addr, 'err': str(e)})
        s.close(); return None
    s.setblocking(False)
    return s

for p in [int(x) for x in a.ports.split(',') if x]:
    if a.mode == 'sdk2':
        s = mk(p, a.host_ip, True)
        if s: socks[s] = f'{a.host_ip}:{p}'
        if p in (56000, 56201):
            s2 = mk(p, '255.255.255.255', True)
            if s2: socks[s2] = f'255.255.255.255:{p}'
    elif a.mode == 'sdk2local':
        s = mk(p, '0.0.0.0', True)
        if s: socks[s] = f'0.0.0.0:{p}'
    elif a.mode == 'generic':
        s = mk(p, '0.0.0.0', False)
        if s: socks[s] = f'0.0.0.0:{p}'
    elif a.mode == 'generic_ip':
        s = mk(p, a.host_ip, False)
        if s: socks[s] = f'{a.host_ip}:{p}'

print(json.dumps({'ev': 'ready', 'mode': a.mode, 'bound': list(socks.values()), 'errors': errs}), flush=True)
cnt = {v: 0 for v in socks.values()}
configured = False
t0 = last = time.time()
cmd_sock = next((s for s, v in socks.items() if v.endswith(':56101')), None)
while time.time() - t0 < a.secs:
    r, _, _ = select.select(list(socks.keys()), [], [], 0.2)
    for s in r:
        try:
            while True:
                m, src = s.recvfrom(65536)
                cnt[socks[s]] += 1
        except BlockingIOError:
            pass
    if a.configure and not configured and cmd_sock:
        host = bytes(map(int, a.host_ip.split('.'))) + struct.pack('<HH', 56301, 56300)
        body = struct.pack('<HH', 3, 0) + struct.pack('<HH', 0x0000, 1) + b'\x01' + struct.pack('<HH', 0x0006, 8) + host + struct.pack('<HH', 0x001a, 1) + b'\x01'
        cmd_sock.sendto(pack(0x0100, body, 77), (a.configure, 56100))
        configured = True
        print(json.dumps({'ev': 'configured', 'lidar': a.configure, 'host': a.host_ip}), flush=True)
    if time.time() - last >= 1:
        last = time.time()
        print(json.dumps({'ev': 'stats', 'cnt': cnt}), flush=True)
