#!/bin/bash
# CloudCompare で各ファイルを開き、メッシュを PLY（ASCII）で保存する
cd "$(dirname "$0")"
for f in vc255.obj vc_over1.obj concave.obj cont.obj m2.obj t.obj bin_trailing.stl ascii_upper.stl color_viscam.stl coff255.off noff.off cnoff.off v51_ascii.vtk v51_binary.vtk celldata_few.vtk; do
  echo "=== $f"
  QT_QPA_PLATFORM=offscreen timeout 120 CloudCompare -SILENT -NO_TIMESTAMP -O $f -M_EXPORT_FMT PLY -PLY_EXPORT_FMT ASCII -SAVE_MESHES 2>&1 | grep -v -i "qt\.\|QSocket\|libEGL\|MESA\|dri" | tail -5
done
ls -la
