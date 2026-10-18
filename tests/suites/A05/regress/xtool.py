#!/usr/bin/env python3
# X の画面（xvfb）を外から操作する小道具（ネイティブのファイル選択ダイアログの確認用）
#   PYTHONPATH=$W/pylib python3 xtool.py windows | click X Y | key Escape | type 文字 | shot 出力.png
import sys, os, subprocess
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pylib'))
from Xlib import display, X, XK
from Xlib.ext import xtest

d = display.Display()
root = d.screen().root

def windows():
    out = []
    def walk(w, depth):
        try:
            g = w.get_geometry(); a = w.get_attributes()
            name = w.get_wm_name()
            if a.map_state == X.IsViewable and g.width > 50 and g.height > 50:
                t = w.translate_coords(root, 0, 0)
                out.append((name, -t.x, -t.y, g.width, g.height, depth))
            for c in w.query_tree().children: walk(c, depth + 1)
        except Exception:
            pass
    for c in root.query_tree().children: walk(c, 1)
    return out

def click(x, y, btn=1):
    xtest.fake_input(d, X.MotionNotify, x=int(x), y=int(y)); d.sync()
    xtest.fake_input(d, X.ButtonPress, btn); d.sync()
    xtest.fake_input(d, X.ButtonRelease, btn); d.sync()

def key(name):
    ks = XK.string_to_keysym(name)
    kc = d.keysym_to_keycode(ks)
    xtest.fake_input(d, X.KeyPress, kc); d.sync()
    xtest.fake_input(d, X.KeyRelease, kc); d.sync()

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'windows':
        for w in windows(): print(w)
    elif cmd == 'click': click(sys.argv[2], sys.argv[3])
    elif cmd == 'key': key(sys.argv[2])
    elif cmd == 'shot': subprocess.run(['import', '-window', 'root', sys.argv[2]], check=True)
