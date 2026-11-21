#!/usr/bin/env bash
# Install foxglove_bridge for ROS 2 Humble. Run as root (wsl -u root).
set -o pipefail
export DEBIAN_FRONTEND=noninteractive

if [ "$(id -u)" != "0" ]; then echo "MUST_RUN_AS_ROOT"; exit 3; fi

echo "=== apt-get update ==="
apt-get update 2>&1 | tail -6

echo "=== candidate versions ==="
apt-cache policy ros-humble-foxglove-bridge 2>&1 | head -8

echo "=== install ==="
apt-get install -y ros-humble-foxglove-bridge 2>&1 | tail -30
rc=$?
echo "install_rc=$rc"

echo "=== verify ==="
source /opt/ros/humble/setup.bash
if ros2 pkg prefix foxglove_bridge >/dev/null 2>&1; then
  echo "PREFIX=$(ros2 pkg prefix foxglove_bridge)"
  dpkg -l | grep -E 'foxglove' | awk '{print $2, $3}'
  ls "$(ros2 pkg prefix foxglove_bridge)/lib/foxglove_bridge/" 2>/dev/null
  ls "$(ros2 pkg prefix foxglove_bridge)/share/foxglove_bridge/launch/" 2>/dev/null
else
  echo "INSTALL_FAILED"
fi
echo "=== mcap storage plugin (for later milestones) ==="
apt-cache policy ros-humble-rosbag2-storage-mcap 2>&1 | head -4
exit $rc
