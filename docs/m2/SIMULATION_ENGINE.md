# M2.2.1 Simulation Engine

## 与现有工程的衔接

M2.1 已有 Panel Registry、工作区和 Renderer MessageBus。实时适配继续消费 Data Worker 通过 Preload/IPC 提供的遥测，回放继续使用 PlaybackFeed。审计时生产端使用相同的消息信封，但工程中没有通用 `DataSource` 接口。本阶段将消息信封和生产端接口放入 `packages/data-source`，并通过原 MessageBus 发布模拟消息。[Data Bus API](DATA_BUS_API.md)

模拟引擎位于 `packages/simulation-engine`。工作区只按 `(source, topic)` 订阅，模拟源标识为 `simulation`，和 `live`、`playback` 各自拥有独立的目录和最近样本。面板无需访问发生器、网络或新增 IPC。M1 实时链路仍提供预览负载；模拟源提供完整的 ROS 2 解码对象，使用同一种信封和 Schema 名字。

在 LabScope 的「可视化工作区」展开「模拟数据」，选择场景、点数、速度和种子后启动。添加面板并将数据源设为「模拟」，然后选择话题。停止保留最后一帧，重置清除模拟话题和帧。工作区保存面板的数据源和话题，模拟运行由用户显式启动。离开可视化页停止并清理模拟运行。

## 生产端 API

`SimulationDataSource` 实现 `DataSource` 的 `id`、`start()`、`stop()` 和 `reset()`。构造参数为实现 `DataSourceSink` 的总线和 `SimulationOptions`。运行器调用 `advance(wallMs)` 推进时间。单次输入范围为 0–1000 ms。直接调用 `stop()` 后再 `start()` 会从原逻辑时间继续。场景管理器创建新运行并清除上一场景，适用于从初始状态复现。

```ts
const manager = new SimulationScenarioManager(messageBus);
const source = manager.start('obstacle-scene', { seed: 42, pointCount: 100_000, speed: 1 });
const unsubscribe = messageBus.subscribe('simulation', '/points', () => {
  const sample = messageBus.getLatest('simulation', '/points');
  // 在数据适配层处理 sample.schemaName 与 sample.payload。
});
source.advance(100);
unsubscribe();
manager.reset();
```

引擎导出 `VirtualLidarPublisher`、`VirtualCameraPublisher`、`VirtualImuPublisher`、`VirtualTFPublisher`、`VirtualRobotStatePublisher`、`SimulationScenarioManager` 和 `FaultInjectionManager`。生产者使用相同的场景、运动和固定步长。总线支持 `hasSubscribers` 来跳过无人订阅的大负载。每个运行只维护最新显示样本和有限的故障队列。显示用总线按最新值更新，正式录制应从完整源流单独接入。

## ROS 2 话题

| Topic | Schema | 模拟采样率 |
| --- | --- | --- |
| `/points` | `sensor_msgs/msg/PointCloud2` | 10 Hz |
| `/camera/color/image_raw` | `sensor_msgs/msg/Image` | 5 Hz |
| `/camera/depth/image_raw` | `sensor_msgs/msg/Image` | 5 Hz |
| `/camera/camera_info` | `sensor_msgs/msg/CameraInfo` | 5 Hz |
| `/imu/data` | `sensor_msgs/msg/Imu` | 50 Hz |
| `/tf` | `tf2_msgs/msg/TFMessage` | 25 Hz |
| `/tf_static` | `tf2_msgs/msg/TFMessage` | 5 Hz |
| `/pose` | `geometry_msgs/msg/PoseStamped` | 25 Hz |
| `/odom` | `nav_msgs/msg/Odometry` | 25 Hz |
| `/path` | `nav_msgs/msg/Path` | 5 Hz |

`logTimeNs` 是以固定纪元 `1700000000000000000` ns 加逻辑采样时间得到的十进制字符串，`Header.stamp` 是同一时间的 `sec` 和 `nanosec`。模拟步长是 20 ms。相机、路径和静态 TF 在首个步长也发布数据。IMU 按机体坐标发布比力、角速度和带噪姿态。Odometry 的姿态在 `odom` 中，速度在 `base_link` 中。Path 保留最多 128 个按采样时间排列的姿态。

相机用同一房间几何做针孔射线与物体相交，产生具有遮挡关系的 RGB 及光轴深度。默认分辨率 160×90。RGB 为 `rgb8`，每行 `width × 3` 字节，深度为以米为单位的 little-endian `32FC1`，每行 `width × 4` 字节。`CameraInfo` 给出对应内参和零畸变。两张图与标定使用 `camera_optical_frame` 和同一采样时间。[ROS 2 Humble CameraInfo](https://github.com/ros2/common_interfaces/blob/humble/sensor_msgs/msg/CameraInfo.msg)

点云以 `lidar_link` 为参考系。[PointCloud2 生产接口](POINTCLOUD_API.md) · [TF 发布契约](TF_ENGINE.md)

## M2.2.2 多图层扩展

启用 `SimulationOptions.lidarOverlays` 或勾选「三路点云」后，模拟源额外公布 `/points/structure` 和 `/points/objects`。三路共用同一采样时钟和 `lidar_link`。两路附加话题分别用房间结构和立柱、障碍、活动物体的几何生成。每路按订阅需求生成，保留受种子控制的可复现采样。
