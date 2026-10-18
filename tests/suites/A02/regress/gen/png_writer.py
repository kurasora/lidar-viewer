# 小さな PNG の書き出し（Pillow で書けない 16 bit RGB と gAMA つき）
import struct, zlib
import numpy as np


def _chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)


def write_png16(fn, a16):
    h, w, _ = a16.shape
    raw = b''.join(b'\0' + a16[r].astype('>u2').tobytes() for r in range(h))
    ihdr = struct.pack('>IIBBBBB', w, h, 16, 2, 0, 0, 0)
    open(fn, 'wb').write(b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', ihdr) + _chunk(b'IDAT', zlib.compress(raw)) + _chunk(b'IEND', b''))


def write_png8_gamma(fn, a8, gamma100k):
    h, w, _ = a8.shape
    raw = b''.join(b'\0' + a8[r].astype('u1').tobytes() for r in range(h))
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    open(fn, 'wb').write(b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', ihdr) + _chunk(b'gAMA', struct.pack('>I', gamma100k)) + _chunk(b'IDAT', zlib.compress(raw)) + _chunk(b'IEND', b''))
