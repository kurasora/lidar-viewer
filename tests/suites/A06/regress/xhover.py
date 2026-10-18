#!/usr/bin/env python3
# 本物のマウス・キーボード（XTest）と X の窓一覧。DISPLAY は環境変数から
#   python3 xhover.py move X Y         … ポインタを動かす（本物の X のイベント。Chromium の吹き出しはこれで出る）
#   python3 xhover.py click X Y [BTN]  … 動かしてクリック
#   python3 xhover.py key KEYSYM       … キーを押して離す（例 Escape）
#   python3 xhover.py windows          … 表示中の最上位の窓の一覧（JSON。override_redirect の窓 = 吹き出し・ポップアップ）
#   python3 xhover.py shot FILE        … 画面全体（root）の写真（ImageMagick の import）
import ctypes, ctypes.util, json, subprocess, sys, time

X = ctypes.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6')
XT = ctypes.CDLL(ctypes.util.find_library('Xtst') or 'libXtst.so.6')
Window = ctypes.c_ulong


class XWindowAttributes(ctypes.Structure):
    _fields_ = [('x', ctypes.c_int), ('y', ctypes.c_int), ('width', ctypes.c_int), ('height', ctypes.c_int),
                ('border_width', ctypes.c_int), ('depth', ctypes.c_int), ('visual', ctypes.c_void_p), ('root', Window),
                ('class_', ctypes.c_int), ('bit_gravity', ctypes.c_int), ('win_gravity', ctypes.c_int), ('backing_store', ctypes.c_int),
                ('backing_planes', ctypes.c_ulong), ('backing_pixel', ctypes.c_ulong), ('save_under', ctypes.c_int),
                ('colormap', ctypes.c_ulong), ('map_installed', ctypes.c_int), ('map_state', ctypes.c_int),
                ('all_event_masks', ctypes.c_long), ('your_event_mask', ctypes.c_long), ('do_not_propagate_mask', ctypes.c_long),
                ('override_redirect', ctypes.c_int), ('screen', ctypes.c_void_p)]


X.XOpenDisplay.restype = ctypes.c_void_p
X.XOpenDisplay.argtypes = [ctypes.c_char_p]
X.XDefaultRootWindow.restype = Window
X.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
X.XQueryTree.argtypes = [ctypes.c_void_p, Window, ctypes.POINTER(Window), ctypes.POINTER(Window), ctypes.POINTER(ctypes.POINTER(Window)), ctypes.POINTER(ctypes.c_uint)]
X.XGetWindowAttributes.argtypes = [ctypes.c_void_p, Window, ctypes.POINTER(XWindowAttributes)]
X.XFetchName.argtypes = [ctypes.c_void_p, Window, ctypes.POINTER(ctypes.c_char_p)]
X.XFlush.argtypes = [ctypes.c_void_p]
X.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
X.XStringToKeysym.restype = ctypes.c_ulong
X.XStringToKeysym.argtypes = [ctypes.c_char_p]
X.XKeysymToKeycode.restype = ctypes.c_ubyte
X.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
X.XCloseDisplay.argtypes = [ctypes.c_void_p]
X.XFree.argtypes = [ctypes.c_void_p]
XT.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
XT.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
XT.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]

d = X.XOpenDisplay(None)
if not d:
    print('DISPLAY を開けません', file=sys.stderr); sys.exit(2)
cmd = sys.argv[1]
if cmd == 'move':
    XT.XTestFakeMotionEvent(d, -1, int(sys.argv[2]), int(sys.argv[3]), 0); X.XSync(d, 0)
elif cmd == 'click':
    btn = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    XT.XTestFakeMotionEvent(d, -1, int(sys.argv[2]), int(sys.argv[3]), 0); X.XSync(d, 0); time.sleep(0.05)
    XT.XTestFakeButtonEvent(d, btn, 1, 0); X.XSync(d, 0); time.sleep(0.05)
    XT.XTestFakeButtonEvent(d, btn, 0, 0); X.XSync(d, 0)
