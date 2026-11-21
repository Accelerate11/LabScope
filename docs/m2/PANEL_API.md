# Panel API

实现位于 `apps/desktop/src/renderer/src/workspace`。注册表为 Renderer 内部 API，扩展通过编译期模块接入。

## 注册和注销

| 接口 | 行为 |
| --- | --- |
| `register(definition): () => void` | 注册唯一 type，发布更新，返回只移除本次注册的注销函数。 |
| `unregister(type): void` | 移除类型，通知已挂载工作区；不存在的类型按空操作处理。 |
| `get(type)`、`getSnapshot()` | 读取定义与当前注册表快照。 |
| `subscribe(listener): () => void` | 订阅注册表变更，返回退订函数。 |

`PanelDefinition` 包含 `type`、`label`、`accepts(schemaName)` 和 `View`。标识符须以字母开头，长度 1–64，只使用字母、数字和连字符。注册重复标识符抛出错误。

```tsx
const dispose = panelRegistry.register({
  type: 'ExamplePlot',
  label: 'Example Plot',
  accepts: (schema) => schema === 'sensor_msgs/msg/Imu',
  View: ({ config, message }) => <div>{message?.logTimeNs ?? config.topic}</div>,
});
```

## 实例配置与生命周期

`PanelViewProps` 提供 `config` 和可选的 `message`。配置包含实例 ID、类型、`live`、`playback` 或 `simulation`、话题和可选标题。工作区根据注册时的 `accepts` 筛选话题目录。恢复的未知话题在目录刷新前保留，已确认不兼容的话题不进入普通绑定视图。

视图第一次挂载时建立订阅。改绑、关闭、退出工作区或注销类型释放旧订阅。注销后布局保留该节点并显示未注册提示，重新注册可恢复内容。每个配置和显示区域由独立的 React 错误边界包裹。渲染异常显示可重试状态，错误内容视图卸载，外层关闭和布局操作继续可用。视图自行负责处理异步异常和自身副作用。

内置 `Viewer3D` 使用 `managesSubscriptions` 管理多个 PointCloud2 订阅，`message` 保持为空，视图通过 MessageBus 管理队列和清理。旧 LaserScan 绑定可显示收到消息的状态，几何绘制使用 PointCloud2。`CameraViewer` 和 `Plot` 沿用绑定预览。[点云查看器](POINTCLOUD_RENDERER.md)
