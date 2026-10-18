#!/usr/bin/env python3
# deb の中の md5sums と、実際の中身（data.tar）の md5 を突き合わせる
#   python3 -I deb_md5_check.py <x.deb>...
import sys, subprocess, tarfile, hashlib, io, os, tempfile, json
for deb in sys.argv[1:]:
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(['dpkg-deb', '-e', deb, td], check=True)
        sums = {}
        for line in open(os.path.join(td, 'md5sums'), encoding='utf-8'):
            h, p = line.rstrip('\n').split('  ', 1); sums[p] = h
    p = subprocess.Popen(['dpkg-deb', '--fsys-tarfile', deb], stdout=subprocess.PIPE)
    bad, seen = [], set()
    with tarfile.open(fileobj=p.stdout, mode='r|') as tf:
        for m in tf:
            if not m.isfile(): continue
            name = m.name[2:] if m.name.startswith('./') else m.name
            h = hashlib.md5()
            f = tf.extractfile(m)
            for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
            seen.add(name)
            if sums.get(name) != h.hexdigest(): bad.append(name)
    p.wait()
    missing = sorted(set(sums) - seen)
    print(json.dumps({'deb': os.path.basename(deb), 'files': len(seen), 'listed': len(sums), 'mismatch': bad[:10], 'listed_but_missing': missing[:10], 'ok': not bad and not missing}, ensure_ascii=False))
