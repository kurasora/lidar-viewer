#!/bin/bash
# Chromium の束（brA）が終わってから、Electron と試作ページの試験を順に流す
R=$(cd "$(dirname "$0")" && pwd); W=$(cd "$R/.." && pwd); T=$(cd "$W/../.." && pwd)
while [ ! -e $R/out/brA.rc ]; do sleep 20; done
rm -rf $W/ud-probe
MODE=electron ALL=1 SHOT=$R/out/shots TIMEOUT=1800 MEM=2200 $T/bin/heavy xvfb-run -a -n 120 node $R/browser_probe.js '^(fbx|dae|svg|sec|combo|obj_mtl|obj_tex|gltf_external|shp_pointz|png_rgba|jpg|drc_mesh|ifc4|step_cube_mm|psz_basic|tif_rgb8|tga_pal|vtk51|sample_color_handmade|sample_color_trimesh_mesh_dae)' > $R/out/el1.jsonl 2>&1
echo "electron rc=$?"
MODE=artifact ALL=1 TMPDIR=/tmp/a02tmp SHOT=$R/out/shots TIMEOUT=1800 MEM=2200 $T/bin/heavy node $R/browser_probe.js '^(sec|fbx_vcolor_ascii|dae_zup|svg_wh|drc_mesh|ifc4|step_cube_mm|psz_basic|png_rgba|tif_rgb8|obj_mtl$|gltf_external$|shp_pointz$|dxf_lines|sample_color_handmade_ascii|sample_color_trimesh_mesh_dae)' > $R/out/art1.jsonl 2>&1
echo "artifact rc=$?"
TMPDIR=/tmp/a02tmp SHOT=$R/out/shots TIMEOUT=1800 MEM=2000 $T/bin/heavy node $R/browser_probe.js '^(sample|mesh_|obj_points_only|ifc_big)' > $R/out/brA_b6.jsonl 2>&1
echo "extra rc=$?"
