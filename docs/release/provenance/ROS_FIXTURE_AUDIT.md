# Foxglove and ROS Fixture Audit

| Item | Actual use | Engineering status | License/notice status | Clearance |
| --- | --- | --- | --- | --- |
| Foxglove WebSocket protocol | `packages/ros-protocol` implements client framing, discovery, subscription, and CDR transport compatibility | Compatibility implementation | Protocol compatibility does not by itself imply copied source | LIKELY clear as an implementation, source provenance still ACTION REQUIRED |
| Foxglove Bridge | External ROS 2 process used by M0 scripts and acceptance tests | Runtime dependency outside the Windows app | Upstream bridge license and deployment notices must be handled by the operator | ACTION REQUIRED before bundling or redistributing bridge binaries |
| Foxglove SDK/bridge metadata | Captured server metadata in `docs/m0/artifacts` | Test evidence | Attribution and redistribution of captured metadata require confirmation | UNKNOWN |
| MCAP | `@mcap/core` dependency and indexed reader/writer usage | Third-party library integration | Preserve package license and notices. No MCAP source file is copied into the tree | ACTION REQUIRED for final package notice audit |
| ROS message schemas | Captured `.ros2msg.txt` files under `docs/m0/artifacts/schemas` and test fixtures | Third-party interface definitions or captured definitions | Exact ROS distribution and package attribution must be recorded | UNKNOWN until fixture provenance is confirmed |
| Foxglove brand | No logo or brand asset is tracked in the source tree | No bundled asset found | Do not imply endorsement | CONFIRMED absent from tracked assets |

The repository contains compatibility code and captured data. This audit does not conclude that any protocol implementation copied Foxglove source. It also does not grant permission to redistribute Foxglove Bridge or captured schema material.
