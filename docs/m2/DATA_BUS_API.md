# Data Bus API

实现位于 Renderer 的 `workspace/message-bus.ts`。面板从同一个 MessageBus 获取实时、回放和模拟数据。信封类型及生产端 `DataSource`、`DataSourceSink` 契约由 `@labscope/data-source` 导出。

## 消息结构

| 字段 | 类型与语义 |
| --- | --- |
| `source` | `live`、`playback` 或 `simulation` |
| `topic` | 当前源目录中的 ROS 话题名 |
| `schemaName` | 消息类型字符串 |
| `logTimeNs` | 十进制纳秒字符串或 null。直播取实际采样帧的时间戳 |
| `sequence` | 当前数据源时段中，用于区分同一话题的样本序号。回放 seek 后可重复 |
| `payload` | 带 kind 的负载，`preview` / `decoded` 数值由生产者定义，`binary` 使用 Uint8Array |

## 消费和生产

```ts
const stop = bus.subscribe('live', '/imu/data', () => {
  const frame = bus.getLatest('live', '/imu/data');
  // 帧被清除时，frame 为 undefined。
});
stop();
```

`getChannels(source)` 和 `subscribeChannels(source, listener)` 提供每个源独立的目录。生产者使用 `setChannels(source, channels)`、`publish(message)` 和 `reset(source)`。React 面板通过 `useSyncExternalStore` 接入订阅，视图只接收当前实例的配置与消息。总线保留有消费者的话题的最新帧，同源同话题的重复 sequence 会被忽略。退订最后一个消费者清除帧。回调异常按消费者隔离。

实时适配通过 `publishLive(telemetry)` 将现有 Worker 遥测发布到总线。普通遥测使用 `preview`，面板订阅的 PointCloud2 使用完整的 `decoded` 样本并保留独立的 JSON 预览。工作区的实时话题在同一微任务内合并，Preload `setPanelTopics(topics)` 替换面板集合。Worker 与现有手动订阅取并集，用同一个协议客户端完成首订阅、重连恢复和末引用释放。失联及目录撤销时清除作废样本。

```ts
const replay = new PlaybackFeed(bus);
replay.load([{ topic: '/imu/data', schemaName: 'sensor_msgs/msg/Imu' }]);
replay.deliver({
  topic: '/imu/data', schemaName: 'sensor_msgs/msg/Imu',
  logTimeNs: '42', sequence: 1, payload: { kind: 'decoded', value: { x: 1 } },
});
replay.seek();  // 清除本次播放的已保留帧
replay.close(); // 清空回放目录及帧
```

回放端按自己的时钟产出已读取的帧。它不需要 ROS 连接或访问 Electron IPC。本阶段提供适配器与测试夹具，后续文件读取模块可以直接挂接。

模拟生产者可通过 `hasSubscribers(source, topic)` 跳过无人订阅的大负载。模拟订阅不触发实时 IPC，模拟源重置只清理自己的最近帧。[Simulation Engine](SIMULATION_ENGINE.md)
