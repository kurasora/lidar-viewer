#!/usr/bin/env python3
# 配布物の静的な点検（再試験用）。新しい配布物にも同じ点検をかけられる
#   python3 -I static_checks.py <release フォルダ> [--old <前の version の release フォルダ>] [--out <出力フォルダ>]
# 出力: <out>/summary.md（表）と <out>/summary.json。PASS/FAIL/WARN/INFO と、関係する報告の番号（A10-xxx）
# 依存: dpkg-deb, readelf, unzip, 7za（electron-builder の 7zip-bin）, node（@electron/asar）, pefile/Pillow/python-xlib（$W/pylib）
import sys, os, re, json, glob, hashlib, subprocess, shutil, plistlib, struct, tempfile, io

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.dirname(HERE)
PYLIB = os.path.join(W, 'pylib')
SZ = os.environ.get('SZ', '/home/claude/pcd-viewer/node_modules/7zip-bin/linux/x64/7za')
ELECTRON_ICON_256 = '6f0f28383bb8f3cb8f4d4a673115a4fee2643e16bbd3b208fb79aa47f922b34d'  # Electron 既定のアイコン（256px の画素の sha256）
ELECTRON_UUIDS = {'x86_64': '4C4C44C6-5555-3144-A10F-9FB886F07EF0', 'arm64': '4C4C4446-5555-3144-A117-AEB167531362'}  # Electron 34.5.8 の主の実行ファイル

args = sys.argv[1:]
rel = os.path.abspath(args[0])
old = None; out = None
if '--old' in args: old = os.path.abspath(args[args.index('--old') + 1])
if '--out' in args: out = os.path.abspath(args[args.index('--out') + 1])
out = out or os.path.join(W, 'regress', 'out', 'static')
os.makedirs(out, exist_ok=True)
tmp = tempfile.mkdtemp(prefix='a10static_', dir=os.environ.get('TMPDIR', os.path.join(W, 'tmp')))
env = dict(os.environ, PYTHONPATH=PYLIB)
R = []

def rec(cid, title, status, detail='', ref=''):
    R.append({'id': cid, 'title': title, 'status': status, 'detail': detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False), 'ref': ref})
    print(f'[{status}] {cid} {title} {("— " + (detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False)))[:300] if detail else ""}', flush=True)

def sh(cmd, **kw):
    return subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, env=env, **kw)

def sha(b):
    return hashlib.sha256(b).hexdigest()

def find(pat):
    g = sorted(glob.glob(os.path.join(rel, pat)))
    return g[0] if g else None

ART = {k: find(p) for k, p in {
    'exe': '*-portable.exe', 'appimage_x64': '*-x86_64.AppImage', 'appimage_arm64': '*-arm64.AppImage',
    'deb_amd64': '*-amd64.deb', 'deb_arm64': '*-arm64.deb', 'zip_mac_arm64': '*-mac-arm64.zip', 'zip_mac_x64': '*-mac-x64.zip'}.items()}

# ---------------------------------------------------------------- R01 配布物の一覧
missing = [k for k, v in ART.items() if not v]
rec('R01', '配布物 7 つがそろう', 'PASS' if not missing else 'FAIL', {'missing': missing, 'sizes_MB': {k: round(os.path.getsize(v) / 1e6, 1) for k, v in ART.items() if v}})

# ---------------------------------------------------------------- app.asar を各配布物から取り出して比べる
asars = {}
def asar_from_deb(p):
    r = sh(f"dpkg-deb --fsys-tarfile '{p}' | tar -xO --wildcards './opt/*/resources/app.asar'")
    return r.stdout
def asar_from_zip(p):
    r = sh(['unzip', '-p', p, '*/Contents/Resources/app.asar'])
    return r.stdout
def asar_from_exe(p):
    r = sh([SZ, 'e', '-so', p, 'resources/app.asar'])
    return r.stdout