elif cmd == 'key':
    kc = X.XKeysymToKeycode(d, X.XStringToKeysym(sys.argv[2].encode()))
    XT.XTestFakeKeyEvent(d, kc, 1, 0); X.XSync(d, 0); time.sleep(0.03)
    XT.XTestFakeKeyEvent(d, kc, 0, 0); X.XSync(d, 0)
elif cmd == 'windows':
    root = X.XDefaultRootWindow(d)
    r, p, ch, n = Window(), Window(), ctypes.POINTER(Window)(), ctypes.c_uint()
    X.XQueryTree(d, root, ctypes.byref(r), ctypes.byref(p), ctypes.byref(ch), ctypes.byref(n))
    out = []
    for i in range(n.value):
        w = ch[i]; a = XWindowAttributes()
        if not X.XGetWindowAttributes(d, w, ctypes.byref(a)): continue
        if a.map_state != 2: continue  # IsViewable のみ
        nm = ctypes.c_char_p()
        X.XFetchName(d, w, ctypes.byref(nm))
        out.append({'id': hex(w), 'x': a.x, 'y': a.y, 'w': a.width, 'h': a.height, 'override': bool(a.override_redirect), 'name': (nm.value or b'').decode('utf8', 'replace')})
    if n.value: X.XFree(ch)
    print(json.dumps(out, ensure_ascii=False))
elif cmd == 'icon':
    # 窓のアイコン（_NET_WM_ICON）を PNG に書き出す: icon <窓の名前の一部> <出力.png>
    X.XInternAtom.restype = ctypes.c_ulong
    X.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
    X.XGetWindowProperty.argtypes = [ctypes.c_void_p, Window, ctypes.c_ulong, ctypes.c_long, ctypes.c_long, ctypes.c_int, ctypes.c_ulong,
                                     ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_void_p)]
    atom = X.XInternAtom(d, b'_NET_WM_ICON', 0)
    root = X.XDefaultRootWindow(d)
    r, p, ch, n = Window(), Window(), ctypes.POINTER(Window)(), ctypes.c_uint()
    X.XQueryTree(d, root, ctypes.byref(r), ctypes.byref(p), ctypes.byref(ch), ctypes.byref(n))
    res = []
    for i in range(n.value):
        w = ch[i]; nm = ctypes.c_char_p(); X.XFetchName(d, w, ctypes.byref(nm))
        name = (nm.value or b'').decode('utf8', 'replace')
        if sys.argv[2] not in name: continue
        at, fmt, nitems, after, prop = ctypes.c_ulong(), ctypes.c_int(), ctypes.c_ulong(), ctypes.c_ulong(), ctypes.c_void_p()
        X.XGetWindowProperty(d, w, atom, 0, 1 << 24, 0, 0, ctypes.byref(at), ctypes.byref(fmt), ctypes.byref(nitems), ctypes.byref(after), ctypes.byref(prop))
        if not prop.value or not nitems.value: res.append({'name': name, 'icons': []}); continue
        arr = ctypes.cast(prop, ctypes.POINTER(ctypes.c_ulong))
        vals = [arr[k] & 0xffffffff for k in range(nitems.value)]
        icons, k = [], 0
        while k + 2 <= len(vals):
            iw, ih = vals[k], vals[k + 1]; px = vals[k + 2: k + 2 + iw * ih]; icons.append((iw, ih, px)); k += 2 + iw * ih
        from PIL import Image
        best = max(icons, key=lambda t: t[0] * t[1])
        im = Image.new('RGBA', (best[0], best[1]))
        im.putdata([((v >> 16) & 255, (v >> 8) & 255, v & 255, (v >> 24) & 255) for v in best[2]])
        im.save(sys.argv[3])
        res.append({'name': name, 'icons': [(a, b) for a, b, _ in icons], 'saved': sys.argv[3]})
    print(json.dumps(res, ensure_ascii=False))
elif cmd == 'shot':
    X.XCloseDisplay(d); d = None
    subprocess.run(['import', '-window', 'root', sys.argv[2]], check=True)
if d: X.XCloseDisplay(d)
