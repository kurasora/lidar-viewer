# GeoTIFF の nodata の試験用ファイル: python3 gen_tif.py <出力フォルダ>
#   nd9.tif  … float32、GDAL_NODATA = "-3.40282347e+38"（9 桁）、左半分が nodata
#   nd18.tif … 同じで "-3.4028234663852886e+38"（17 桁）
#   nd_m9999.tif … nodata = "-9999"
import sys, os, numpy as np, tifffile
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
a = np.full((50, 80), 12.5, np.float32); a[:, :40] = np.float32(-3.4028234663852886e38)
for name, s in [('nd9', '-3.40282347e+38'), ('nd18', '-3.4028234663852886e+38')]:
    tifffile.imwrite(f'{out}/{name}.tif', a, extratags=[(42113, 's', 0, s, True)])
b = np.full((50, 80), 7.0, np.float32); b[:, :40] = -9999
tifffile.imwrite(f'{out}/nd_m9999.tif', b, extratags=[(42113, 's', 0, '-9999', True)])
print('ok', sorted(os.listdir(out)))