def appimage_extract(p, pattern, dest):
    """AppImage の中身を取り出す。arm64 などこの CPU で動かない runtime は、x64 の runtime に中身をつないで取り出す"""
    os.makedirs(dest, exist_ok=True)
    data = open(p, 'rb').read(1 << 20)
    def elf_end(d):
        e_shoff = struct.unpack('<Q', d[0x28:0x30])[0]; e_shentsize, e_shnum = struct.unpack('<HH', d[0x3a:0x3e])
        return e_shoff + e_shentsize * e_shnum
    mach = struct.unpack('<H', data[18:20])[0]
    runner = p
    if mach != 62:  # x86_64 でない → x64 の AppImage の runtime を借りる
        x64 = ART.get('appimage_x64')
        if not x64: return None
        xd = open(x64, 'rb').read(1 << 20)
        runner = os.path.join(tmp, 'borrowed.AppImage')
        with open(runner, 'wb') as f, open(x64, 'rb') as a, open(p, 'rb') as b:
            f.write(a.read(elf_end(xd))); b.seek(elf_end(data)); shutil.copyfileobj(b, f)
        os.chmod(runner, 0o755)
    cmd = [runner, '--appimage-extract'] + ([pattern] if pattern else [])
    subprocess.run(cmd, cwd=dest, capture_output=True)
    if runner != p: os.remove(runner)
    return os.path.join(dest, 'squashfs-root')

for k in ART:
    p = ART[k]
    if not p: continue
    try:
        if k.startswith('deb'): b = asar_from_deb(p)
        elif k.startswith('zip'): b = asar_from_zip(p)
        elif k == 'exe': b = asar_from_exe(p)
        else:
            root = appimage_extract(p, 'resources/app.asar', os.path.join(tmp, k + '_asar'))
            b = open(os.path.join(root, 'resources', 'app.asar'), 'rb').read() if root and os.path.exists(os.path.join(root, 'resources', 'app.asar')) else b''
        asars[k] = sha(b) if b else None
    except Exception as e:
        asars[k] = 'error ' + str(e)[:80]
u = set(asars.values())
rec('R02', 'app.asar が全配布物で同じ', 'PASS' if len(u) == 1 and None not in u else 'FAIL', asars)

asar_path = os.path.join(tmp, 'app.asar')
b = asar_from_deb(ART['deb_amd64']) if ART.get('deb_amd64') else b''
open(asar_path, 'wb').write(b)
# 埋め込みの asar 完全性の値（mac の Info.plist）
integ = None
if ART.get('zip_mac_x64'):
    names = sh(['zipinfo', '-1', ART['zip_mac_x64']]).stdout.decode('utf-8', 'replace').splitlines()
    top = [n for n in names if re.match(r'^[^/]+\.app/Contents/Info\.plist$', n)]
    pl = plistlib.loads(sh(['unzip', '-p', ART['zip_mac_x64'], top[0]]).stdout) if top else {}
    integ = pl.get('ElectronAsarIntegrity', {}).get('Resources/app.asar', {}).get('hash')
r = sh(['node', os.path.join(HERE, 'asar_check.js'), asar_path] + ([integ] if integ else []))
try:
    A = json.loads(r.stdout)
    for c in A['checks']:
        if c['what'].endswith('（参考）'):
            rec('R03', 'asar: ' + c['what'], 'INFO', c['detail'])
        else:
            rec('R03', 'asar: ' + c['what'], 'PASS' if c['ok'] else 'FAIL', c['detail'] if not c['ok'] else '')
    PKG = A['pkg']
except Exception as e:
    rec('R03', 'asar の点検', 'FAIL', r.stderr.decode()[:300]); PKG = {}
VER = PKG.get('version', '?'); PRODUCT = PKG.get('productName', '?')

