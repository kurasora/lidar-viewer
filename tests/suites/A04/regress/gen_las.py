# LAS の試験用ファイルを作る（laspy）: 点の形式 0〜10 ごとに、欄ごとに違う値を入れる
#   python3 gen_las.py <出力フォルダ>
#   ・pf{0..10}.las … 1000 点。x=i*0.01, y=-i*0.02, z=5+i*0.001、強度・リターン番号・分類・点の元 ID・GPS 時刻・RGB（16 bit）
#   ・dark256.las … 点の形式 2。最初の 25000 点は色 (0,0,0)、残りは 8 bit 色 × 256（v<<8）で書いたもの
#   ・dark257.las … 同じで × 257
#   ・truncated.las … 点数 1,000,000 と書いてあるが 1000 点で切れている
#   ・expect.json … 期待値
import sys, json, os
import numpy as np
import laspy

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
N = 1000
i = np.arange(N)
exp = {}
for pf in range(11):
    ver = '1.2' if pf <= 3 else '1.3' if pf <= 5 else '1.4'
    h = laspy.LasHeader(point_format=pf, version=ver)
    h.scales = [0.001, 0.001, 0.001]; h.offsets = [0, 0, 0]
    las = laspy.LasData(h)
    las.x = i * 0.01; las.y = -i * 0.02; las.z = 5 + i * 0.001
    las.intensity = (i * 7) % 65536
    ext = pf >= 6
    nr = 15 if ext else 7
    las.return_number = 1 + i % nr
    las.number_of_returns = np.full(N, nr)
    las.classification = (i % 256) if ext else (i % 32)
    las.point_source_id = (i * 3) % 65536
    if ext:
        las.scan_angle = (i % 100) - 50
    else:
        las.scan_angle_rank = (i % 60) - 30
    las.user_data = (i * 11) % 256
    names = set(las.point_format.dimension_names)
    if 'gps_time' in names: las.gps_time = 1e9 + i * 0.5
    if 'red' in names:
        las.red = (i * 61) % 65536; las.green = (i * 113) % 65536; las.blue = (i * 251) % 65536
    if 'nir' in names: las.nir = (i * 5) % 65536
    las.write(f'{out}/pf{pf}.las')
    exp[f'pf{pf}'] = {
        'intensity': ((i * 7) % 65536).tolist(), 'return_number': (1 + i % nr).tolist(),
        'classification': ((i % 256) if ext else (i % 32)).tolist(), 'point_source_id': ((i * 3) % 65536).tolist(),
        'gps_time': (i * 0.5).tolist() if 'gps_time' in names else None,
        'rgb16': [((i * 61) % 65536).tolist(), ((i * 113) % 65536).tolist(), ((i * 251) % 65536).tolist()] if 'red' in names else None,
    }

M = 30000
j = np.arange(M)
v = (j * 37) % 256
for name, mul in [('dark256', 256), ('dark257', 257)]:
    h = laspy.LasHeader(point_format=2, version='1.2'); h.scales = [0.001] * 3; h.offsets = [0, 0, 0]
    las = laspy.LasData(h)
    las.x = j * 0.001; las.y = np.zeros(M); las.z = np.zeros(M)
    col = np.where(j < 25000, 0, v * mul)
    las.red = col; las.green = col; las.blue = col
    las.write(f'{out}/{name}.las')
exp['dark'] = {'v': v.tolist(), 'first_colored': 25000}

# 途中で切れたファイル: 1000 点だけ書き、ヘッダの点数を 1,000,000 にする
h = laspy.LasHeader(point_format=3, version='1.2'); h.scales = [0.001] * 3; h.offsets = [0, 0, 0]
las = laspy.LasData(h)
las.x = i * 0.01; las.y = i * 0.0; las.z = i * 0.0
las.write(f'{out}/truncated.las')
b = bytearray(open(f'{out}/truncated.las', 'rb').read())
import struct
struct.pack_into('<I', b, 107, 1000000)
open(f'{out}/truncated.las', 'wb').write(b)

json.dump(exp, open(f'{out}/expect.json', 'w'))
print('ok', sorted(os.listdir(out)))
