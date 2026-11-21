#!/usr/bin/env bash
# Measure publish rates from the ROS 2 graph (independent of the Windows client).
set -o pipefail
source /opt/ros/humble/setup.bash

echo "=== ros2 topic hz (ROS-side truth) ==="
for t in /imu/data /livox/lidar /camera/color/image_raw /odom /tf /scan; do
  printf '%-28s ' "$t"
  timeout 8 ros2 topic hz "$t" 2>/dev/null | grep -m1 'average rate' || echo "no samples"
done

echo "=== ros2 topic info ==="
ros2 topic list -t 2>/dev/null | sort

echo "=== sensors node log tail ==="
tail -5 /tmp/labscope_m0/sensors.log 2>/dev/null
