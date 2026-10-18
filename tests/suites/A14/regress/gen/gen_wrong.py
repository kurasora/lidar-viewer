# 反対側のツアー用のファイル: 巨大な画像（中身は単色なのでファイルは小さい）と写真
import sys
from PIL import Image
out = sys.argv[1]
Image.new('L', (16000, 16000), 128).save(out + '/huge_16000.png', optimize=True)
Image.new('RGB', (8000, 6000), (90, 120, 200)).save(out + '/photo_8000x6000.jpg', quality=90)
print('ok')
