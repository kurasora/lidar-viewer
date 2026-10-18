#!/bin/bash
# Linux 版（deb の /opt/LiDAR Viewer と同じ置き方）を、一般ユーザーで「サンドボックスあり」で起動できるかを調べる
#   ・deb の postinst は root で「unshare --user true」が通るかで chrome-sandbox を 4755 / 0755 に決める
#   ・Ubuntu 23.10 以降（24.04 = ROS2 Jazzy の標準）は AppArmor で一般ユーザーの user 名前空間が制限される
#     → root では通るので 0755 になる → 一般ユーザーでは名前空間サンドボックスも SUID サンドボックスも使えない
#   ・さらに置き場所に空白があると、SUID サンドボックスの起動（PrependWrapper）が空白で切れる
# 使い方（root で。heavy と xvfb-run の中から）:
#   heavy xvfb-run -a -n 200 -s "-ac -screen 0 1280x800x24" bash linux_sandbox_test.sh <展開済みフォルダ> <作業フォルダ>
# 出力: 作業フォルダ/sbx_result.txt と各ケースのログ
set -u
SRC=${1:?unpacked dir}; OUT=${2:?out dir}; APPIMG=${3:-}
NOUSERNS=$(dirname "$0")/../bin/nouserns
[ -x "$NOUSERNS" ] || gcc -O2 -o "$NOUSERNS" "$(dirname "$0")/nouserns.c"
NOUSERNS=$(readlink -f "$NOUSERNS")
UID_=$(id -u claude 2>/dev/null || echo 999); GID_=$(id -g claude 2>/dev/null || echo 999)
SB=$OUT/sbx; mkdir -p "$SB/opt"
EXE=$(basename "$(ls "$SRC"/lidar-viewer "$SRC"/pcd-viewer 2>/dev/null | head -1)")
if [ ! -d "$SB/opt/LiDAR Viewer" ] && [ ! -d "$SB/opt/LiDARViewer" ]; then cp -a "$SRC" "$SB/opt/LiDAR Viewer"; fi
if [ -n "$APPIMG" ] && [ ! -d "$SB/opt/appimg" ]; then cp -a "$APPIMG" "$SB/opt/appimg"; chmod -R a+rX "$SB/opt/appimg"; fi
[ -d "$SB/opt/LiDARViewer" ] && mv "$SB/opt/LiDARViewer" "$SB/opt/LiDAR Viewer"
mkdir -p "$SB/opt/home" && chown "$UID_:$GID_" "$SB/opt/home" && chmod 755 "$SB/opt" "$SB/opt/home"
RES=$OUT/sbx_result.txt; : > "$RES"
echo "postinst の判定（root で実行）: $( if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then echo 4755; else echo 0755; fi )" | tee -a "$RES"

