# M2 Live Viewers and Workspace

[简体中文](README.md) · **English**

M1-R2 passed Windows runtime checks, smoke tests for unpacked and installed builds, and uninstall validation. M2 builds on the existing Live view. The data layer continues to use M0's protocol and CDR decoder, and the Live view keeps M1's topic inspection and raw message preview.

M2.1 introduced a multi-panel workspace and shared data binding. Session statistics can still appear at the top or on the right. Panel rendering starts in M2.2. [M2.1 architecture](M2.1_ARCHITECTURE.md) · [M2.1 test report](M2.1_TEST_REPORT.md)

M2.2.1 added reproducible simulation data and fault injection. [Simulation Engine](SIMULATION_ENGINE.md) · [Scenarios](SIMULATION_SCENARIOS.md) · [Tests](M2.2.1_TEST_REPORT.md) · [CPU data-generation baseline](M2.2.1_PERFORMANCE_REPORT.md)

M2.2.2 added WebGL2 point-cloud rendering, independent layer settings, and overlays for three topics. [Point-cloud renderer](POINTCLOUD_RENDERER.md) · [Tests](M2.2.2_TEST_REPORT.md) · [Measured rendering performance](M2.2.2_PERFORMANCE_REPORT.md)

M2.2 delivered a full 3D scene, advanced camera controls, TF fixed-frame support, pose, odometry, path and marker visualization, and indexed MCAP playback. Simulation-First uses standard ROS messages. Real sensor tests are scheduled for Hardware Validation. [Architecture](M2.2_ARCHITECTURE.md) · [User guide](VIEWER3D_USER_GUIDE.md) · [Acceptance report](M2.2_TEST_REPORT.md) · [Performance](M2.2_PERFORMANCE_REPORT.md)

M2.3 added RGB, depth, and CameraInfo support, recursive field selection in Plot, a ring buffer for time-series data, and a shared TimelineClock. [Camera Viewer](CAMERA_VIEWER.md) · [Image Decoder](IMAGE_DECODER_API.md) · [Plot](PLOT_ENGINE.md) · [Time synchronization](TIMELINE_SYNC.md) · [M2.3 acceptance report](M2.3_TEST_REPORT.md) · [M2.3 performance](M2.3_PERFORMANCE_REPORT.md)

M2.4 added the main-process RecordingManager, segmented uncompressed indexed MCAP, queue backpressure, experiment manifests, pause and resume, and a basic Data Center interface. [Recorder architecture](RECORDER_ARCHITECTURE.md) · [Writer](MCAP_WRITER.md) · [Reader](MCAP_READER.md) · [Data Center](DATA_CENTER.md) · [M2.4 acceptance report](M2.4_TEST_REPORT.md)

The table records the original M2 delivery sequence and acceptance criteria.

| Order | Deliverable | Acceptance criterion |
| --- | --- | --- |
| 1 | Independent workspace panels, topic selection, and layout persistence | View different topics in different panels, restore the layout after restart, and keep the raw message panel available. |
| 2 | 3D Viewer | Build rendering and controls incrementally with simulated PointCloud2, TF, and robot state. Measure real-time rendering at 100k points, stress at 500k points, memory use, and the display sampling limit. |
| 3 | Camera Viewer | Support the initial ROS Image encodings and validate row strides. CompressedImage was planned for later. Show empty data and unsupported encodings in the panel. |
| 4 | Plot | Plot IMU and numeric fields by message timestamp. Bound the history and clear it when the session changes. |

3D point clouds and camera data use bounded display payloads published in batches from the Data Worker. The existing JSON preview remains available for field inspection. Validate new data interfaces using a stub node, captured data, and a running Electron application.
