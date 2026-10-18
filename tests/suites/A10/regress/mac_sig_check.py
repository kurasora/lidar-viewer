#!/usr/bin/env python3
# mac の .app（ad-hoc 署名）を Linux 上で点検する（Apple の codesign の代わりの簡易版）
#   python3 -I mac_sig_check.py "<…/LiDAR Viewer.app>"  → JSON（problems が空なら OK）
# 確かめること:
#   ・入れ子のコード（Frameworks/*.framework/Versions/A、Helper の .app、dylib など）を含む全 Mach-O の
#     CodeDirectory のページの指紋が、ファイルの中身と合うか（＝署名の後に書き換えられていないか）
#   ・特別な枠: Info.plist（1）・要件（2）・CodeResources（3）・権限（5,7）の指紋が合うか
#   ・CodeResources の files2 の各項目（指紋・記号リンク・入れ子の cdhash）が実物と合うか、載っていないファイルがないか
#   ・署名の種類（ADHOC、hardened runtime の有無）、identifier、LC_UUID、CPU、最小 OS
import sys, os, struct, hashlib, plistlib, json, re

CPU = {0x01000007: 'x86_64', 0x0100000c: 'arm64', 7: 'i386', 12: 'arm'}
MH_MAGIC_64 = 0xfeedfacf
FAT_MAGIC = 0xcafebabe
CS_FLAGS = {0x2: 'ADHOC', 0x10000: 'RUNTIME', 0x20000: 'LINKER_SIGNED', 0x200: 'KILL', 0x800: 'RESTRICT', 0x1000: 'ENFORCEMENT', 0x2000: 'LIBRARY_VALIDATION'}
HASH = {1: hashlib.sha1, 2: hashlib.sha256, 3: lambda d=b'': hashlib.sha256(d), 4: hashlib.sha384}


def is_macho(path):
    try:
        with open(path, 'rb') as f:
            m = f.read(4)
    except Exception:
        return False
    return len(m) == 4 and (struct.unpack('<I', m)[0] in (MH_MAGIC_64, 0xfeedface) or struct.unpack('>I', m)[0] in (FAT_MAGIC,))


def slices(data):
    m = struct.unpack('>I', data[:4])[0]
    if m == FAT_MAGIC:
        n = struct.unpack('>I', data[4:8])[0]
        out = []
        for i in range(n):
            cputype, sub, off, size, align = struct.unpack('>IIIII', data[8 + 20 * i: 28 + 20 * i])
            out.append((off, size))
        return out
    return [(0, len(data))]


def parse_slice(data, base, size):
    sl = data[base: base + size]
    magic, cputype, sub, ftype, ncmds, sizeofcmds, flags = struct.unpack('<IiiIIII', sl[:28])
    off = 32 if magic == MH_MAGIC_64 else 28
    info = {'cpu': CPU.get(cputype & 0xffffffff, hex(cputype & 0xffffffff)), 'filetype': ftype}
    sig = None
    for _ in range(ncmds):
        cmd, cmdsize = struct.unpack('<II', sl[off: off + 8])
        if cmd == 0x1d:  # LC_CODE_SIGNATURE
            dataoff, datasize = struct.unpack('<II', sl[off + 8: off + 16])
            sig = (dataoff, datasize)
        elif cmd == 0x1b:  # LC_UUID
            u = sl[off + 8: off + 24].hex()
            info['uuid'] = f'{u[:8]}-{u[8:12]}-{u[12:16]}-{u[16:20]}-{u[20:]}'.upper()
        elif cmd == 0x32:  # LC_BUILD_VERSION
            platform, minos, sdk = struct.unpack('<III', sl[off + 8: off + 20])
            info['minos'] = f'{minos >> 16}.{(minos >> 8) & 255}.{minos & 255}'
            info['sdk'] = f'{sdk >> 16}.{(sdk >> 8) & 255}.{sdk & 255}'
        elif cmd == 0x24:  # LC_VERSION_MIN_MACOSX
            v = struct.unpack('<I', sl[off + 8: off + 12])[0]
            info['minos'] = f'{v >> 16}.{(v >> 8) & 255}.{v & 255}'
        off += cmdsize
    info['signature'] = sig
    return sl, info


