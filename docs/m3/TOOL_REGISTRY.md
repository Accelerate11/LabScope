# M3 Tool Registry

The read-only `ToolRegistry` exposes explicit tools with IDs, descriptions, permissions, and execution functions. Current tools include experiment information, topic statistics, IMU analysis, PointCloud analysis, and local log analysis.

Unknown tool IDs fail closed. The registry has no filesystem command execution, ROS publishing, parameter mutation, experiment deletion, or raw-data mutation capability.
