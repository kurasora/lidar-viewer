#!/usr/bin/env python3
# PE（Windows の exe）の version 情報・アイコン・マニフェスト・独自の資源を JSON で出す
#   PYTHONPATH=$W/pylib python3 -I pe_info.py <exe> [アイコンを書き出すフォルダ]
# 依存: pefile（$W/pylib に入れる）
import sys, os, json, struct
sys.path.insert(0, os.environ.get('PYTHONPATH', '').split(':')[0] or '.')
import pefile

RT = {v: k for k, v in pefile.RESOURCE_TYPE.items()}

def res_tree(pe):
    out = []
    if not hasattr(pe, 'DIRECTORY_ENTRY_RESOURCE'):
        return out
    for t in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        tname = str(t.name) if t.name else pefile.RESOURCE_TYPE.get(t.id, t.id)
        for n in t.directory.entries:
            nname = str(n.name) if n.name else n.id
            for l in n.directory.entries:
                d = l.data.struct
                out.append({'type': tname, 'name': nname, 'lang': l.id, 'rva': d.OffsetToData, 'size': d.Size})
    return out

def get_data(pe, rva, size):
    return pe.get_data(rva, size)

def main():
    exe = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else None
    pe = pefile.PE(exe, fast_load=True)
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_RESOURCE'], pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_SECURITY']])
    info = {'file': exe, 'size': os.path.getsize(exe), 'machine': hex(pe.FILE_HEADER.Machine),
            'subsystem': pe.OPTIONAL_HEADER.Subsystem, 'timestamp': pe.FILE_HEADER.TimeDateStamp,
            'dll_characteristics': hex(pe.OPTIONAL_HEADER.DllCharacteristics)}
    # version 情報
    vi = {}
    if hasattr(pe, 'FileInfo'):
        for fi in pe.FileInfo:
            for e in fi:
                if e.Key == b'StringFileInfo':
                    for st in e.StringTable:
                        for k, v in st.entries.items():
                            vi[k.decode('utf-8', 'replace')] = v.decode('utf-8', 'replace')
    if hasattr(pe, 'VS_FIXEDFILEINFO'):
        f = pe.VS_FIXEDFILEINFO[0]
        vi['_FileVersion(fixed)'] = f'{f.FileVersionMS >> 16}.{f.FileVersionMS & 0xffff}.{f.FileVersionLS >> 16}.{f.FileVersionLS & 0xffff}'
        vi['_ProductVersion(fixed)'] = f'{f.ProductVersionMS >> 16}.{f.ProductVersionMS & 0xffff}.{f.ProductVersionLS >> 16}.{f.ProductVersionLS & 0xffff}'
    info['version_info'] = vi
    tree = res_tree(pe)
    info['resource_types'] = sorted(set(str(r['type']) for r in tree))
    # マニフェスト
    for r in tree:
        if r['type'] == 'RT_MANIFEST':
            info['manifest'] = get_data(pe, r['rva'], r['size']).decode('utf-8', 'replace')
    # アイコン（RT_GROUP_ICON → 各 RT_ICON）
    icons = {r['name']: r for r in tree if r['type'] == 'RT_ICON'}
    groups = []
    for r in tree:
        if r['type'] != 'RT_GROUP_ICON':
            continue
        d = get_data(pe, r['rva'], r['size'])
        _, _, cnt = struct.unpack('<HHH', d[:6])
        ents = []
        for i in range(cnt):
            w, h, cc, _, planes, bpp, size, iid = struct.unpack('<BBBBHHIH', d[6 + 14 * i: 6 + 14 * (i + 1)])
            ents.append({'w': w or 256, 'h': h or 256, 'bpp': bpp, 'bytes': size, 'id': iid})
        g = {'name': r['name'], 'entries': ents}
        groups.append(g)
        if outdir:
            # .ico に組み立て直して書き出す
            os.makedirs(outdir, exist_ok=True)
            hdr = struct.pack('<HHH', 0, 1, cnt)
            off = 6 + 16 * cnt
            dirs, blobs = b'', b''
            for e in ents:
                ir = icons.get(e['id'])
                blob = get_data(pe, ir['rva'], ir['size']) if ir else b''
                dirs += struct.pack('<BBBBHHII', e['w'] % 256, e['h'] % 256, 0, 0, 1, e['bpp'], len(blob), off + len(blobs))
                blobs += blob
            p = os.path.join(outdir, f'group_{g["name"]}.ico')
            with open(p, 'wb') as f:
                f.write(hdr + dirs + blobs)
            g['written'] = p
    info['icon_groups'] = groups
    # そのほかの資源（Electron の asar 完全性など）
    other = []
    for r in tree:
        if r['type'] in ('RT_ICON', 'RT_GROUP_ICON', 'RT_MANIFEST', 'RT_VERSION'):
            continue
        rec = dict(r)
        if r['size'] < 4096:
            raw = get_data(pe, r['rva'], r['size'])
            try:
                rec['text'] = raw.decode('utf-8')
            except Exception:
                rec['hex'] = raw[:64].hex()
        other.append(rec)
    info['other_resources'] = other
    # 署名（Authenticode）の有無
    sec = pe.OPTIONAL_HEADER.DATA_DIRECTORY[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_SECURITY']]
    info['authenticode'] = {'present': sec.Size > 0, 'size': sec.Size}
    # オーバーレイ（NSIS などの後ろに付いた中身）
    ov = pe.get_overlay_data_start_offset()
    info['overlay_offset'] = ov
    print(json.dumps(info, ensure_ascii=False, indent=1))

main()
