#!/usr/bin/env bash
# M0 environment probe inside the ROS 2 host (WSL2 Ubuntu 22.04).
set -uo pipefail

echo "=== host ==="
hostname
lsb_release -ds
uname -m
echo "=== workspace mount visibility ==="
ls -d /mnt/d/AAA*/labOS 2>/dev/null || echo "MNT_PATH_MISSING"
echo "=== network egress ==="
for u in "http://packages.ros.org/ros2/ubuntu/dists/jammy/Release" \
         "https://raw.githubusercontent.com/foxglove/ws-protocol/main/docs/spec.md" \
         "https://github.com"; do
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$u" || echo "ERR")
  echo "$u -> $code"
done
echo "=== apt sources ==="
grep -rhv '^#' /etc/apt/sources.list /etc/apt/sources.list.d/ 2>/dev/null | grep -v '^$' | head -8
echo "=== ros present? ==="
if [ -f /opt/ros/humble/setup.bash ]; then echo "ROS_HUMBLE_PRESENT"; else echo "ROS_HUMBLE_ABSENT"; fi
echo "=== ip ==="
ip -4 -o addr show | awk '{print $2, $4}'
echo "=== python ==="
python3 --version
