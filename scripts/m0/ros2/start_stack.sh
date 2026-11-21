#!/usr/bin/env bash
# Start the M0 ROS 2 stack from the WSL-native copy (/root/labscope/ros2).
# Run as root: wsl -u root -- bash /root/labscope/ros2/start_stack.sh [port]
set -o pipefail
source /opt/ros/humble/setup.bash

PORT="${1:-8765}"
LOG_DIR=/tmp/labscope_m0
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR"/*.log "$LOG_DIR"/stack.pids

echo "=== starting sensor demo (from $SELF_DIR) ==="
nohup python3 "$SELF_DIR/sensors_demo.py" > "$LOG_DIR/sensors.log" 2>&1 &
SENSORS_PID=$!

echo "=== starting foxglove_bridge on :$PORT ==="
nohup ros2 launch foxglove_bridge foxglove_bridge_launch.xml \
  port:="$PORT" address:=0.0.0.0 \
  > "$LOG_DIR/bridge.log" 2>&1 &
BRIDGE_PID=$!

printf 'SENSORS_PID=%s\nBRIDGE_PID=%s\nPORT=%s\n' "$SENSORS_PID" "$BRIDGE_PID" "$PORT" \
  > "$LOG_DIR/stack.pids"

echo "=== waiting for port $PORT ==="
for i in $(seq 1 60); do
  if ss -ltn 2>/dev/null | grep -q ":$PORT "; then echo "PORT_OPEN after ${i}s"; break; fi
  sleep 1
done
ss -ltnp 2>/dev/null | grep ":$PORT " || echo "PORT_NOT_LISTENING"

echo "=== topics in graph ==="
ros2 topic list 2>/dev/null | sort
echo "=== liveness ==="
kill -0 "$SENSORS_PID" 2>/dev/null && echo "SENSORS_ALIVE" || { echo "SENSORS_DEAD"; tail -20 "$LOG_DIR/sensors.log"; }
echo "=== bridge log tail ==="
tail -8 "$LOG_DIR/bridge.log"
