#!/usr/bin/env python3
# GTK3 の icon theme で、アイコン名が見つかるかを調べる（GNOME のメニュー・ドックと同じ探し方）
#   python3 -I gtk_icon_lookup.py <アイコン名> <追加の share フォルダ（usr/share）> [大きさ...]
# 例: python3 -I gtk_icon_lookup.py lidar-viewer ex/deb_amd64/usr/share 16 48 256
# GTK が入っていない環境では "skip" を出して終わる
import ctypes, ctypes.util, sys, os, json

name = sys.argv[1]
share = os.path.abspath(sys.argv[2])
sizes = [int(x) for x in sys.argv[3:]] or [16, 24, 32, 48, 64, 128, 256]
lib = ctypes.util.find_library('gtk-3') or 'libgtk-3.so.0'
try:
    gtk = ctypes.CDLL(lib)
    glib = ctypes.CDLL(ctypes.util.find_library('glib-2.0') or 'libglib-2.0.so.0')
    gobj = ctypes.CDLL(ctypes.util.find_library('gobject-2.0') or 'libgobject-2.0.so.0')
except OSError as e:
    print(json.dumps({'skip': str(e)}))
    sys.exit(0)

gtk.gtk_icon_theme_new.restype = ctypes.c_void_p
gtk.gtk_icon_theme_set_search_path.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_char_p), ctypes.c_int]
gtk.gtk_icon_theme_set_custom_theme.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
gtk.gtk_icon_theme_lookup_icon.restype = ctypes.c_void_p
gtk.gtk_icon_theme_lookup_icon.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int, ctypes.c_int]
gtk.gtk_icon_info_get_filename.restype = ctypes.c_char_p
gtk.gtk_icon_info_get_filename.argtypes = [ctypes.c_void_p]
gtk.gtk_icon_theme_has_icon.argtypes = [ctypes.c_void_p, ctypes.c_char_p]

theme = gtk.gtk_icon_theme_new()
# 探す場所: 追加の share/icons、システムの /usr/share/icons（hicolor の index.theme はここ）、pixmaps
paths = [os.path.join(share, 'icons').encode(), b'/usr/share/icons', os.path.join(share, 'pixmaps').encode(), b'/usr/share/pixmaps']
arr = (ctypes.c_char_p * len(paths))(*paths)
gtk.gtk_icon_theme_set_search_path(theme, arr, len(paths))
gtk.gtk_icon_theme_set_custom_theme(theme, b'hicolor')
out = {'name': name, 'share': share, 'has_icon': bool(gtk.gtk_icon_theme_has_icon(theme, name.encode())), 'lookup': {}}
for s in sizes:
    info = gtk.gtk_icon_theme_lookup_icon(theme, name.encode(), s, 0)
    out['lookup'][s] = gtk.gtk_icon_info_get_filename(info).decode() if info else None
# 実際に置かれているファイル
found = []
for root, dirs, files in os.walk(os.path.join(share, 'icons')):
    for f in files:
        if f.startswith(name + '.'):
            found.append(os.path.relpath(os.path.join(root, f), share))
out['files_in_package'] = sorted(found)
print(json.dumps(out, ensure_ascii=False))
