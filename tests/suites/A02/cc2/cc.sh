#!/bin/bash
# CloudCompare（2.11.3）で各ファイルを開き、メッシュは表面から点を取り（SAMPLE_MESH）、点群と一緒に ASCII で保存する
cd "$(dirname "$0")"
for f in angle.mac basic.mac orient.mac metre.mac paperspace.dxf ocs.dxf curves.dxf bulge.dxf insert.dxf polymesh.dxf minsert.dxf layer0.dxf truecolor.dxf nested1.psz nested2.psz basic.psz color_magics.stl vc01.obj; do
  echo "=== $f"
  QT_QPA_PLATFORM=offscreen timeout 100 CloudCompare -SILENT -NO_TIMESTAMP -AUTO_SAVE OFF -O $f -SAMPLE_MESH POINTS 20000 -C_EXPORT_FMT ASC -PREC 6 -SAVE_CLOUDS 2>&1 | grep -v -i "qt\.\|QSocket\|libEGL\|MESA\|dri\|XDG" | tail -6
  QT_QPA_PLATFORM=offscreen timeout 100 CloudCompare -SILENT -NO_TIMESTAMP -AUTO_SAVE OFF -O $f -C_EXPORT_FMT ASC -PREC 6 -SAVE_CLOUDS 2>&1 | grep -i "error\|found\|saved\|cloud" | tail -4
done
ls -la
