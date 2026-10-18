import json, sys, numpy as np
truth = json.load(open(sys.argv[1])); rows = [json.loads(l) for l in open(sys.argv[2])]
print(f"{'case':14s} {'note':38s} {'真の傾き':>7s} {'app傾き':>7s} {'上向き誤差°':>9s} {'向き誤差°':>8s} {'床z真':>8s} {'床z app':>8s} {'床誤差m':>8s}")
res = {}
for r in rows:
    name = r['file'][:-4]; t = truth[name]
    R = np.array(t['R']); ut = R[:, 2]; dt = R[:, 0]
    true_tilt = np.degrees(np.arccos(np.clip(ut[2], -1, 1)))
    if 'error' in r or 'loadError' in r:
        print(f"{name:14s} {t['note'][:38]:38s} {true_tilt:7.2f}  エラー: {r.get('error') or r.get('loadError')}"); res[name] = {'error': r.get('error')}; continue
    Ra = np.array(r['R']); ua = Ra[2]
    off = np.array(r['offset'])
    up_err = np.degrees(np.arccos(np.clip(ua @ ut, -1, 1)))
    v = Ra @ dt; yaw = np.degrees(np.arctan2(v[1], v[0])); yaw_err = (yaw + 90) % 180 - 90
    fp = np.array(t['floor_file']) - off
    fz_true = float(np.mean(fp @ ua))
    fz = r['floorZ']
    ferr = (fz - fz_true) if fz is not None else None
    res[name] = {'up_err': up_err, 'yaw_err': yaw_err, 'floor_err': ferr, 'tilt_app': r['tilt'], 'tilt_true': true_tilt}
    print(f"{name:14s} {t['note'][:38]:38s} {true_tilt:7.2f} {r['tilt']:7.2f} {up_err:9.3f} {yaw_err:8.2f} {fz_true:8.3f} {('%8.3f' % fz) if fz is not None else '    None'} {('%8.3f' % ferr) if ferr is not None else '    None'}")
json.dump(res, open(sys.argv[3], 'w'), indent=1)