export SB EXE NOUSERNS UID_ GID_ RES OUT APPIMG
unshare -m --propagation private bash -c '
mount --bind "$SB/opt" /opt || { echo "bind 失敗"; exit 1; }
run_case() { # 名前 フォルダ名 sandboxモード userns(block/allow) 追加引数
  local name=$1 dir=$2 mode=$3 ns=$4; shift 4
  cur=$(ls /opt | grep -E "^LiDAR ?Viewer$" | head -1)
  [ "$cur" != "$dir" ] && mv "/opt/$cur" "/opt/$dir"
  chown root:root "/opt/$dir/chrome-sandbox"; chmod "$mode" "/opt/$dir/chrome-sandbox"
  rm -rf /opt/home/ud; mkdir -p /opt/home/ud; chown -R "$UID_:$GID_" /opt/home
  local log="$OUT/sbx_$name.log"
  local flag=""; [ "$ns" = allow ] && flag=--allow-userns
  setsid "$NOUSERNS" "$UID_" "$GID_" $flag -- env -i HOME=/opt/home DISPLAY="$DISPLAY" PCDV_USERDATA=/opt/home/ud PATH=/usr/bin:/bin "/opt/$dir/$EXE" "$@" > "$log" 2>&1 &
  local pid=$!
  sleep 14
  local alive=no; kill -0 $pid 2>/dev/null && alive=yes
  local procs=$(ps -o args= -s $pid 2>/dev/null | grep -o -- "--type=[a-z-]*" | sort | uniq -c | tr "\n" " ")
  local rpid=$(pgrep -g $pid -f -- "--type=renderer" | head -1)
  local rinfo=""
  if [ -n "$rpid" ]; then rinfo="renderer: Seccomp=$(awk "/^Seccomp:/{print \$2}" /proc/$rpid/status) NSpid=$(awk "/^NSpid:/{print \$2,\$3}" /proc/$rpid/status) uid=$(awk "/^Uid:/{print \$2}" /proc/$rpid/status)"; fi
  local fatal=$(grep -m2 -E "FATAL|failed to execvp|No usable sandbox|not configured correctly|Running as root" "$log" | cut -c1-220 | tr "\n" " ")
  printf "%-28s dir=%-13s sandbox=%s userns=%-5s alive=%s procs=[%s] %s | %s\n" "$name" "\"$dir\"" "$mode" "$ns" "$alive" "$procs" "$rinfo" "$fatal" | tee -a "$RES"
  kill -TERM -- -$pid 2>/dev/null; sleep 1; kill -KILL -- -$pid 2>/dev/null; wait $pid 2>/dev/null
}
run_case A_space_0755_userns_ok   "LiDAR Viewer" 0755 allow
run_case B_space_0755_userns_ng   "LiDAR Viewer" 0755 block
run_case C_space_4755_userns_ng   "LiDAR Viewer" 4755 block
run_case D_nospace_4755_userns_ng "LiDARViewer"  4755 block
run_case E_space_0755_no_sandbox  "LiDAR Viewer" 0755 block --no-sandbox
run_case F_space_4755_disable_ns  "LiDAR Viewer" 4755 allow --disable-namespace-sandbox
if [ -n "$APPIMG" ]; then
  # AppImage（ダブルクリックと同じく AppRun を引数なしで。chrome-sandbox は SUID にできない）
  run_ai() { local name=$1 ns=$2; shift 2; local log="$OUT/sbx_$name.log"; local flag=""; [ "$ns" = allow ] && flag=--allow-userns
    rm -rf /opt/home/ud; mkdir -p /opt/home/ud; chown -R "$UID_:$GID_" /opt/home
    setsid "$NOUSERNS" "$UID_" "$GID_" $flag -- env -i HOME=/opt/home DISPLAY="$DISPLAY" PCDV_USERDATA=/opt/home/ud PATH=/usr/bin:/bin /opt/appimg/AppRun "$@" > "$log" 2>&1 &
    local pid=$!; sleep 14; local alive=no; kill -0 $pid 2>/dev/null && alive=yes
    local procs=$(ps -o args= -s $pid 2>/dev/null | grep -o -- "--type=[a-z-]*" | sort | uniq -c | tr "\n" " ")
    local fatal=$(grep -m2 -E "FATAL|failed to execvp|No usable sandbox|not configured correctly" "$log" | cut -c1-220 | tr "\n" " ")
    printf "%-28s AppRun userns=%-5s args=[%s] alive=%s procs=[%s] | %s\n" "$name" "$ns" "$*" "$alive" "$procs" "$fatal" | tee -a "$RES"
    kill -TERM -- -$pid 2>/dev/null; sleep 1; kill -KILL -- -$pid 2>/dev/null; wait $pid 2>/dev/null; }
  run_ai G_appimage_userns_ok   allow
  run_ai H_appimage_userns_ng   block
  run_ai I_appimage_ng_nosandbox block --no-sandbox
fi
cur=$(ls /opt | grep -E "^LiDAR ?Viewer$" | head -1); [ "$cur" != "LiDAR Viewer" ] && mv "/opt/$cur" "/opt/LiDAR Viewer"
'
echo "結果: $RES"
