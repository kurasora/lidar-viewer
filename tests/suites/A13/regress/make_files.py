# A13 の試験用ファイルを作る（python3 -I make_files.py <出力フォルダ>）
#  xss_field.pcd     … 項目名に HTML（<img ... onerror=...>）を入れた PCD（項目名は innerHTML に入る）
#  xss_field_cat.pcd … 同じく、値が整数で少ない種類（色分けで「分類」扱い → 凡例にも入る）
#  xss_name.pcd      … 普通の PCD（ファイル名の側に HTML を入れて開く用。名前は試験側で付ける）
#  small_local.pcd   … 原点付近の小さな点群（グローバルシフトなし）
#  utm_cloud.pcd     … UTM 風の大きな座標（x=539000+、y=3836000+）を double で書いた PCD
import sys, os, random, struct
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
random.seed(1)
def pcd_ascii(path, fields, rows):
    with open(path, 'w') as f:
        f.write('# .PCD v0.7\nVERSION 0.7\n')
        f.write('FIELDS ' + ' '.join(fields) + '\n')
        f.write('SIZE ' + ' '.join(['4'] * len(fields)) + '\n')
        f.write('TYPE ' + ' '.join(['F'] * len(fields)) + '\n')
        f.write('COUNT ' + ' '.join(['1'] * len(fields)) + '\n')
        f.write(f'WIDTH {len(rows)}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {len(rows)}\nDATA ascii\n')
        for r in rows: f.write(' '.join(f'{v:.6f}' if isinstance(v, float) else str(v) for v in r) + '\n')
pay = '<img/src="x"/onerror=window.__xss=(window.__xss||0)+1>'
rows = [(random.uniform(0, 10), random.uniform(0, 5), random.uniform(0, 3), random.uniform(0, 100)) for _ in range(3000)]
pcd_ascii(f'{out}/xss_field.pcd', ['x', 'y', 'z', pay], rows)
rows = [(random.uniform(0, 10), random.uniform(0, 5), random.uniform(0, 3), random.randint(0, 5)) for _ in range(3000)]
pcd_ascii(f'{out}/xss_field_cat.pcd', ['x', 'y', 'z', pay], rows)
pcd_ascii(f'{out}/small_local.pcd', ['x', 'y', 'z'], [(random.uniform(-5, 5), random.uniform(-5, 5), random.uniform(0, 3)) for _ in range(3000)])
# UTM: double で書く（F 8）
n = 3000
pts = [(539000 + random.uniform(0, 80), 3836000 + random.uniform(0, 30), 30 + random.uniform(0, 3)) for _ in range(n)]
with open(f'{out}/utm_cloud.pcd', 'wb') as f:
    f.write(f'# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 8 8 8\nTYPE F F F\nCOUNT 1 1 1\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA binary\n'.encode())
    for p in pts: f.write(struct.pack('<ddd', *p))
with open(f'{out}/utm_cloud.xyz.txt', 'w') as f:
    for p in pts: f.write(f'{p[0]:.4f} {p[1]:.4f} {p[2]:.4f}\n')
print('ok', sorted(os.listdir(out)))
