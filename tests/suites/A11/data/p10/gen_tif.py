# GeoTIFF の位置合わせ: 画素の中心（PixelIsArea）/ 点（PixelIsPoint）/ 回転つき
import numpy as np, tifffile, json
def geotiff(path, Z, raster_type, tie=(0, 0, 0, 1000.0, 5000.0, 0.0), scale=(2.0, 2.0, 0.0), transform=None):
    keys = [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, raster_type, 3072, 0, 1, 32654]
    extra = [(34735, 'H', len(keys), keys, False)]
    if transform is not None: extra.append((34264, 'd', 16, transform, False))
    else: extra += [(33550, 'd', 3, scale, False), (33922, 'd', 6, tie, False)]
    tifffile.imwrite(path, Z.astype(np.float32), extratags=extra)
Z = np.arange(12, dtype=np.float32).reshape(3, 4) + 10   # 3 行 × 4 列、値 10〜21
geotiff('dem_area.tif', Z, 1)
geotiff('dem_point.tif', Z, 2)
# 回転つき（30°）の ModelTransformation: X = a*c + b*r + d、Y = e*c + f*r + h
a = np.radians(30); s = 2.0
M = [s * np.cos(a), s * np.sin(a), 0, 1000.0, s * np.sin(a), -s * np.cos(a), 0, 5000.0, 0, 0, 0, 0, 0, 0, 0, 1]
geotiff('dem_rot.tif', Z, 1, transform=M)
exp = {}
r, c = np.mgrid[0:3, 0:4]
exp['dem_area'] = np.c_[1000 + (c.ravel() + 0.5) * 2, 5000 - (r.ravel() + 0.5) * 2, Z.ravel()].tolist()
exp['dem_point'] = np.c_[1000 + c.ravel() * 2, 5000 - r.ravel() * 2, Z.ravel()].tolist()
cc, rr = c.ravel() + 0.5, r.ravel() + 0.5
exp['dem_rot'] = np.c_[M[0] * cc + M[1] * rr + M[3], M[4] * cc + M[5] * rr + M[7], Z.ravel()].tolist()
json.dump(exp, open('expect_tif.json', 'w'))
