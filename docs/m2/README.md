# M2 实时查看器与工作区

M1-R2 的 Windows 运行、解包冒烟、安装后冒烟及卸载通过，M2 从现有实时监控入口开始。M0 的协议和 CDR 解析继续作为数据层，M1 的 Topic 观察和原始消息预览保留。

M2.1 已提供多面板工作区和共享数据绑定。会话统计仍可放在顶部或右侧。面板渲染将从 M2.2 开始。

[M2.1 架构](M2.1_ARCHITECTURE.md) · [M2.1 测试报告](M2.1_TEST_REPORT.md)

M2.2.1 已接入可复现的模拟数据和故障注入。[模拟引擎](SIMULATION_ENGINE.md) · [场景](SIMULATION_SCENARIOS.md) · [测试](M2.2.1_TEST_REPORT.md) · [CPU 生产基线](M2.2.1_PERFORMANCE_REPORT.md)

M2.2.2 提供 WebGL2 点云绘制、独立图层配置和三话题叠加。[点云查看器](POINTCLOUD_RENDERER.md) · [测试](M2.2.2_TEST_REPORT.md) · [渲染实测](M2.2.2_PERFORMANCE_REPORT.md)

M2.2 已实现完整三维场景、高级相机、TF Fixed Frame、Pose、Odometry、Path、Marker 和索引 MCAP 回放。Simulation-First 使用标准 ROS 消息，真实传感器统一留到 Hardware Validation。[架构](M2.2_ARCHITECTURE.md) · [操作](VIEWER3D_USER_GUIDE.md) · [验收](M2.2_TEST_REPORT.md) · [性能](M2.2_PERFORMANCE_REPORT.md)

M2.3 已接入 RGB/Depth/CameraInfo、递归 Plot 字段、环形时序缓冲和共享 TimelineClock。[Camera Viewer](CAMERA_VIEWER.md) · [Image Decoder](IMAGE_DECODER_API.md) · [Plot](PLOT_ENGINE.md) · [时间同步](TIMELINE_SYNC.md) · [M2.3 验收](M2.3_TEST_REPORT.md) · [M2.3 性能](M2.3_PERFORMANCE_REPORT.md)

M2.4 已接入主进程 RecordingManager、无压缩索引 MCAP 分段、队列背压、实验 Manifest、暂停/继续和 Data Center 基础界面。[Recorder 架构](RECORDER_ARCHITECTURE.md) · [Writer](MCAP_WRITER.md) · [Reader](MCAP_READER.md) · [Data Center](DATA_CENTER.md) · [M2.4 验收](M2.4_TEST_REPORT.md)

| 顺序 | 交付 | 验收 |
| --- | --- | --- |
| 1 | 工作区中的独立面板、Topic 选择和布局保存 | 在不同面板查看不同话题，重启后加载布局，仍可使用原始消息面板。 |
| 2 | 3D Viewer | 使用模拟 PointCloud2、TF 和机器人状态逐步实现渲染和控制，测量 100k 点实时显示、500k 点压力、内存和显示抽样上限。 |
| 3 | Camera Viewer | 支持 ROS Image 首批编码并验证行步长，计划补 CompressedImage。无数据和不支持编码需要在面板中可见。 |
| 4 | Plot | 使用消息时间戳显示 IMU 与数值字段曲线，保留受限历史并在会话切换时清理。 |

3D 点云与相机数据使用受限的显示负载，从 Data Worker 批量发布。现有 JSON 预览继续承载字段检查。新增数据接口需要在节点替身、捕获数据及真实 Electron 中验证。