# ---------------------------------------------------------------- R04-R06 Windows exe
if ART.get('exe'):
    o = json.loads(sh(['python3', '-I', os.path.join(HERE, 'pe_info.py'), ART['exe'], os.path.join(tmp, 'ico_outer')]).stdout or b'{}')
    vi = o.get('version_info', {})
    ok = vi.get('ProductName') == PRODUCT and vi.get('ProductVersion', '').startswith(VER)
    rec('R04', 'portable.exe（外側）の version 情報', 'PASS' if ok else 'FAIL', {k: vi.get(k) for k in ('ProductName', 'ProductVersion', 'CompanyName', 'FileDescription', 'LegalCopyright')})
    rec('R04b', 'portable.exe の Authenticode 署名', 'PASS' if o.get('authenticode', {}).get('present') else 'WARN', '署名なし（SmartScreen の警告が出る）' if not o.get('authenticode', {}).get('present') else '', 'A10-011')
    inner = os.path.join(tmp, 'inner.exe')
    with open(inner, 'wb') as f:
        f.write(sh([SZ, 'e', '-so', ART['exe'], '*.exe']).stdout)
    i = json.loads(sh(['python3', '-I', os.path.join(HERE, 'pe_info.py'), inner, os.path.join(tmp, 'ico_inner')]).stdout or b'{}')
    os.remove(inner)
    vi = i.get('version_info', {})
    ok = vi.get('ProductName') == PRODUCT and 'GitHub' not in vi.get('CompanyName', '') and vi.get('FileDescription') != 'Electron'
    rec('R05', '中の exe（実際に動く方）の version 情報が LiDAR Viewer', 'PASS' if ok else 'FAIL', {k: vi.get(k) for k in ('ProductName', 'FileDescription', 'CompanyName', 'FileVersion', 'OriginalFilename')}, 'A10-003')
    try:
        sys.path.insert(0, PYLIB)
        from PIL import Image
        icos = glob.glob(os.path.join(tmp, 'ico_inner', '*.ico'))
        im = Image.open(icos[0]); big = max(im.ico.sizes())
        h = sha(im.ico.getimage(big).tobytes())
        rec('R06', '中の exe のアイコンが Electron の既定でない', 'FAIL' if h == ELECTRON_ICON_256 else 'PASS', {'sizes': sorted(im.ico.sizes())}, 'A10-003')
        icos = glob.glob(os.path.join(tmp, 'ico_outer', '*.ico'))
        im = Image.open(icos[0])
        rec('R06b', 'portable.exe（外側）のアイコンの大きさ', 'PASS' if (256, 256) in im.ico.sizes() and (16, 16) in im.ico.sizes() else 'FAIL', {'sizes': sorted(im.ico.sizes())})
    except Exception as e:
        rec('R06', 'exe のアイコン', 'FAIL', str(e)[:200])

