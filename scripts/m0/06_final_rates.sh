#!/usr/bin/env bash
# ROS-side rate truth for the final M0 run (client-independent).
set -o pipefail
source /opt/ros/humble/setup.bash
for t in /imu/data /livox/lidar /odom /tf /scan /camera/color/image_raw; do
  printf '%-28s ' "$t"
  timeout 10 ros2 topic hz "$t" 2>/dev/null | grep -m1 'average rate' || echo "no samples"
done
echo "=== sensor node counters (published totals) ==="
tail -3 /tmp/labscope_m0/sensors.log
