#!/bin/bash
# A02（メッシュ・CAD・画像の形式）の再試験をまとめて流す
#   使い方: bash run.sh [段階...]
#     段階: gen（試験ファイルを作り直す） node browser electron artifact cc（CloudCompare との比較） perf（大きなファイル） all（既定: gen node browser electron artifact）
#   結果: out/run_<日時>/ に *.jsonl と summary.md（試験ごとの合否表。known.json に載った既知の問題と照合）
#   ※ 実行はすべて見張り付きの入口（$T/bin/light・heavy・bigmem）を通す。Chromium の一時フォルダは短い名前が必要（/tmp/a02tmp → $W/tmp）
set -u
R=$(cd "$(dirname "$0")" && pwd); W=$(cd "$R/.." && pwd); T=$(cd "$W/../.." && pwd)
stamp=$(date +%Y%m%d_%H%M%S); O=$R/out/run_$stamp; mkdir -p "$O" "$W/tmp"
ln -sfn "$W/tmp" /tmp/a02tmp
steps=("$@"); [ ${#steps[@]} -eq 0 ] && steps=(gen node browser electron artifact)
has() { for s in "${steps[@]}"; do [ "$s" = "$1" ] || [ "$s" = all ] && return 0; done; return 1; }
if has gen; then
  echo "[gen] 試験ファイルと期待値を作る"
  (cd "$R/gen" && MEM=1500 $T/bin/light python3 gen_all.py) > "$O/gen.log" 2>&1; tail -1 "$O/gen.log"
fi
if has node; then
  echo "[node] 読み込み部品を Node で直接"
  MEM=1500 TIMEOUT=900 $T/bin/light node --no-warnings "$R/node_probe.mjs" > "$O/node.jsonl" 2>&1; tail -1 "$O/node.jsonl"
fi
if has browser; then
  echo "[browser] Chromium（dist/index.html）"
  i=0
  for f in '^(obj|stl|off|vtk|mesh)' '^(gltf|glb|drc|ifc|step|psz)' '^(dxf|shp|pdms|vendor|combo|sec)' '^(png|jpg|bmp|gif|webp|tga|ppm|pgm|pbm|ico|xbm|xpm|wbmp|svg)' '^(tif|fbx|dae|sample)'; do
    i=$((i+1))
    TMPDIR=/tmp/a02tmp SHOT=$O/shots TIMEOUT=1800 MEM=2000 $T/bin/heavy node "$R/browser_probe.js" "$f" > "$O/browser_$i.jsonl" 2>&1; tail -1 "$O/browser_$i.jsonl"
  done
fi
if has electron; then
  echo "[electron] アプリ本体（FBX・DAE・SVG・付属ファイルの組・代表の形式）"
  rm -rf "$W/ud-probe"
  MODE=electron ALL=1 SHOT=$O/shots TIMEOUT=1800 MEM=2200 $T/bin/heavy xvfb-run -a -n 120 node "$R/browser_probe.js" '^(fbx|dae|svg|sec|combo|obj_mtl|obj_tex|gltf_external|shp_pointz|png_rgba|jpg|drc_mesh|ifc4|step_cube_mm|psz_basic|tif_rgb8|tga_pal|vtk51|sample_color_handmade|sample_color_trimesh_mesh_dae)' > "$O/electron.jsonl" 2>&1; tail -1 "$O/electron.jsonl"
fi
if has artifact; then
  echo "[artifact] 試作ページ（dist-artifact/pcd-viewer.html）"
  MODE=artifact ALL=1 TMPDIR=/tmp/a02tmp SHOT=$O/shots TIMEOUT=1800 MEM=2200 $T/bin/heavy node "$R/browser_probe.js" '^(sec|fbx_vcolor_ascii|dae_zup|svg_wh|drc_mesh|ifc4|step_cube_mm|psz_basic|png_rgba|tif_rgb8|obj_mtl$|gltf_external$|shp_pointz$|dxf_lines|sample_color_handmade_ascii|sample_color_trimesh_mesh_dae)' > "$O/artifact.jsonl" 2>&1; tail -1 "$O/artifact.jsonl"
fi
if has cc; then
  echo "[cc] CloudCompare 2.11.3 との比較（cc1: OBJ/STL/OFF/VTK、cc2: DXF/PDMS/PSZ）"
  for c in cc1 cc2; do TIMEOUT=1500 $T/bin/heavy xvfb-run -a -n 120 "$W/$c/cc.sh" > "$O/$c.log" 2>&1; done
fi
if has perf; then
  echo "[perf] 大きなファイル（data/big。gen_big.py で作る）"
  (cd "$R/gen" && MEM=1800 TIMEOUT=900 $T/bin/light python3 gen_big.py stl obj dxf ppm png fbx bomb) > "$O/genbig.log" 2>&1
  TMPDIR=/tmp/a02tmp MEM=4500 TIMEOUT=1800 $T/bin/bigmem node "$R/perf_probe.js" > "$O/perf.jsonl" 2>&1; tail -3 "$O/perf.jsonl"
fi
python3 "$R/summarize.py" "$O" --md "$O/summary.md" | tail -40
echo "結果: $O"
