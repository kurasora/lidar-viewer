#!/bin/bash
# A03 既知の再現（crashers/）を個別に流して、分類（HANG/MEM/英語例外/非有限）を確かめる
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
W=$T/work/A03; C=$W/crashers; F=$W/fuzz
cd $F
emit() { printf '{"id":"chk:%s","file":"%s"%s}\n' "$1" "$2" "$3"; }
JOBS=$W/out/_checks.jsonl
{
  emit float32_overflow      "$C/float32_overflow.xyz" ''
  emit off_truncated         "$C/off_truncated.off" ''
  emit off_nv_1e9            "$C/off_nv_1e9.off" ''
  emit vtk_points_1e9        "$C/vtk_points_1e9.vtk" ''
  emit vtk_fill_3e8          "$C/vtk_fill_3e8.vtk" ''
  emit pgm_mid_20k           "$C/pgm_mid_20k.pgm" ''
  emit dxf_self_insert       "$C/dxf_self_insert.dxf" ''
  emit dxf_mutual_insert     "$C/dxf_mutual_insert.dxf" ''
  emit pdms_deep_new         "$C/pdms_deep_new.pdms" ''
  emit ply_binary_truncated  "$C/ply_binary_truncated.ply" ''
} > $JOBS
node runner.mjs $JOBS $W/out/checks.jsonl --timeout=20000 --mem=450
