# LabScope M1 桌面验收记录

2026-11-20，Windows 11 x64，LabScope Desktop `0.1.0-m1`。

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 构建与类型检查 | 通过 | `pnpm -r build` 和 `pnpm -r typecheck` 成功退出 |
| 协议和解码单元测试 | 通过 | `pnpm test` 共 6 个文件、45 个测试通过 |
| 桌面 Data Worker 到 ROS 2 Bridge | 通过 | Windows Node 加载构建后的 `data-worker.js`，连接 WSL2 中的 ROS 2 Humble 和 Foxglove Bridge 3.6.3，协商 `foxglove.sdk.v1`，发现 9 个话题 |
| 订阅、预览解码和断开 | 通过 | 同一 Data Worker 测试收到 30 条 IMU 和 2 条点云消息。IMU 的 `frame_id` 为 `imu_link`、Z 轴角速度为 0.5 rad/s，点云包含 20,000 点。两话题抽样解码错误数均为 0，断开后订阅清空 |
| Windows x64 应用目录打包 | 通过 | `pnpm --filter @labscope/desktop exec electron-builder --win --x64 --dir` 成功，核对了 `app.asar` 的入口及七个构建文件 |
| Windows Electron 启动与桌面冒烟 | 受阻 | Windows Code Integrity 事件 3077 记录了对开发用 `electron.exe` 和打包后 `LabScope.exe` 的执行拦截 |
| Windows NSIS 安装和关闭 | 受阻 | 代码完整性策略阻止了 NSIS 构建期间运行的临时安装程序，构建未生成完整安装包。安装、界面启动和关闭待在可运行项目构建产物的 Windows 环境验收 |

WSL2 测试使用现有 ROS 2 发布节点生成传感器样本。实体机器人和传感器联调见 [M0 的待验收项](../m0/REPORT.md#10-风险与未完成项)。

## 桌面验收命令

启动 M0 ROS 2 测试栈后，在项目根目录运行：

```powershell
pnpm -r build
pnpm -r typecheck
pnpm test
pnpm --filter @labscope/desktop smoke --url ws://127.0.0.1:8765
pnpm --filter @labscope/desktop package
```

冒烟测试等待 React 主界面渲染，通过 preload IPC 发起连接和订阅，接收 IMU 与 PointCloud2 的解码预览，再断开会话。验收时应看到 `SMOKE_RESULT` 中的 `passed: true` 和进程退出码 `0`。冒烟测试的连接地址仅用于该次运行。

安装包生成后，验证安装界面、应用启动和关闭、卸载。在应用设置页保存一个 Bridge 地址，重启后确认地址已加载。