# ---------------------------------------------------------------- R07-R09 deb
for k in ('deb_amd64', 'deb_arm64'):
    p = ART.get(k)
    if not p: continue
    f = {}
    for line in sh(['dpkg-deb', '-f', p]).stdout.decode('utf-8', 'replace').splitlines():
        m = re.match(r'^([A-Za-z-]+): (.*)$', line)
        if m: f[m.group(1)] = m.group(2)
    rec('R07', f'{k}: Package / Version / Architecture', 'PASS' if f.get('Version') == VER and f.get('Architecture') == ('amd64' if 'amd64' in k else 'arm64') else 'FAIL', {x: f.get(x) for x in ('Package', 'Version', 'Architecture')})
    dep = f.get('Depends', '')
    need = ['libgbm1', 'libasound2', 'libdrm2']
    miss = [n for n in need if n not in dep]
    rec('R07b', f'{k}: Depends に libgbm1・libasound2・libdrm2', 'PASS' if not miss else 'FAIL', {'missing': miss}, 'A10-005')
    bad = []
    if 'localhost' in f.get('Homepage', ''): bad.append('Homepage=' + f.get('Homepage', ''))
    if 'localhost' in f.get('Maintainer', ''): bad.append('Maintainer=' + f.get('Maintainer', ''))
    if f.get('Section') in (None, 'default'): bad.append('Section=' + str(f.get('Section')))
    rec('R07c', f'{k}: 連絡先・分類（Homepage / Maintainer / Section）', 'PASS' if not bad else 'WARN', bad, 'A10-009')
    listing = sh(['dpkg-deb', '-c', p]).stdout.decode('utf-8', 'replace')
    optdirs = sorted(set(re.findall(r'\./opt/([^/\n]+)/', listing)))
    rec('R08', f'{k}: /opt のフォルダ名に空白がない（SUID サンドボックスが空白で壊れる）', 'PASS' if optdirs and all(' ' not in d for d in optdirs) else 'FAIL', optdirs, 'A10-001')
    ctl = os.path.join(tmp, k + '_ctl'); sh(['dpkg-deb', '-e', p, ctl])
    post = open(os.path.join(ctl, 'postinst'), encoding='utf-8', errors='replace').read() if os.path.exists(os.path.join(ctl, 'postinst')) else ''
    aa = 'apparmor' in post.lower()
    rec('R08b', f'{k}: postinst が Ubuntu 23.10+ の AppArmor（userns 制限）に対応', 'PASS' if aa else 'FAIL', 'postinst は root で unshare を試すだけ' if not aa else '', 'A10-001')
    icons = re.findall(r'\./usr/share/icons/hicolor/([^/]+)/apps/([^/\s]+)', listing)
    sizes = sorted(set(s for s, _ in icons))
    # GTK で探せるか
    fs_dir = os.path.join(tmp, k + '_fs'); os.makedirs(fs_dir, exist_ok=True)
    sh(f"dpkg-deb --fsys-tarfile '{p}' | tar -C '{fs_dir}' -x --wildcards './usr/share/*'")
    desk = glob.glob(os.path.join(fs_dir, 'usr/share/applications/*.desktop'))
    dtext = open(desk[0], encoding='utf-8').read() if desk else ''
    icon_name = (re.search(r'^Icon=(.*)$', dtext, re.M) or [None, ''])[1]
    gl = json.loads(sh(['python3', '-I', os.path.join(HERE, 'gtk_icon_lookup.py'), icon_name or 'x', os.path.join(fs_dir, 'usr/share'), '16', '48', '128', '256']).stdout or b'{}')
    found = gl.get('lookup', {}) if 'skip' not in gl else None
    rec('R09', f'{k}: アイコンを GTK（hicolor）で見つけられる', 'PASS' if found and all(found.values()) else ('INFO' if found is None else 'FAIL'), {'installed_sizes': sizes, 'gtk_lookup': found}, 'A10-002')
    dk = dict(re.findall(r'^([A-Za-z\[\]-]+)=(.*)$', dtext, re.M))
    probs = []
    if dk.get('Name') != PRODUCT: probs.append('Name=' + str(dk.get('Name')))
    if dk.get('StartupWMClass') != PRODUCT: probs.append('StartupWMClass=' + str(dk.get('StartupWMClass')))
    if 'MimeType' not in dk: probs.append('MimeType なし（点群ファイルの関連付けなし）')
    rec('R09b', f'{k}: .desktop（Name・StartupWMClass・関連付け）', 'PASS' if not probs else 'WARN', {'problems': probs, 'Exec': dk.get('Exec')}, 'A10-010')
    if re.search(r'PCD ?Viewer|pcd-viewer', dtext + json.dumps(f, ensure_ascii=False), re.I):
        rec('R09c', f'{k}: 旧名の残り（desktop / control）', 'FAIL', '')
    else:
        rec('R09c', f'{k}: 旧名の残り（desktop / control）', 'PASS', '')
    if 'changelog' in listing and '/usr/share/doc/' in listing and 'copyright' not in listing:
        rec('R09d', f'{k}: /usr/share/doc/<pkg>/copyright', 'WARN', 'copyright なし（Debian の決まり）', 'A10-009')

