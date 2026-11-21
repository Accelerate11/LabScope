#!/usr/bin/env bash
# Stage the M0 robot-side scripts INSIDE the WSL filesystem.
#
# Rationale: the first M0 run executed python/ros2 nodes directly from /mnt/d
# (the Windows 9p mount). After ~20 minutes of high-rate publishing the VM
# wedged (HCS_E_CONNECTION_TIMEOUT) and could not be terminated without admin
# rights. Running from the ext4 root filesystem removes that variable and is
# also what a real robot does (everything is local disk).
set -o pipefail

SRC=/mnt/d/AAA大肥鱼/labOS/scripts/m0/ros2
DST=/root/labscope/ros2

mkdir -p "$DST"
cp -f "$SRC/sensors_demo.py" "$DST/sensors_demo.py"
cp -f "$SRC/start_stack.sh" "$DST/start_stack.sh"
cp -f "$SRC/stop_stack.sh" "$DST/stop_stack.sh"
chmod +x "$DST"/*.sh

echo "staged into $DST"
ls -la "$DST"
python3 -c "import ast,sys; ast.parse(open('$DST/sensors_demo.py').read()); print('syntax OK')"
