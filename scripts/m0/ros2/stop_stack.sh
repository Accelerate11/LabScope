#!/usr/bin/env bash
# Gracefully stop the M0 ROS 2 stack: SIGINT first (lets ros2 launch and the
# publisher shut down cleanly), SIGKILL only if a process refuses to exit.
set -o pipefail
LOG_DIR=/tmp/labscope_m0

stop_pid() {
  local pid="$1" name="$2"
  if ! kill -0 "$pid" 2>/dev/null; then echo "$name (pid $pid) already stopped"; return; fi
  kill -INT "$pid" 2>/dev/null
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then echo "$name stopped gracefully"; return; fi
    sleep 0.5
  done
  echo "$name did not exit after SIGINT, sending SIGKILL"
  kill -KILL "$pid" 2>/dev/null
}

if [ -f "$LOG_DIR/stack.pids" ]; then
  # shellcheck disable=SC1090
  source "$LOG_DIR/stack.pids"
  stop_pid "${BRIDGE_PID:-0}" "foxglove_bridge launch"
  # ros2 launch may leave the node behind if it was killed hard.
  pkill -INT -f "/opt/ros/humble/lib/foxglove_bridge/foxglove_bridge" 2>/dev/null
  stop_pid "${SENSORS_PID:-0}" "sensors_demo"
else
  pkill -INT -f "sensors_demo.py" 2>/dev/null
  pkill -INT -f "foxglove_bridge_launch.xml" 2>/dev/null
fi

sleep 1
pkill -KILL -f "sensors_demo.py" 2>/dev/null
pkill -KILL -f "foxglove_bridge" 2>/dev/null
sleep 1
ss -ltn 2>/dev/null | grep -E ":8765 " || echo "port 8765 closed"
rm -f "$LOG_DIR/stack.pids"
