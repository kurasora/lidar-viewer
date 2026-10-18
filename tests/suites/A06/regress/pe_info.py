# Windows の exe の版情報とアイコン（リソース）を取り出す: python3 pe_info.py <exe> <出力フォルダ>
import sys, os, struct, io
import pefile
from PIL import Image
exe, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
pe = pefile.PE(exe, fast_load=True)
pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_RESOURCE']])
info = {}
for fi in getattr(pe, 'FileInfo', []) or []:
    for e in fi:
        if hasattr(e, 'StringTable'):
            for st in e.StringTable:
                for k, v in st.entries.items(): info[k.decode()] = v.decode(errors='replace')
print('VersionInfo:', info)
icons = {}
groups = []
for t in pe.DIRECTORY_ENTRY_RESOURCE.entries:
    if t.id == pefile.RESOURCE_TYPE['RT_ICON']:
        for n in t.directory.entries:
            for l in n.directory.entries:
                d = l.data.struct; icons[n.id] = pe.get_data(d.OffsetToData, d.Size)
    if t.id == pefile.RESOURCE_TYPE['RT_GROUP_ICON']:
        for n in t.directory.entries:
            for l in n.directory.entries:
                d = l.data.struct; groups.append((n.id or str(n.name), pe.get_data(d.OffsetToData, d.Size)))
print('icon groups:', [g[0] for g in groups], 'icons:', len(icons))
for gid, g in groups:
    _, _, cnt = struct.unpack('<HHH', g[:6])
    ents = []
    for i in range(cnt):
        w, h, cc, r, planes, bc, size, iid = struct.unpack('<BBBBHHIH', g[6 + 14 * i: 20 + 14 * i])
        ents.append((w or 256, h or 256, bc, size, iid))
    print('group', gid, ents)
    # 1 つの .ico に組み立てて、いちばん大きいものを PNG にする
    hdr = struct.pack('<HHH', 0, 1, cnt); off = 6 + 16 * cnt; body = b''
    for (w, h, bc, size, iid) in ents:
        data = icons[iid]
        hdr += struct.pack('<BBBBHHII', w % 256, h % 256, 0, 0, 1, bc, len(data), off + len(body)); body += data
    ico = Image.open(io.BytesIO(hdr + body))
    best = max(ico.info['sizes'])
    ico.size = best
    ico.convert('RGBA').save(os.path.join(out, f'exe_icon_group{gid}_{best[0]}.png'))
    print('saved', os.path.join(out, f'exe_icon_group{gid}_{best[0]}.png'))
