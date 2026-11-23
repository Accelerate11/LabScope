# ROS and Foxglove fixture clearance

2026-11-23 · Follow-up to audit commit `287b3f0`.

| Material | Evidence and disposition |
| --- | --- |
| Image, Imu, PointCloud2, LaserScan, Odometry and nested ROS definitions | The blocks match the installed Humble definitions after normalizing whitespace, including comments. The three ros-schema copies also match the M0 copies. Preserve upstream attribution and Apache-2.0. [common_interfaces 4.9.1](https://github.com/ros2/common_interfaces/tree/4.9.1) · [rcl_interfaces 1.2.2](https://github.com/ros2/rcl_interfaces/tree/1.2.2) |
| ParameterEvent, Log and nested ROS definitions | The Humble `rcl_interfaces` 1.2.2 blocks and `builtin_interfaces/Time` match. Both packages declare Apache-2.0. [rcl_interfaces 1.2.2](https://github.com/ros2/rcl_interfaces/tree/1.2.2) |
| TFMessage | The top-level `tf2_msgs` 0.25.20 block matches and retains BSD-3-Clause. The nested `geometry_msgs`, `std_msgs`, and `builtin_interfaces` blocks retain Apache-2.0. [geometry2 0.25.20 license](https://github.com/ros2/geometry2/blob/0.25.20/LICENSE) |
| Foxglove SystemInfo JSON Schema | Text matches the Rust `SYSINFO_JSON_SCHEMA` constant in the `ros-v3.6.3` SDK tag after trimming enclosing whitespace. M0 server metadata advertises Bridge 3.6.3 and C++ SDK 0.30.2. Preserve the SDK's MIT copyright and license. [Schema source](https://github.com/foxglove/foxglove-sdk/blob/ros-v3.6.3/rust/foxglove/src/system_info.rs) · [License](https://github.com/foxglove/foxglove-sdk/blob/ros-v3.6.3/LICENSE) |
| M0 archived JSON reports | Five reports record LabScope probe outcomes, standard ROS and Foxglove channel identifiers and schema byte counts. The captured metadata contains capability and version identifiers and session IDs. The standalone Schema files carry their applicable third-party notices. |
| M0 sample manifest and LiDAR decoder fixture | ROS 2 Humble deserialized both samples. The original publisher's seed `20261120` reproduced all 20,000 intensity values and the Z coordinate of every point in each LiDAR sample. Both represent LabScope's simulated sensor values. [Publisher](../../../scripts/m0/ros2/sensors_demo.py) |
| IMU decoder fixture | The previous test capture did not match the checked-in publisher's X/Y angular-rate formula. The fixture now repeats the corroborated final M0 manifest sample. Its angular rates, attitude and covariance match the checked-in publisher. The existing test continues to assert live ROS serialization, byte length, header, and decoded values. The previous capture remains in Git history and M0 historical reports are unchanged. |
| MCAP and bridge | No original recording files are tracked. Unit and integration tools create synthetic MCAP data. The desktop package links `@mcap/core` and uses Foxglove protocol compatibility. The ROS bridge runs as an external process. [Notices](../../../THIRD_PARTY_NOTICES.md) |

The comparison covered eight captured ROS schemas, 38 definition blocks including repeated dependencies, three decoder-schema copies, one Foxglove JSON Schema, and the four original CDR samples.

| Current CDR payload | Bytes | SHA-256 |
| --- | ---: | --- |
| Manifest and decoder IMU | 324 | `07a52acd99399f2c5e5ec1c028b29a1d6fa1284259d82ebb47c2b22abade6bef` |
| Manifest LiDAR | 320145 | `2ef37d41e08923bcaf507cc51adc0d307014dbaeede5c898af4be3209631ada7` |
| Decoder LiDAR | 320145 | `e7deb4de63965b4894eef82acce61ff3a0bac900ab4e8bb1c9df9641577b7477` |

**Disposition** · The source-tree fixtures can be retained with their applicable notices. The sensor values corroborate virtual input through a real ROS transport. Hardware provenance and acceptance are outside this check.
