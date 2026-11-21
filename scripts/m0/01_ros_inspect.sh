#!/usr/bin/env bash
# Inspect the pre-existing ROS 2 Humble installation and bridge availability.
# NOTE: never use `set -u` here; ROS 2 setup.bash references unset vars.
set -o pipefail
source /opt/ros/humble/setup.bash

echo "=== ros distro ==="
echo "ROS_DISTRO=$ROS_DISTRO"
ros2 --version 2>/dev/null || true
echo "=== foxglove_bridge installed? ==="
if ros2 pkg prefix foxglove_bridge >/dev/null 2>&1; then
  echo "FOXGLOVE_BRIDGE_PRESENT at $(ros2 pkg prefix foxglove_bridge)"
  dpkg -l | grep -E 'ros-humble-foxglove-bridge' || true
  ls "$(ros2 pkg prefix foxglove_bridge)/lib/foxglove_bridge" 2>/dev/null || true
else
  echo "FOXGLOVE_BRIDGE_ABSENT"
fi
echo "=== key message packages ==="
for p in sensor_msgs std_msgs geometry_msgs nav_msgs visualization_msgs rosgraph_msgs tf2_msgs builtin_interfaces action_msgs unique_identifier_msgs diagnostic_msgs; do
  if ros2 pkg prefix "$p" >/dev/null 2>&1; then echo "OK   $p"; else echo "MISS $p"; fi
done
echo "=== python ros libs ==="
python3 -c "import rclpy, sensor_msgs; print('rclpy OK')" 2>&1 | tail -2
echo "=== ros2 pkg count ==="
ros2 pkg list 2>/dev/null | wc -l
echo "=== rviz/demo available? ==="
ros2 pkg list 2>/dev/null | grep -E 'demo_nodes|rviz|rosbag2|foxglove' | head -20
