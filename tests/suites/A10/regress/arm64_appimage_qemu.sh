#!/bin/bash
# arm64 の AppImage の runtime（先頭の ELF）を qemu-user で動かし、arm64 の Linux で起動の入口が通るかを見る
#   light bash arm64_appimage_qemu.sh <arm64.AppImage>...
# 道具（全体の環境は変えず $W/tools に展開）:
#   apt-get download qemu-user-static libc6-arm64-cross → dpkg-deb -x で $W/tools/qemu・$W/tools/sysroot/lib へ
# 調べること: runtime の NEEDED に「libz.so」（版なし。Debian/Ubuntu/Raspberry Pi OS では開発用の zlib1g-dev にしかない）があり、
#             普通の arm64 の環境では「libz.so: cannot open shared object file」で起動できないこと
set -u
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv
W=${W:-$T/work/A10}
Q=$W/tools/qemu/usr/bin/qemu-aarch64-static
SYS=$W/tools/sysroot
if [ ! -x "$Q" ] || [ ! -e "$SYS/lib/ld-linux-aarch64.so.1" ]; then
  mkdir -p "$W/tools/dl" && (cd "$W/tools/dl" && apt-get download qemu-user-static libc6-arm64-cross >/dev/null 2>&1)
  mkdir -p "$W/tools/qemu" "$W/tools/xroot" "$SYS/lib"
  dpkg-deb -x "$W"/tools/dl/qemu-user-static_*.deb "$W/tools/qemu"
  dpkg-deb -x "$W"/tools/dl/libc6-arm64-cross_*.deb "$W/tools/xroot"
  cp -a "$W/tools/xroot/usr/aarch64-linux-gnu/lib/." "$SYS/lib/"
fi
OUT=$W/run/arm64_qemu; rm -rf "$OUT"; mkdir -p "$OUT"
rm -f "$SYS/lib/libz.so"
for f in "$@"; do
  b=$(basename "$f")
  echo "== $b: NEEDED = $(readelf -d "$f" | grep NEEDED | grep -o '\[[^]]*\]' | tr '\n' ' ')"
  echo "-- 1) arm64 の glibc だけ（libz.so なし＝zlib1g-dev を入れていない普通の環境）"
  (cd "$OUT" && timeout 60 "$Q" -L "$SYS" "$f" --appimage-version; echo "rc=$?") 2>&1 | tail -3
done
# 2) libz.so という名前の arm64 の共有ライブラリを置く（読み込みの段階を通るかだけを見る。中身は libdl の写しなので zlib の関数はない）
#    ※ runtime は zlib の uncompress を使う（動的記号にある）。本物の arm64 の zlib を ARM64_SO=<libz.so.1 のパス> で渡すと 3) の展開まで通るはず
cp "${ARM64_SO:-$SYS/lib/libdl.so.2}" "$SYS/lib/libz.so"
for f in "$@"; do
  b=$(basename "$f")
  echo "-- 2) $b: libz.so を置いた後（zlib1g-dev を入れた環境に相当）"
  (cd "$OUT" && timeout 60 "$Q" -L "$SYS" "$f" --appimage-version; echo "rc=$?") 2>&1 | tail -3
  echo "-- 3) $b: 自分の中身を取り出せるか（squashfs の展開。代用の libz.so では uncompress が見つからず失敗するのが正しい）"
  rm -rf "$OUT/squashfs-root"
  (cd "$OUT" && timeout 120 "$Q" -L "$SYS" "$f" --appimage-extract '*.desktop' 2>&1 | tail -2; ls squashfs-root 2>/dev/null; head -3 squashfs-root/*.desktop 2>/dev/null)
done
rm -f "$SYS/lib/libz.so"; rm -rf "$OUT/squashfs-root"
