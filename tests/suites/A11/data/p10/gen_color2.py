# PLY の float の色（0〜1）。Open3D などは 0〜1 の float で書くことがある
import numpy as np
rng = np.random.default_rng(51); n = 20000
P = np.c_[rng.uniform(0, 10, n), rng.uniform(0, 10, n), rng.uniform(0, 3, n)]
RGBf = rng.uniform(0, 1, (n, 3))
for t, nm in [('float', 'ply_float01.ply'), ('double', 'ply_double01.ply')]:
    dt = '<f4' if t == 'float' else '<f8'
    with open(nm, 'wb') as f:
        f.write(f"ply\nformat binary_little_endian 1.0\nelement vertex {n}\nproperty float x\nproperty float y\nproperty float z\nproperty {t} red\nproperty {t} green\nproperty {t} blue\nend_header\n".encode())
        rec = np.zeros(n, dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('r', dt), ('g', dt), ('b', dt)]); rec['x'], rec['y'], rec['z'] = P.T; rec['r'], rec['g'], rec['b'] = RGBf.T
        f.write(rec.tobytes())
np.save('rgbf01.npy', np.round(RGBf * 255))
