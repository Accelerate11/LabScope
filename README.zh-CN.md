# LabScope

[English](README.md) · **简体中文**

LabScope 是面向机器人实验的本地优先工作站，支持 ROS 2 数据可视化、录制、回放和 AI 辅助分析。

**LabScope 0.1.0-beta.1** 提供未签名的 Windows x64 便携 ZIP 和 Linux amd64 DEB。 [下载公开测试版](https://github.com/Accelerate11/LabScope/releases/tag/v0.1.0-beta.1) · [测试版发布报告](docs/release/PUBLIC_BETA_RELEASE_REPORT.md)

## 核心功能

### 已实现

- 通过 Foxglove WebSocket 协议连接 ROS 2。
- 发现和订阅话题，处理 ROS 消息 Schema 并解码 CDR。
- 使用 Three.js 渲染 PointCloud2，支持动态字段解析和多话题叠加。
- 查看 RGB 图像、深度图和 CameraInfo。
- 绘制 IMU 和其他数值字段的时序曲线。
- 显示 TF、固定坐标系、位姿、里程计、轨迹和标记。
- 实时数据和索引 MCAP 回放共用时间轴。
- Simulation Engine 支持确定性随机种子、模拟场景和故障注入。
- RecordingManager 支持多话题录制、暂停和继续、有界队列、分段、实验清单及 SHA-256。
- 支持录制无压缩的索引 MCAP，以及回放无压缩或 Zstd 压缩的索引 MCAP。
- 提供 Windows x64 和 Linux x64 的 Electron 桌面构建。
- AI Gateway 支持 OpenAI 兼容、Anthropic 和 Gemini 接口，以及无需凭据的 Local Mock Provider。
- 支持索引 MCAP 的确定性分析、本地文本日志解析和聚类、只读工具注册表，以及 Markdown 和 HTML 报告。
- Windows 平台凭据存储可用时，可通过 `safeStorage` 保护 API Key。

### 计划中

- 支持 LZ4 MCAP 写入及读取。
- 扫描无索引的 MCAP 并生成临时索引。
- 崩溃自动修复和磁盘写满恢复。
- 完善 Data Center 的导入、导出、归档和实验编辑功能。
- 点击报告证据后跳转到时间轴中的对应位置。
- 跨实验对比、私有知识库接口和插件 API。

## 架构

```text
ROS 2 / Foxglove Bridge       Simulation Engine
             |                         |
             +------ Data Worker -----+
                         |
                  Unified Message Bus
                         |
       +-----------------+------------------+
       |                 |                  |
   Viewer3D         CameraViewer          Plot
       |                 |                  |
       +----------- Unified Timeline -------+
                         |
                    Playback / MCAP
                         |
               Electron Main Process
             RecordingManager / AI Gateway
```

Renderer 通过共享数据层接收 ROS 数据。原始数据录制与渲染解耦，录制使用有界队列。Preload 仅暴露必要的 IPC 接口，启用上下文隔离并禁用 Node 集成。

## 仓库目录

```text
apps/desktop/       Electron 主进程、Preload、Renderer 和 Worker
packages/           ROS Schema、协议、数据源和模拟模块
tools/              M0 协议探针
scripts/            ROS 2 与开发辅助脚本
docs/m0/            ROS 2 协议验证材料与 Schema
docs/m1/            桌面运行报告
docs/m2/            可视化、时间轴和 MCAP 文档
docs/m3/            AI 工作区、确定性分析、工具与报告文档
docs/product/       V1 产品、架构、数据、AI 与用户指南
.github/workflows/  可复现的 CI 构建和测试流程
```

## 安装与开发

开发环境需要 Node.js 24.16.0 和 pnpm 11.28.5。

```powershell
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm -r build
pnpm -r typecheck
pnpm test
pnpm test:runtime
pnpm --filter @labscope/desktop dev
```

使用以下命令构建未签名的 Windows x64 便携 ZIP。

```powershell
pnpm --filter @labscope/desktop package
```

使用以下命令构建 Linux amd64 DEB。

```powershell
pnpm --filter @labscope/desktop package:linux
```

构建产物输出至 `apps/desktop/release`，该目录已加入 Git 忽略规则。请将安装包、`node_modules`、本地录制和用户凭据留在版本控制之外。

## 连接 ROS 2

在 Ubuntu 或 WSL2 中运行 ROS 2 和 `foxglove_bridge`，再从 LabScope 桌面端连接桥接服务的 WebSocket 地址。Windows 安装包不包含 ROS 2。

```bash
sudo apt install -y ros-humble-foxglove-bridge
bash scripts/m0/ros2/stage_into_wsl.sh
bash /root/labscope/ros2/start_stack.sh 8765
```

在「实时」页面输入 `ws://127.0.0.1:8765` 或 Windows 主机可访问的桥接地址。应用默认以只读模式监控。

## AI 配置

在「AI 分析」工作区配置模型提供方。可先使用 Local Mock Provider 体验无需 API Key 的流程。连接远程提供方时，填写名称、模型、HTTPS Base URL 和 API Key。密钥由 Electron 主进程处理，在 Windows `safeStorage` 可用时加密保存。保存后，Renderer 只接收是否已配置密钥的状态。

AI 功能会发送选定的确定性实验元数据。整份 MCAP 文件保留在本地，AI 请求不具备任意文件访问或系统命令执行权限。向远程提供方发送请求前，请检查其中的数据。

## 测试

运行以下命令验证源码和打包应用。

```powershell
pnpm test
pnpm test:runtime
pnpm -r typecheck
pnpm -r build
pnpm test:integration <path-to-electron>
pnpm test:simulation-ui <path-to-electron>
pnpm test:mcap-packaged <path-to-electron> <path-to-mcap>
```

公开测试版通过了 122 项单元测试和 8 项运行时检查。模拟和打包后的 Electron 检查使用可复现的本地夹具。真实机器人、长时间录制和真实模型凭据需单独验证。 [测试版发布报告](docs/release/PUBLIC_BETA_RELEASE_REPORT.md)

## 产品截图

仓库目前尚未收录产品截图。请从实际运行的 Electron 构建截图，并在提交前移除机器人私有数据。 [截图目录](docs/assets/screenshots/README.zh-CN.md)

## 参与贡献

提交改动前，请阅读贡献指南。安全问题按安全政策报告。 [贡献指南](CONTRIBUTING.md) · [安全政策](SECURITY.md)

## 许可证

LabScope 原创代码采用 Apache-2.0。第三方组件适用各自的上游条款，剩余的二进制分发要求记录在许可证就绪报告中。 [Apache-2.0](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md) · [许可证就绪报告](docs/release/provenance/FINAL_LICENSE_READINESS.md)

## 路线图

- 完善数据管理。
- 扩展 AI 实验分析，支持通过证据跳转时间轴。
- 跨实验对比。
- 私有知识库接口。
- 支持更多机器人协议。
- 插件生态。