# ---------------------------------------------------------------- R10 AppImage
for k in ('appimage_x64', 'appimage_arm64'):
    p = ART.get(k)
    if not p: continue
    d = open(p, 'rb').read(1 << 20)
    mach = {62: 'x86_64', 183: 'aarch64'}.get(struct.unpack('<H', d[18:20])[0])
    want = 'x86_64' if 'x64' in k else 'aarch64'
    rec('R10', f'{k}: runtime の CPU', 'PASS' if mach == want else 'FAIL', mach)
    fuse2 = b'libfuse.so.2' in d
    nd = re.findall(r'\(NEEDED\)\s+Shared library: \[([^\]]+)\]', sh(['readelf', '-d', p]).stdout.decode())
    unver = [x for x in nd if re.fullmatch(r'lib[^.]+\.so', x)]
    rec('R10g', f'{k}: runtime の NEEDED に version なしの .so（開発用パッケージにしかない名前）がない', 'FAIL' if unver else 'PASS', {'NEEDED': nd}, 'A10-002')
    rec('R10b', f'{k}: runtime が libfuse2 を要しない（Ubuntu 22.04+ の既定で動く）', 'WARN' if fuse2 else 'PASS', 'libfuse.so.2 を dlopen する古い runtime' if fuse2 else '', 'A10-006')
    root = appimage_extract(p, None, os.path.join(tmp, k + '_full'))
    bad = []; n = 0; align_bad = []
    for dp, dn, fn in os.walk(root):
        for x in fn:
            fp = os.path.join(dp, x)
            if os.path.islink(fp): continue
            with open(fp, 'rb') as fh: h = fh.read(20)
            if h[:4] != b'\x7fELF': continue
            n += 1
            m = {62: 'x86_64', 183: 'aarch64'}.get(struct.unpack('<H', h[18:20])[0], '?')
            if m != want: bad.append(os.path.relpath(fp, root) + ':' + m)
            if want == 'aarch64':
                ro = sh(['readelf', '-lW', fp]).stdout.decode()
                al = set(re.findall(r'LOAD .* (0x[0-9a-f]+)\s*$', ro, re.M))
                if any(int(a, 16) < 0x4000 for a in al): align_bad.append(os.path.relpath(fp, root) + ':' + ','.join(al))
    rec('R10c', f'{k}: 中の ELF がすべて {want}', 'PASS' if not bad and n else 'FAIL', {'elf_count': n, 'wrong': bad[:10]})
    if want == 'aarch64':
        rec('R10d', f'{k}: ELF の LOAD の整列が 16K 以上（Raspberry Pi 5 の 16K ページの核）', 'PASS' if not align_bad else 'FAIL', align_bad[:10])
    dt = glob.glob(os.path.join(root, '*.desktop'))
    dtext = open(dt[0], encoding='utf-8').read() if dt else ''
    rec('R10e', f'{k}: AppImage 内の .desktop', 'INFO', re.findall(r'^(?:Name|Exec|Icon|StartupWMClass|X-AppImage-Version)=.*$', dtext, re.M))
    extra = [x for x in os.listdir(root) if x.startswith('clang_')]
    if extra: rec('R10f', f'{k}: 不要なフォルダ', 'INFO', extra, 'A10-016')
    shutil.rmtree(os.path.join(tmp, k + '_full'), ignore_errors=True)

