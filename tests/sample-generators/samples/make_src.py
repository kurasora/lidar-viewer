import json, base64, struct, numpy as np, colorsys
d = json.load(open('/home/claude/pcd-viewer/sample/map.json'))
n = d['n']
q = np.frombuffer(base64.b64decode(d['b64']), dtype='<u2').reshape(n, 3).astype(np.float64)
P = q * np.array(d['sc']) + np.array(d['lo'])
I = np.frombuffer(base64.b64decode(d['b64i']), dtype=np.uint8).astype(np.float32)
rng = np.random.default_rng(1)
import sys
N = int(sys.argv[1]) if len(sys.argv) > 1 else 60000
idx = np.sort(rng.choice(n, N, replace=False))
P, I = P[idx], I[idx]
z = P[:, 2]; t = (z - np.percentile(z, 1)) / (np.percentile(z, 99) - np.percentile(z, 1)); t = np.clip(t, 0, 1)
rgb = np.array([colorsys.hsv_to_rgb(0.66 * (1 - a), 0.75, 0.55 + 0.45 * b / 255) for a, b in zip(t, I)])
rgb = (rgb * 255).round().astype(np.uint8)
np.save('src/P.npy', P); np.save('src/I.npy', I); np.save('src/RGB.npy', rgb)
with open('src/src.ply', 'wb') as f:
    f.write(f"ply\nformat binary_little_endian 1.0\nelement vertex {len(P)}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nproperty float scalar_Intensity\nend_header\n".encode())
    rec = np.zeros(len(P), dtype=[('x','<f4'),('y','<f4'),('z','<f4'),('r','u1'),('g','u1'),('b','u1'),('i','<f4')])
    rec['x'], rec['y'], rec['z'] = P.T; rec['r'], rec['g'], rec['b'] = rgb.T; rec['i'] = I
    f.write(rec.tobytes())
print(P.min(0), P.max(0), len(P))
