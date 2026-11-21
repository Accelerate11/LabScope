# M3 Log Analysis

`@labscope/analysis-engine` parses common timestamped and severity-prefixed text logs, normalizes DEBUG/INFO/WARN/ERROR/FATAL levels, preserves raw lines, counts severity, groups repeated errors, and records evidence line numbers.

The AI workspace accepts pasted logs without uploading them. ROS `/rosout`, Python, C++, JSON, and file-picker ingestion are planned extensions of the same parser contract.