def parse_superblob(blob):
    magic, length, count = struct.unpack('>III', blob[:12])
    assert magic == 0xfade0cc0, hex(magic)
    out = []
    for i in range(count):
        typ, off = struct.unpack('>II', blob[12 + 8 * i: 20 + 8 * i])
        bmagic, blen = struct.unpack('>II', blob[off: off + 8])
        out.append((typ, bmagic, blob[off: off + blen]))
    return out


def parse_cd(cd):
    (magic, length, version, flags, hashOffset, identOffset, nSpecial, nCode, codeLimit,
     hashSize, hashType, platform, pageSize, spare2) = struct.unpack('>IIIIIIIIIBBBBI', cd[:44])
    ident = cd[identOffset: cd.index(b'\0', identOffset)].decode()
    team = None
    if version >= 0x20200:
        teamOffset = struct.unpack('>I', cd[48:52])[0]
        if teamOffset:
            team = cd[teamOffset: cd.index(b'\0', teamOffset)].decode()
    if version >= 0x20300:
        codeLimit64 = struct.unpack('>Q', cd[56:64])[0]
        if codeLimit64:
            codeLimit = codeLimit64
    special = {}
    for s in range(1, nSpecial + 1):
        h = cd[hashOffset - hashSize * s: hashOffset - hashSize * (s - 1)]
        if any(h):
            special[s] = h
    code = [cd[hashOffset + hashSize * i: hashOffset + hashSize * (i + 1)] for i in range(nCode)]
    return {'version': hex(version), 'flags': flags, 'flag_names': [n for b, n in CS_FLAGS.items() if flags & b],
            'ident': ident, 'team': team, 'hashType': hashType, 'hashSize': hashSize, 'pageSize': 1 << pageSize if pageSize else 0,
            'codeLimit': codeLimit, 'special': special, 'code': code}


def hfun(t):
    return {1: hashlib.sha1, 2: hashlib.sha256, 3: hashlib.sha256, 4: hashlib.sha384}[t]


def check_macho(path, bundle_info_plist=None, code_resources=None, problems=None, label=None):
    """1 つの Mach-O を点検。戻り値: {cdhash(主の CodeDirectory の sha256 先頭 20 バイト), ...}"""
    label = label or path
    data = open(path, 'rb').read()
    res = {'slices': []}
    for base, size in slices(data):
        sl, info = parse_slice(data, base, size)
        if not info['signature']:
            problems.append(f'{label}: 署名がない（{info["cpu"]}）')
            res['slices'].append(info)
            continue
        dataoff, datasize = info['signature']
        blobs = parse_superblob(sl[dataoff: dataoff + datasize])
        info['blobs'] = [hex(t) for t, m, b in blobs]
        cds = [(t, b) for t, m, b in blobs if m == 0xfade0c02]
        reqs = [b for t, m, b in blobs if t == 2]
        ents = {t: b for t, m, b in blobs if t in (5, 7)}
        tail = sl[dataoff + datasize:]
        info['bytes_after_signature'] = len(tail)
        if any(tail):
            problems.append(f'{label}: 署名の後ろに 0 でないデータが {sum(1 for x in tail if x)} バイトある')
        for t, cdb in cds:
            cd = parse_cd(cdb)
            hf = hfun(cd['hashType'])
            # ページの指紋
            ps = cd['pageSize']
            bad = 0
            for i, h in enumerate(cd['code']):
                chunk = sl[i * ps: min((i + 1) * ps, cd['codeLimit'])]
                if hf(chunk).digest()[:cd['hashSize']] != h:
                    bad += 1
            if bad:
                problems.append(f'{label}: ページの指紋が {bad}/{len(cd["code"])} 枚合わない（署名の後に書き換えられた）')
            if cd['codeLimit'] != dataoff:
                problems.append(f'{label}: codeLimit {cd["codeLimit"]} が署名の位置 {dataoff} と違う')
            # 特別な枠
            sp = cd['special']
            if bundle_info_plist is not None:
                if 1 not in sp:
                    problems.append(f'{label}: Info.plist の指紋（枠 1）がない')
                elif hf(open(bundle_info_plist, 'rb').read()).digest()[:cd['hashSize']] != sp[1]:
                    problems.append(f'{label}: Info.plist の指紋（枠 1）が実物と合わない')
            if 2 in sp and reqs and hf(reqs[0]).digest()[:cd['hashSize']] != sp[2]:
                problems.append(f'{label}: 要件（枠 2）の指紋が合わない')
            if code_resources is not None:
                if 3 not in sp:
                    problems.append(f'{label}: CodeResources の指紋（枠 3）がない')
                elif not os.path.exists(code_resources):
                    problems.append(f'{label}: CodeResources がない')
                elif hf(open(code_resources, 'rb').read()).digest()[:cd['hashSize']] != sp[3]:
                    problems.append(f'{label}: CodeResources の指紋（枠 3）が実物と合わない')
            for slot in (5, 7):
                if slot in sp:
                    if slot not in ents:
                        problems.append(f'{label}: 権限の枠 {slot} の指紋があるのに中身がない')
                    elif hf(ents[slot]).digest()[:cd['hashSize']] != sp[slot]:
                        problems.append(f'{label}: 権限の枠 {slot} の指紋が合わない')
            if t == 0:  # 主の CodeDirectory
                info['cd'] = {k: v for k, v in cd.items() if k not in ('code', 'special')}
                info['cd']['special_slots'] = sorted(cd['special'])
                info['cdhash'] = hashlib.sha256(cdb).digest()[:20].hex() if cd['hashType'] == 2 else hashlib.sha1(cdb).hexdigest()
                info['entitlements'] = ents.get(5, b'')[8:].decode('utf-8', 'replace') if 5 in ents else None
        res['slices'].append(info)
    return res


