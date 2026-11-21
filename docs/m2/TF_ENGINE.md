# M2.2 TF Buffer 与变换引擎

## M2.2.1

`VirtualTFPublisher` 使用 `tf2_msgs/msg/TFMessage`。每条 TransformStamped 的 `header.frame_id` 是父坐标系，`child_frame_id` 是在父坐标系中定位的子坐标系。平移以米计，旋转使用单位四元数。

| 父坐标系 | 子坐标系 | Topic | 变换 |
| --- | --- | --- | --- |
| map | odom | `/tf_static` | 单位变换 |
| odom | base_link | `/tf` | 随场景变化的 XY 平移和机器人偏航 |
| base_link | lidar_link | `/tf_static` | (0, 0, 0.85) |
| base_link | camera_link | `/tf_static` | (0.3, 0, 0.65) |
| camera_link | camera_optical_frame | `/tf_static` | 零平移，四元数 (−0.5, 0.5, −0.5, 0.5) |
| base_link | imu_link | `/tf_static` | 单位变换 |

相机光轴系为 x 向右、y 向下、z 向前，和图像消息一致。其他机体坐标遵循 x 向前、y 向左、z 向上。[ROS REP 103](https://github.com/ros-infrastructure/rep/blob/master/rep-0103.rst)

动态 TF 的采样率为 25 Hz。静态变换在首步发布，随后每 200 ms 重发，使晚订阅的面板能从同一总线获取静态树。Pose 和 Path 在 `map`，Odometry 姿态在 `odom`，速度在 `base_link`。测试核对了父子树、光轴向量、单位四元数、机器人偏航和 Odometry 一致性，以及动态 TF 缺帧和乱序。

## 查找与缓存

每个 Viewer 通过相同 MessageBus 订阅源目录公布的 `tf2_msgs/msg/TFMessage`，每个源各有一个缓存。`/tf_static`（及以该名称结尾的话题）写静态边，其余 TFMessage 写动态边。输入样本按 ROS stamp 排序，重复时间戳用后收到的样本替换。每条动态边最多保留最近 20 秒、1024 条。树上限为 256 条边。删除或撤销 TF 话题清理对应类型，源重置清空全部。

`TfBuffer.lookup(target, source, stampNs)` 返回将源坐标转换到目标坐标的刚体变换。算法分别向上查找共同祖先，沿链组合各边，再以目标侧逆变换得到结果。转换点位置时先用归一化四元数旋转，再叠加平移。平移线性插值，旋转用 SLERP，动态边必须包含查询时刻或者有两个有效包围样本。双帧同名时坐标已经一致。[ROS 2 TFMessage](https://github.com/ros2/geometry2/blob/humble/tf2_msgs/msg/TFMessage.msg)

| 诊断 | 行为 |
| --- | --- |
| 坐标系不存在、链断开 | 图层暂停叠加，显示源和原因。 |
| 查询早于缓存 | 明示超出历史窗口。 |
| 查询晚于末样本 | 先等待未来样本，已变换的上帧可继续显示并带提示。超过 500 ms 或两样本间隔超过 500 ms 时报告断流。 |
| 乱序、重复 | 允许保留时间范围内的乱序样本，按时间二分查找。 |
| 自环、循环、父节点或边类型改变 | 拒绝该输入，保留已有有效树。源重置后可建立新树。 |

用户选择 Fixed Frame。TF 轴、标签和父子连接使用整套命名树，逐项可隐藏。点云和 Pose/Odometry 使用自己的消息时间，Path 对每个采样点查询。Marker 的 `frame_locked` 为真时随当前缓存 TF 更新，普通 Marker 使用自身时间。回放跳转重建 TF 历史并清理旧时间段。
