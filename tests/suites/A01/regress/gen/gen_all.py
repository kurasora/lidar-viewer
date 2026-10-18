# すべての試験用ファイルと正解を作る: python3 gen_all.py [形式名...]
#   出力: ../data/<形式>/... と ../data/manifest.json
import sys, os, importlib, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common

MODS = ['gen_pcd', 'gen_las', 'gen_e57', 'gen_ply', 'gen_ascii', 'gen_ptx', 'gen_cc', 'gen_misc', 'gen_cap', 'gen_traj', 'gen_samples']
want = sys.argv[1:] or MODS
for m in MODS:
    if m not in want and m.replace('gen_', '') not in want: continue
    try:
        mod = importlib.import_module(m)
    except ModuleNotFoundError as e:
        if e.name == m: print(f'（{m} はまだない）'); continue
        raise
    n0 = len(common.CASES)
    mod.gen()
    print(f'{m}: {len(common.CASES) - n0} 件')
common.write_manifest()
