#!/usr/bin/env python3
# X の最上位の窓の属性を JSON で出す（WM_CLASS・名前・PID・_NET_WM_ICON の大きさ）
#   PYTHONPATH=$W/pylib python3 -I x11_windows.py
import sys, os, json
sys.path.insert(0, os.environ.get('PYTHONPATH', '').split(':')[0])
from Xlib import display, X, Xatom

d = display.Display()
root = d.screen().root
A = lambda n: d.intern_atom(n)
out = []

def walk(w, depth):
    try:
        cls = w.get_wm_class()
        name = w.get_full_property(A('_NET_WM_NAME'), A('UTF8_STRING'))
        pid = w.get_full_property(A('_NET_WM_PID'), Xatom.CARDINAL)
        icon = w.get_full_property(A('_NET_WM_ICON'), Xatom.CARDINAL)
        role = w.get_full_property(A('WM_WINDOW_ROLE'), Xatom.STRING)
        attrs = w.get_attributes()
        if cls or name:
            sizes = []
            if icon:
                v = icon.value; i = 0
                while i + 2 <= len(v):
                    ww, hh = v[i], v[i + 1]; sizes.append(f'{ww}x{hh}'); i += 2 + ww * hh
            out.append({'id': hex(w.id), 'wm_class': list(cls) if cls else None,
                        'name': name.value.decode('utf-8', 'replace') if name else None,
                        'pid': pid.value[0] if pid else None, 'icon_sizes': sizes,
                        'role': role.value.decode() if role else None,
                        'mapped': attrs.map_state == X.IsViewable, 'depth': depth})
    except Exception as e:
        pass
    if depth < 2:
        for c in w.query_tree().children:
            walk(c, depth + 1)

walk(root, 0)
print(json.dumps({'windows': [o for o in out if o['mapped'] or o['wm_class']]}, ensure_ascii=False))
