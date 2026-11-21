# 工作区 Schema

工作区 v1 保存在当前 Chromium 用户配置的 localStorage，键为 `labscope.workspace.v1`。应用重启并进入实时页时，已保存非空布局默认打开可视化工作区。

```json
{
  "version": 1,
  "root": {
    "kind": "split",
    "id": "split-1",
    "direction": "horizontal",
    "ratio": 0.55,
    "first": {
      "kind": "panel",
      "panel": {
        "id": "plot-1",
        "type": "Plot",
        "source": "live",
        "topic": "/imu/data",
        "title": "IMU"
      }
    },
    "second": {
      "kind": "panel",
      "panel": {
        "id": "viewer-1",
        "type": "Viewer3D",
        "source": "playback",
        "topic": null
      }
    }
  }
}
```

| 规则 | 说明 |
| --- | --- |
| 根与分屏 | 空布局为 `root: null`。分屏始终有两个子节点。horizontal 左右排列，vertical 上下排列。 |
| 尺寸 | ratio 是第一子区占比，限制为 0.2–0.8。分隔条支持鼠标和方向键，Home 与 End 设为两端。 |
| 标识 | 分屏、面板 ID 在同一工作区全局唯一，长度 1–64。面板最多 12 个，恢复时校验深度及数量。 |
| 面板 | type 保存注册键，source 可为 live、playback 或 simulation，topic 为以 `/` 开头的 1–256 字符字符串或 null，title 可省略，最长 80 个字符。 |
| 移动与删除 | 把左侧拖动按钮拖入另一面板可交换两者的树位置，面板 ID 和配置保持。删除面板折叠其父分屏。 |
| 保存 | 添加、关闭、交换、配置变更以及调整完成时自动保存。用户配置内原有的统计位置偏好继续使用独立键。 |
| 异常恢复 | 不支持版本、非法树或重复 ID 进入空布局并显示恢复错误。未知注册类型保留为占位。存储写入失败时保留本次会话的布局并显示保存错误。 |

模拟面板在重启后恢复数据源和话题绑定。用户从工作区启动模拟后，该绑定重新接收消息。[Simulation Engine](SIMULATION_ENGINE.md)

Viewer3D 在 v1 布局中可带 `pointCloud.primary` 与 `pointCloud.overlays`，每层保存 `colorMode`、`sampling`、`maxPoints`、`pointSize` 和 `visible`。叠加项还保存独立数据源与话题。旧布局自动使用默认设置。非法点云配置回落到默认设置，布局与原话题保留。[点云查看器](POINTCLOUD_RENDERER.md)