def nested_dirs(bundle_contents):
    return []


def check_bundle(bundle, problems, depth=0, report=None):
    """bundle: .app / .framework/Versions/A のフォルダ。戻り値: 主の Mach-O の cdhash"""
    report = report if report is not None else {}
    if os.path.isdir(os.path.join(bundle, 'Contents')):
        root = os.path.join(bundle, 'Contents')
        plist = os.path.join(root, 'Info.plist')
        kind = 'app'
    else:
        root = bundle
        plist = os.path.join(root, 'Resources', 'Info.plist')
        kind = 'framework'
    info = plistlib.load(open(plist, 'rb'))
    exe_name = info.get('CFBundleExecutable')
    exe = os.path.join(root, 'MacOS', exe_name) if kind == 'app' else os.path.join(root, exe_name)
    cr_path = os.path.join(root, '_CodeSignature', 'CodeResources')
    rel_b = os.path.relpath(bundle, report.get('_top', bundle))
    r = check_macho(exe, plist, cr_path, problems, label=rel_b + ' [' + exe_name + ']')
    entry = {'bundle': rel_b, 'kind': kind, 'id': info.get('CFBundleIdentifier'), 'name': info.get('CFBundleName'),
             'exe': exe_name, 'slices': r['slices']}
    report.setdefault('bundles', []).append(entry)
    # CodeResources の files2 を実物と照合
    if not os.path.exists(cr_path):
        problems.append(f'{rel_b}: _CodeSignature/CodeResources がない')
        return r
    cr = plistlib.load(open(cr_path, 'rb'))
    files2 = cr.get('files2', {})
    seen = set()
    for key, v in files2.items():
        p = os.path.join(root, key)
        seen.add(key)
        if isinstance(v, (bytes, bytearray)):
            v = {'hash': v}
        if 'symlink' in v:
            if not os.path.islink(p):
                problems.append(f'{rel_b}: {key} は記号リンクのはずが、記号リンクでない')
            elif os.readlink(p) != v['symlink']:
                problems.append(f'{rel_b}: {key} の記号リンク先が違う（{os.readlink(p)} ≠ {v["symlink"]}）')
            continue
        if 'cdhash' in v:
            # 入れ子のコード
            if not os.path.exists(p):
                problems.append(f'{rel_b}: 入れ子のコード {key} がない')
                continue
            if os.path.isdir(p):
                target = p
                if os.path.isdir(os.path.join(p, 'Versions')):
                    cur = os.path.join(p, 'Versions', 'Current')
                    target = os.path.realpath(cur) if os.path.islink(cur) else os.path.join(p, 'Versions', 'A')
                sub = check_bundle(target, problems, depth + 1, report)
                cdh = sub['slices'][0].get('cdhash') if sub['slices'] else None
            else:
                sub = check_macho(p, None, None, problems, label=os.path.relpath(p, report['_top']))
                report.setdefault('machos', []).append({'path': os.path.relpath(p, report['_top']), 'slices': sub['slices']})
                cdh = sub['slices'][0].get('cdhash') if sub['slices'] else None
            if cdh and v['cdhash'].hex() != cdh:
                problems.append(f'{rel_b}: 入れ子 {key} の cdhash が合わない（記録 {v["cdhash"].hex()} ≠ 実物 {cdh}）')
            continue
        if not os.path.exists(p):
            if not v.get('optional'):
                problems.append(f'{rel_b}: 署名に載っている {key} がない')
            continue
        data = open(p, 'rb').read()
        if 'hash2' in v and hashlib.sha256(data).digest() != v['hash2']:
            problems.append(f'{rel_b}: {key} の指紋（sha256）が合わない')
        if 'hash' in v and hashlib.sha1(data).digest() != v['hash']:
            problems.append(f'{rel_b}: {key} の指紋（sha1）が合わない')
    # 署名に載っていないファイル（入れ子の中は入れ子の署名で見る）
    skip_top = {'Info.plist', 'PkgInfo', '_CodeSignature'}
    for dp, dns, fns in os.walk(root, followlinks=False):
        rel_dir = os.path.relpath(dp, root)
        parts = [] if rel_dir == '.' else rel_dir.split(os.sep)
        if parts and parts[0] in skip_top:
            continue
        # 入れ子の bundle の中には入らない
        keep = []
        for d in dns:
            rel = os.path.normpath(os.path.join(rel_dir, d)) if parts else d
            full = os.path.join(dp, d)
            if os.path.islink(full):
                if rel not in seen:
                    problems.append(f'{rel_b}: 記号リンク {rel} が署名に載っていない')
                continue
            if rel in seen:
                continue  # 入れ子のコード
            if kind == 'framework' and rel == 'Versions':
                continue
            keep.append(d)
        dns[:] = keep
        for fn in fns:
            rel = os.path.normpath(os.path.join(rel_dir, fn)) if parts else fn
            if not parts and fn in skip_top:
                continue
            if kind == 'app' and rel == os.path.join('MacOS', exe_name):
                continue
            if kind == 'framework' and rel in (exe_name, os.path.join('Resources', 'Info.plist')):
                continue
            if rel not in seen:
                problems.append(f'{rel_b}: {rel} が署名（CodeResources）に載っていない')
    return r


def main():
    app = os.path.abspath(sys.argv[1])
    problems = []
    report = {'_top': app}
    check_bundle(app, problems, 0, report)
    # すべての Mach-O（dylib・ShipIt なども）が署名されていて、ページの指紋が合うか
    allm = []
    for dp, dns, fns in os.walk(app):
        for fn in fns:
            fp = os.path.join(dp, fn)
            if os.path.islink(fp) or not is_macho(fp):
                continue
            r = check_macho(fp, None, None, problems, label=os.path.relpath(fp, app))
            for s in r['slices']:
                cd = s.get('cd', {})
                allm.append({'path': os.path.relpath(fp, app), 'cpu': s['cpu'], 'uuid': s.get('uuid'), 'minos': s.get('minos'),
                             'ident': cd.get('ident'), 'flags': cd.get('flag_names'), 'cdhash': s.get('cdhash')})
    report['all_macho'] = allm
    report.pop('_top')
    report['problems'] = sorted(set(problems))
    report['ok'] = not problems
    print(json.dumps(report, ensure_ascii=False, indent=1, default=lambda o: o.hex() if isinstance(o, (bytes, bytearray)) else str(o)))


if __name__ == '__main__':
    main()