# ---------------------------------------------------------------- R11-R13 mac
for k in ('zip_mac_x64', 'zip_mac_arm64'):
    p = ART.get(k)
    if not p: continue
    dest = os.path.join(tmp, k); os.makedirs(dest, exist_ok=True)
    sh(['unzip', '-q', p, '-d', dest])
    apps = glob.glob(os.path.join(dest, '*.app'))
    if not apps: rec('R11', f'{k}: .app がない', 'FAIL'); continue
    app = apps[0]
    pl = plistlib.load(open(os.path.join(app, 'Contents', 'Info.plist'), 'rb'))
    ok = pl.get('CFBundleName') == PRODUCT and pl.get('CFBundleShortVersionString') == VER and pl.get('CFBundleIdentifier')
    rec('R11', f'{k}: Info.plist の名前・version・ID', 'PASS' if ok else 'FAIL', {x: pl.get(x) for x in ('CFBundleName', 'CFBundleDisplayName', 'CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion', 'LSMinimumSystemVersion', 'NSHumanReadableCopyright')})
    rec('R11b', f'{k}: NSLocalNetworkUsageDescription（macOS 15+ のローカルネットワークの許可の説明）', 'PASS' if pl.get('NSLocalNetworkUsageDescription') else 'FAIL', '', 'A10-004')
    un = [x for x in ('NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSBluetoothAlwaysUsageDescription', 'NSBluetoothPeripheralUsageDescription') if x in pl]
    rec('R11c', f'{k}: 使わない機能の許可の説明文（カメラ・マイク・Bluetooth）', 'WARN' if un else 'PASS', un, 'A10-015')
    rec('R11d', f'{k}: CFBundleDocumentTypes（Finder の関連付け）', 'PASS' if pl.get('CFBundleDocumentTypes') else 'WARN', '' if pl.get('CFBundleDocumentTypes') else 'なし', 'A10-010')
    s = json.loads(sh(['python3', '-I', os.path.join(HERE, 'mac_sig_check.py'), app]).stdout or b'{}')
    rec('R12', f'{k}: ad-hoc 署名の整合（全 Mach-O・CodeResources・記号リンク）', 'PASS' if s.get('ok') else 'FAIL', s.get('problems', [])[:10])
    main = [m for m in s.get('all_macho', []) if m['path'].startswith('Contents/MacOS/')]
    if main:
        m0 = main[0]
        same = m0['uuid'] in ELECTRON_UUIDS.values()
        rec('R12b', f'{k}: 主の実行ファイルの LC_UUID がアプリ固有（Electron の雛形と違う）', 'FAIL' if same else 'PASS', {'cpu': m0['cpu'], 'uuid': m0['uuid'], 'flags': m0['flags']}, 'A10-004')
    if old:
        oz = sorted(glob.glob(os.path.join(old, '*' + k.split('zip_')[1].replace('mac_', 'mac-') + '.zip')))
        if oz and main:
            od = os.path.join(tmp, k + '_old'); os.makedirs(od, exist_ok=True)
            sh(['unzip', '-q', oz[0], '*/Contents/MacOS/*', '-d', od])
            oe = glob.glob(os.path.join(od, '*.app', 'Contents', 'MacOS', '*'))
            if oe:
                sys.path.insert(0, HERE)
                import mac_sig_check as M
                oj = M.check_macho(oe[0], None, None, [])['slices'][0].get('uuid')
                rec('R12c', f'{k}: 前の version と主の実行ファイルの LC_UUID が違う', 'FAIL' if oj == main[0]['uuid'] else 'PASS', {'old': oj, 'new': main[0]['uuid']}, 'A10-004')
    # zip の中の権限・記号リンク
    zl = sh(['zipinfo', p]).stdout.decode('utf-8', 'replace').splitlines()
    links = [l for l in zl if l.startswith('l')]
    rec('R13', f'{k}: zip に記号リンクが記号リンクのまま入っている', 'PASS' if len(links) >= 10 else 'FAIL', {'symlinks': len(links)})
    shutil.rmtree(dest, ignore_errors=True)

# ---------------------------------------------------------------- R14 fuse
fz = []
for k in ('deb_amd64',):
    p = ART.get(k)
    if not p: continue
    exe = os.path.join(tmp, 'linux_main')
    with open(exe, 'wb') as f:
        f.write(sh(f"dpkg-deb --fsys-tarfile '{p}' | tar -xO --wildcards './opt/*/{PKG.get('name', 'lidar-viewer')}'").stdout)
    j = json.loads(sh(['python3', '-I', os.path.join(HERE, 'fuses.py'), exe]).stdout.decode().splitlines()[0])
    os.remove(exe)
    fu = j['wires'][0]['fuses'] if j['wires'] else {}
    bad = [x for x in ('RunAsNode', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments') if fu.get(x) == 'ON'] + \
          [x for x in ('EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar') if fu.get(x) == 'off']
    rec('R14', 'Electron の fuse（RunAsNode などを切り、asar の完全性検査を入れる）', 'WARN' if bad else 'PASS', fu, 'A10-013')

# ---------------------------------------------------------------- R15 大きさの内訳（参考）
rec('R15', '配布物の大きさ（MB）', 'INFO', {k: round(os.path.getsize(v) / 1e6, 1) for k, v in ART.items() if v})

shutil.rmtree(tmp, ignore_errors=True)
with open(os.path.join(out, 'summary.json'), 'w') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
with open(os.path.join(out, 'summary.md'), 'w') as f:
    f.write(f'# 配布物の静的点検（{rel}）\n\n| 番号 | 点検 | 結果 | 報告 | 詳細 |\n|---|---|---|---|---|\n')
    for r in R:
        f.write(f"| {r['id']} | {r['title']} | {r['status']} | {r['ref']} | {r['detail'][:200].replace('|', '/')} |\n")
cnt = {s: sum(1 for r in R if r['status'] == s) for s in ('PASS', 'FAIL', 'WARN', 'INFO')}
print('合計', cnt, '→', os.path.join(out, 'summary.md'))
