# PointCloud2 数据接口

## M2.2.1 模拟生产端

`VirtualLidarPublisher` 发布 `sensor_msgs/msg/PointCloud2`，默认话题为 `/points`。面板从 MessageBus 订阅该话题，获取 `schemaName`、`logTimeNs` 和 `payload.kind = 'decoded'` 的原始结构。

点云使用固定种子对房间几何表面采样，覆盖地面、墙面、立柱和障碍物，并随场景更新运动目标和机器人参考系。数据模拟几何结构，采用表面采样模型。支持 10k、50k、100k、500k 点。

| 字段 | ROS PointField datatype | 当前发布偏移 |
| --- | --- | --- |
| x、y、z | `FLOAT32` (7) | 0、4、8 |
| intensity | `FLOAT32` (7) | 12 |
| rgb | `UINT32` (6)，0x00RRGGBB | 16 |
| ring | `UINT16` (4)，可选，默认开启 | 20 |

模拟消息 `header.frame_id` 为 `lidar_link`，`height=1`，`width` 为点数，`is_bigendian=false`。开启 ring 时 `point_step=24`，关闭时为 20。模拟器使用紧密的行布局，`row_step=width × point_step`，`data` 为 `Uint8Array`。位置单位为米。点云时间戳与相同采样时刻的 TF 时间一致。故障场景可以发布 NaN 或字段偏移异常。

## M2.2.2 解码与处理

`@labscope/ros-schema` 导出 `parsePointCloud2(message)`，接收 ROS 2 解码对象。`decodePointCloud2(schema, cdr)` 保留原 CDR 接口，也使用同一个布局解析器。校验尺寸、步长、数据长度、时间戳和 PointField 的名称、类型、数量、偏移。解码后保留 `Uint8Array` 视图，无点数据复制。

`PointCloud2Layout.byteOffset(index)` 按 `row_step` 跨行，按 `point_step` 跨点，支持有行填充的有组织点云。读取数值遵循 `is_bigendian`。可通过 `field(name)` 与 `scalar(name)` 读取八种 Humble 标准数值类型的标量数据，包括 `ring`、`time` 或 `t`。这两个时间字段作为原始数值保留，点云去畸变留待后续。[ROS 2 Humble PointCloud2](https://github.com/ros2/common_interfaces/blob/humble/sensor_msgs/msg/PointCloud2.msg) · [ROS 2 Humble PointField](https://github.com/ros2/common_interfaces/blob/humble/sensor_msgs/msg/PointField.msg)

`decodeDisplayCloud(envelope)` 采用统一输入 `schemaName = 'sensor_msgs/msg/PointCloud2'` 和 `payload.kind = 'decoded'`。ROS 采样时间和 `header.frame_id` 保留。信封的 `logTimeNs` 独立提供。回放读取器如持有 CDR 字节，应先按记录的 Schema 解码，再投递完整消息。

| 颜色 | 行为 |
| --- | --- |
| XYZ | 可配置固定颜色，默认 #52c0f1。 |
| Intensity | 从同名标量字段读取，支持自动范围和手动上下限。 |
| RGB / RGBA | 兼容 packed FLOAT32（按位读取）、UINT32、INT32，以及 UINT8 三或四分量。packed 格式按 0xAARRGGBB 解包，RGB 设为不透明。 |
| Height | 使用点云原坐标系的 z，支持自动范围和手动上下限。 |
| Distance | 使用点到当前坐标系原点的欧氏距离。 |

缺少强度或颜色字段时返回 XYZ 的有效颜色模式。非有限强度使用中点颜色。NaN、Infinity 和超出 Float32 范围的 XYZ 样点被过滤。缺少标量 XYZ 或布局无效时，Viewer 清除该图层并提示错误，下一条有效帧可恢复。

`PointCloudProcessor` 的均匀模式对源点序号按等间隔取整选样。按序模式取源消息开头的点。两种模式再过滤选中样点中的无效坐标，最多显示配置的点数，过滤后可能少于上限。同一消息与配置产生相同结果。显示缓冲的内容由下一次处理覆盖，使用时根据 `drawnPoints` 决定有效范围。原始消息及录制数据保留全量点。[点云查看器](POINTCLOUD_RENDERER.md)

M2.2 统计 `sourcePoints`、`sampledPoints`、`validPoints`、`drawnPoints` 和 `invalidPoints`。有效与过滤点数针对源消息全量。手动范围将超界数值钳制到梯度两端。颜色和采样在传感器坐标处理，Geometry 的刚体变换按消息时间转换到 Fixed Frame。[TF 引擎](TF_ENGINE.md)
