# LabScope M0 技术验证报告

**里程碑**：M0 — 技术验证（Windows ↔ 真实 ROS 2 / Foxglove Bridge 通信）
**日期**：2026-11-20
**结论**：**通过** —— 协议握手、Topic 发现、六个真实话题的订阅与 CDR 解码全部端到端跑通，5412 条消息 / 155.6 MiB / 20 秒零解码错误、零断言失败，并已固化为可重复执行的探针与回归测试。实体机器人（Orin NX + Mid-360 + D435i）验证按计划留到 M0.5（§10）。

---

## 1. 一页纸结论

| # | M0 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | 检查开发环境 | ✅ 已完成 | §2 |
| 2 | 确定 Electron / React 版本 | ✅ 已完成 | §9 |
| 3 | 验证 Windows WebSocket 客户端 | ✅ 已完成 | §6.1（Node 24 原生 WebSocket，~30 ms 建立连接，`foxglove.sdk.v1` 协商成功） |
| 4 | 研究 Foxglove SDK Bridge 协议与消息 Schema | ✅ 已完成 | `docs/m0/PROTOCOL.md`（真实抓包 + SDK 源码交叉验证） |
| 5 | 在 Ubuntu ROS 2 Humble 启动真实 Foxglove Bridge | ✅ 已完成 | bridge 3.6.3 在 Ubuntu 22.04.5 / ROS 2 Humble 上监听 8765（§3） |
| 6 | 从 Windows 获取 Topic 列表 | ✅ 已完成 | 9 个 channel，含 schema 全文（§6.1） |
| 7 | 成功订阅 `sensor_msgs/msg/Imu` | ✅ 已完成 | 3051 条、147.7 Hz、0 解码错误；四元数模长误差 0、`angular_velocity.z=0.5`、`linear_acceleration.z=9.80665`、反算偏航角速度均值 0.5036 rad/s（§6.3） |
| 8 | 成功订阅 `sensor_msgs/msg/PointCloud2` | ✅ 已完成 | 206 条、10.0 Hz、65.9 MiB、0 解码错误、5 项语义断言全 PASS（§6.2） |
| 9 | 正确解码并展示消息基本信息 | ✅ 已完成 | IMU / PointCloud2 / Image / Odometry / TFMessage / LaserScan 六类真实消息全部解码通过（§6.2、§6.3） |
| 10 | 输出完整技术验证报告 | ✅ 本文 | — |

**最重要的三条结论：**

1. **子协议变了。** 当前 `foxglove_bridge` 3.x 是 SDK 系实现，只协商 `foxglove.sdk.v1`（或 `foxglove.sdk.v1.1`）；旧文档/旧 `ws-protocol` 仓库里的 `foxglove.websocket.v1` 会被 **400 拒绝**。客户端必须同时提供两代子协议，否则"照文档写"必然连不上。
2. **解码不需要 ROS。** 频道广告里带完整 `ros2msg` 定义文本，Windows 端用自研 schema 解析 + CDR 解码即可还原结构化数据；实测 320 KB 真实点云负载解出 20000 点、半径严格落在 [8,10] m，并已固化为回归测试。
3. **坑在细节。** 依赖定义里的 IDL 默认值（`float64 x 0`）会让"只认 `type name`"的解析器整体失败；CDR 对齐基准必须在 4 字节封装头**之后**。这两点都已用真实样例锁定。

---

## 2. 验证环境

| 角色 | 环境 | 说明 |
| --- | --- | --- |
| Windows 工作站 | Windows 11 (10.0.26200)，x64，15.8 GB RAM | 本机；Node 24.16.0（另有一份 24.21.0），pnpm 11.28.5 |
| 机器人端 | **Ubuntu 22.04.5 LTS**，ROS 2 **Humble**，内核 6.18（WSL2） | 与目标机器人同发行版/同 ROS 版本；非实体 Orin NX |
| 通信桥 | `ros-humble-foxglove-bridge` **3.6.3**（2026-11-10 构建，内含 `foxglove-sdk-cpp/0.30.2`） | apt 安装，MIT |
| 数据源 | 自写 rclpy 节点（标称）：`/imu/data` 200 Hz、`/livox/lidar` 10 Hz×20000 点、`/camera/color/image_raw` 5 Hz 640×480、`/odom` 50 Hz、`/tf` 50 Hz、`/scan` 10 Hz（实测受 Python 调度上限影响，见 §7.3） | **真实 ROS 2 节点、真实 DDS、真实 CDR 序列化**；不是 mock 数据 |

> **关于真实性（重要）**：本机没有实体 Orin NX / Mid-360 / D435i 可达，也没有原生 Windows ROS 2。因此 ROS 2 侧使用与目标机器人同发行版、同 ROS 版本、同 bridge 版本的 Ubuntu 22.04.5 主机（WSL2）承载**真实 ROS 2 节点**。协议、序列化、DDS、bridge 全部是真实组件，不存在"假 WebSocket 服务端"。实体硬件验证仍是 M0 之后的独立验收项（§10）。

实测拓扑：

```
Windows 11 (LabScope M0 probe, Node 24)
    │  ws://127.0.0.1:8765  /  ws://192.0.2.10:8765
    ▼
WSL2 Ubuntu 22.04.5 ── foxglove_bridge 3.6.3 ── DDS ── rclpy sensor nodes
```

---

## 3. 机器人端搭建（真实步骤，已执行）

```bash
# ROS 2 Humble 已就绪；安装 bridge
apt-get install -y ros-humble-foxglove-bridge      # 3.6.3-1jammy
source /opt/ros/humble/setup.bash
ros2 launch foxglove_bridge foxglove_bridge_launch.xml port:=8765 address:=0.0.0.0
```

启动日志确认：

```
Starting foxglove_bridge (humble, 3.6.3@)
Started server on 0.0.0.0:8765
Advertising new channel 8 for topic "/imu/data"
Advertising new channel 7 for topic "/livox/lidar"
...
```

`ros2 topic list -t` 与 bridge 广告的 9 个频道、schema 名称完全一致。

---

## 4. 客户端实现（本次交付的代码）

Monorepo（pnpm workspace），按目标架构落地第一批包，避免"先写得爽、后面重写协议层"：

```
labscope/
├── packages/
│   ├── ros-schema/       # ros2msg 解析 + CDR 解码 + PointCloud2 快速路径
│   └── ros-protocol/     # Foxglove WebSocket 协议客户端（握手/发现/订阅/重连）
├── tools/
│   └── m0-probe/         # M0 验收探针（连真机、订阅、解码、断言、出证据 JSON）
├── scripts/m0/           # 机器人侧脚本、抓包工具、子协议探测
├── docs/m0/              # 本报告 + 协议记录 + 真实抓包产物
└── packages/*/test/      # 45 个单元测试（含真实负载回归）
```

依赖方向严格单向：`tools → ros-protocol → ros-schema`。两个包都不依赖 Electron/DOM，后续可同时被主进程、Data Worker、Playback 复用（对应"实时与回放共用数据接口"的架构约束）。

### 4.1 `@labscope/ros-schema`

- `msgdef.ts`：解析 bridge 广告的 `ros2msg` 文本（分隔线 / `MSG:` 依赖 / `pkg/Type` 归一化 / 定长与变长数组 / 常量 / IDL 默认值）。
- `cdr.ts`：CDR 读取器（封装头识别、8 字节对齐、字符串含 NUL、越界即抛错）。
- `decode.ts`：**schema 驱动**的通用解码，不为每种消息手写代码；`uint8[]` 默认返回零拷贝视图。
- `pointcloud.ts`：PointCloud2 快速路径，`positions()` 直接产出 `Float32Array`（3D 面板的数据源）。

### 4.2 `@labscope/ros-protocol`

- 子协议协商：默认 `["foxglove.sdk.v1", "foxglove.websocket.v1"]`，两者兼容新旧 bridge。
- 频道/订阅簿记：按 **topic** 订阅而非 channel id，重连后自动在新 channel id 上重建订阅。
- 二进制帧解析：opcode `0x01`（消息）/ `0x02`（时间），订阅 id → topic 路由。
- 连接状态机：`idle → connecting → connected → disconnected → reconnecting → closed`，指数退避 + 抖动，可配最大尝试次数。
- 安全约束：URL 只接受 `ws:`/`wss:`，拒绝 URL 内嵌凭据（对应"禁止不受控网络资源"的要求）。
- 无第三方运行时依赖：Node ≥22 与 Electron 渲染进程都自带 WebSocket，包体积与攻击面都小。

### 4.3 `tools/m0-probe`（验收工具）

一条命令完成"连接 → 发现 → 订阅 → 解码 → 语义断言 → 出证据"：

```bash
pnpm -r build
node tools/m0-probe/dist/index.js \
  --url ws://127.0.0.1:8765 --seconds 15 \
  --out docs/m0/artifacts --label m0-localhost
```

断言不是"能解出字段"，而是"解出的值必须符合发布端的物理/数学事实"：

- IMU：`frame_id == "imu_link"`、四元数模长误差 < 1e-6、`angular_velocity.z == 0.5 rad/s`、`linear_acceleration.z == 9.80665`、由四元数反算的偏航角速度 ≈ 0.5 rad/s。
- PointCloud2：`frame_id == "livox_frame"`、点数 = 20000、`positions()` 长度 = 60000、半径 ∈ [8,10] m、`intensity` 可解。

---

## 5. 协议关键发现（摘要）

完整记录见 [`docs/m0/PROTOCOL.md`](./PROTOCOL.md)，这里只列对产品有直接影响的：

| 发现 | 影响 |
| --- | --- |
| 3.x bridge 只认 `foxglove.sdk.v1` / `foxglove.sdk.v1.1`；旧 `foxglove.websocket.v1` 返回 400 | 客户端必须双协议；连接失败要给出"bridge 版本不匹配"的可操作提示 |
| 400 的文案是 `Missing expected sec-websocket-protocol header`，但真正原因是"没有它认识的子协议" | 排障文档必须写明，否则会浪费大量时间在 header 大小写/格式上 |
| `foxglove.sdk.v1.1` 在 SDK 0.30.2 上不支持 | M0 只实现 v1；v1.1 的 schema 表留到后续 |
| 频道编码可混用：ROS 话题 `cdr`，bridge 自带 `sysinfo` 是 `json`/`jsonschema` | 解码按频道分派，不能全局假设 CDR |
| CDR 负载带 4 字节封装头；对齐基准在头之后 | 用 Imu 的 324 字节长度反推验证，写成单测（含真实负载） |
| 依赖定义含 IDL 默认值 `float64 x 0` | 解析器必须支持，否则整条 IMU/Odom/TF 链路全挂（本次真实踩坑） |
| `PointField` 里 `uint8 INT8=1` 等常量必须跳过 | 否则点云 `fields` 数组错位，解码结果不可信 |
| 频道 id 重连后会变 | 订阅必须以 topic 为准，不能缓存 channel id |

---

## 6. 实测结果

### 6.1 连接与发现

```
[open] proto=foxglove.sdk.v1 in 28ms
[connected] subprotocol=foxglove.sdk.v1 channels=9 connectMs=31.83
[serverInfo] name="", capabilities=[clientPublish, connectionGraph, parameters,
             parametersSubscribe, services, assets]
             supportedEncodings=[cdr, json]
             metadata={ROS_DISTRO: humble, fg-library: foxglove-bridge/3.6.3 foxglove-sdk-cpp/0.30.2}
```

发现 9 个频道（id / topic / 编码 / schema）：

| id | topic | encoding | schemaEncoding | schemaName |
| --- | --- | --- | --- | --- |
| 1 | `/foxglove_bridge/sysinfo` | json | jsonschema | `foxglove.SystemInfo` |
| 2 | `/rosout` | cdr | ros2msg | `rcl_interfaces/msg/Log` |
| 3 | `/parameter_events` | cdr | ros2msg | `rcl_interfaces/msg/ParameterEvent` |
| 4 | `/tf` | cdr | ros2msg | `tf2_msgs/msg/TFMessage` |
| 5 | `/odom` | cdr | ros2msg | `nav_msgs/msg/Odometry` |
| 6 | `/scan` | cdr | ros2msg | `sensor_msgs/msg/LaserScan` |
| 7 | `/livox/lidar` | cdr | ros2msg | `sensor_msgs/msg/PointCloud2` |
| 8 | `/imu/data` | cdr | ros2msg | `sensor_msgs/msg/Imu` |
| 9 | `/camera/color/image_raw` | cdr | ros2msg | `sensor_msgs/msg/Image` |

订阅 6 个话题（跳过 sysinfo / rosout / parameter_events），**20 秒**内客户端合计收到
**5412 条消息 / 163,140,726 字节（155.6 MiB）**，约 **8.1 MB/s** 端到端持续吞吐，
客户端帧层解码错误 **0**，探针语义断言失败 **0**（`m0-final`）。

### 6.2 按话题统计（最终验证运行，20 s）

| topic | 消息数 | 客户端速率 | 字节数 | 平均解码耗时 | 最大解码耗时 | 解码错误 |
| --- | --- | --- | --- | --- | --- | --- |
| `/camera/color/image_raw` | 103 | 5.00 Hz | 94.9 MiB | 20.3 µs | 89 µs | 0 |
| `/imu/data` | 3051 | 147.7 Hz | 988 KiB | 21.0 µs | 1.47 ms | 0 |
| `/livox/lidar` | 206 | 10.00 Hz | 65.9 MiB | 52.9 µs | 4.50 ms | 0 |
| `/odom` | 921 | 44.57 Hz | 667 KiB | 13.0 µs | 233 µs | 0 |
| `/scan` | 207 | 10.00 Hz | 311 KiB | 17.5 µs | 268 µs | 0 |
| `/tf` | 924 | 44.76 Hz | 292 KiB | 10.7 µs | 184 µs | 0 |

ROS 侧独立测量（`ros2 topic hz`，与客户端无关）作为对照：

| topic | ROS 侧实测 | 客户端实测 | 结论 |
| --- | --- | --- | --- |
| `/imu/data` | 163.0 Hz（发布端计数均值 ~159 Hz） | 147.7 Hz | 同量级；发布端 Python 定时器上限所致（§7.3），非客户端丢帧 |
| `/livox/lidar` | 10.00 Hz | 10.00 Hz | 一致 |
| `/odom` | 44.4 Hz | 44.6 Hz | 一致 |
| `/tf` | 45.1 Hz | 44.8 Hz | 一致 |
| `/scan` | 10.00 Hz | 10.00 Hz | 一致 |
| `/camera/color/image_raw` | 2.5 Hz（10 s 窗口样本少，发布端计数 ~5 Hz） | 5.00 Hz | 一致 |

> 客户端速率与 ROS 侧一致，未发现客户端限速或系统性丢包。端到端**丢包率的严格量化**需要
> 带序号的自定义消息，已列入 M4 待办（§10）。
> 最大解码耗时出现在首帧（schema 解析 + 点云 `positions()` 首次构建），稳态均值见上表。

**一次"意外"的重连验收**：复跑过程中曾因操作失误（截断 `wsl.exe` 输出导致会话被杀，§7.4）
使机器人端进程中途消失。客户端在 ~0.3 s 内检测到断线、按退避策略重连 5 次，并在探针结束前
恢复正常收流（该次仍输出 5412 条前的部分数据）。证据：
`docs/m0/artifacts/m0-reconnect-during-stack-loss-2026-11-20T13-52-30Z.json`
（时间线含 `disconnected (code=1005)` → `reconnecting (attempt 1..5)`）。
这同时验证了"断线检测 + 自动重连"两个 M0 必测能力。

### 6.3 语义断言结果（最终验证运行）

IMU（3051 条真实消息，零错误）：

```
[PASS] imu.frame_id == "imu_link"
[PASS] imu.orientation is unit length (|q|-1 < 1e-6) — |q|-1 = 0
[PASS] imu.angular_velocity.z == 0.5 rad/s — z = 0.5
[PASS] imu.linear_acceleration.z == 9.80665 m/s^2 — z = 9.80665
[PASS] imu.orientation_covariance is float64[9] — length=9
[PASS] imu yaw rate from quaternion ~= 0.5 rad/s — samples=2886 mean=0.503577 rad/s
```

解码后的首帧样本（负载 324 字节，与 §5.2 的对齐推算完全一致）：

```json
{
  "frameId": "imu_link",
  "orientation": { "x": 0, "y": 0, "z": -0.9829203910343837, "w": 0.1840312606293132 },
  "norm": 1,
  "angularVelocity": { "x": 0.015304, "y": -0.012876, "z": 0.5 },
  "linearAcceleration": { "x": 0, "y": 0, "z": 9.80665 },
  "hadEncapsulationHeader": true,
  "payloadBytes": 324
}
```

PointCloud2（206 条真实消息，零错误）：

```
[PASS] frame_id == "livox_frame"
[PASS] point_count == 20000 (width=20000 height=1 pointStep=16)
[PASS] positions() -> Float32Array(60000)
[PASS] radius within [8, 10] m  (min=8 max=10)
[PASS] intensity decodable (20000 values)
```

Image / Odom / TF / Scan：均 0 解码错误；Image 640×480 rgb8 的 `data` 以零拷贝视图暴露
（921,600 字节/帧），Odometry 的 `covariance[36]`、TFMessage 的嵌套 `TransformStamped[]`
均正确解出。

### 6.4 自动化测试

```
Test Files  6 passed (6)
     Tests  45 passed (45)
```

| 测试文件 | 覆盖 |
| --- | --- |
| `ros-schema/test/msgdef.test.ts` | 真实 Imu/PointCloud2/Odometry schema 解析；默认值 vs 常量；定长/变长/有界数组；重复字段与脏行报错 |
| `ros-schema/test/cdr.test.ts` | 封装头识别、8 字节对齐、字符串含 NUL、截断/超长序列报错、`wstring` 显式拒绝、零拷贝 vs 拷贝 |
| `ros-schema/test/pointcloud.test.ts` | PointCloud2 布局/位置/intensity；长度不符报错；Image 元数据 + 像素视图 |
| `ros-schema/test/realpayload.test.ts` | **真实抓包负载**回归：324 字节 IMU 全字段（含四元数/协方差）、20000 点云、半径 [8,10]、`PointField[]` 嵌套、`bytesRead == payload 长度` |
| `ros-protocol/test/framing.test.ts` | 消息帧/时间帧/未知 opcode/截断/零拷贝；客户端发布帧编码 |
| `ros-protocol/test/client.test.ts` | URL 校验、握手协商失败、无 schema 频道告警、按 topic 订阅去重、消息路由、unadvertise 后重订阅、重连退避与订阅恢复、显式关闭不重连、达到最大重试次数 |

---

## 7. 发现的问题、根因与修复

### 7.1 P1 — 子协议不匹配（阻塞级）

- **现象**：按公开文档用 `foxglove.websocket.v1` 连接，握手直接 `1006`，服务端日志 `handshake failed`。
- **根因**：bridge 3.6.3 是 SDK 实现，只接受 `foxglove.sdk.v1` / `foxglove.sdk.v1.1`；实测 `--cd`、无 header、多种大小写均 400。
- **修复**：客户端默认请求两个子协议并按服务端选择结果工作；连接失败时给出"bridge 版本/子协议不匹配"的明确错误。
- **状态**：✅ 已修复并用真实 bridge 验证。

### 7.2 P2 — `ros2msg` 依赖定义里的 IDL 默认值导致解析失败（阻塞级）

- **现象**：IMU/Odom/TF 800/316/314 条消息 100% 解码失败；报错 `cannot parse field declaration "float64 x 0" in geometry_msgs/msg/Quaternion`。PointCloud2/Image/LaserScan 正常（它们的依赖里没有默认值）。
- **根因**：bridge 输出的依赖定义带 IDL 默认值（`float64 x 0`、`float64 w 1`），而解析器只接受 `type name`；同时 `PointField` 的 `uint8 INT8=1` 常量若当字段处理会让点云 `fields` 错位。
- **修复**：字段语法支持 `type name <default>`；默认值做字面量校验（数字/布尔/引号字符串），避免把脏行误解析成字段；常量仅由 `=` 判定并在解码时跳过。
- **验证**：✅ 已复跑验证。重建 `dist` 后对真实 IMU 流解码 **3051 条、0 错误**（另 Odom 921 条、TF 924 条，均 0 错误）；324 字节真实负载已固化为回归夹具（`packages/ros-schema/test/fixtures/imu_data.payload.bin`）。
- **教训**：首轮复跑时 `dist` 未重建，探针仍用旧解析器，白跑一轮——CI 必须"先 build 再跑集成"，不能只依赖单测（单测走 `src`，探针走 `dist`）。

### 7.3 P3 — 发布端定时器设计导致速率失真（影响测试可信度）

- **现象（第一版）**：`ros2 topic hz` 显示 IMU 55 Hz（目标 200）、图像 7 Hz（目标 15）、Odom 19 Hz（目标 50）。
- **根因一**：测试节点用 6 个独立 rclpy 定时器 + 单线程执行器；图像/点云的 0.9 MB/0.3 MB 拷贝挤占了 5 ms 的 IMU 定时器。
- **根因二（第二版发现）**：改成"单定时器 + 计数器分频"后仍整体偏慢 23%——因为 rclpy 的 200 Hz 定时器实测只跑到 ~154 Hz，所有派生流按比例变慢（lidar 7.7、odom 38.6、image 3.9）。
- **最终修复**：每个流维护**自己的单调时钟截止时间**，慢 tick 通过"补齐到期消息"追平（每 tick 有上限，避免卡顿后雪崩）。
- **复测结果**：lidar 10.00 Hz、scan 10.00 Hz、image 5.00 Hz 精确达标；odom 44.6 Hz、tf 44.8 Hz（目标 50）与 ROS 侧 44.4 / 45.1 Hz 一致——剩余差距是 Python 发布节点在这台 VM 上的上限，不是客户端问题。IMU 实测 ~148–163 Hz（目标 200），同理。
- **结论**：问题是**测试数据源**的 Python 调度能力，不是客户端链路；它也解释了首轮 IMU 仅 52 Hz——客户端并没有丢帧。若后续需要严格 200 Hz 源，可改用 C++ 发布节点（M4 性能测试的备选方案）。

### 7.4 P4 — WSL2 虚拟机 wedged（环境故障，非产品缺陷）

- **现象**：运行约 12 分钟后（无 WSL 命令在飞行中）虚拟机失去响应；随后 `wsl --terminate`、`wsl --shutdown`、`--exec`、甚至 `wsl --list --running` 全部超时（`HCS_E_CONNECTION_TIMEOUT`）。Windows 侧 `vmmemWSL` 进程存在，非管理员无法终止，`WSLService` 无法重启。
- **背景**：宿主机 15.8 GB 内存，故障时仅剩 1.8 GB 空闲；VM 默认按 50% 分配（7.6 GB）。9p（`/mnt/d`）挂载 + 高带宽发布是可疑诱因。
- **已做缓解（代码/流程层面）**：
  - 机器人侧脚本改为**先拷贝到 WSL 内 ext4（`/root/labscope`）再执行**，不再从 `/mnt/d` 直接运行；
  - 停栈改为**先 SIGINT 优雅退出**（`ros2 launch` 需要 SIGINT 才能正常收尾），超时才 SIGKILL；
  - 采集改为**短窗口**（15–20 s）跑完即停，不在无人订阅时长时间空转；
  - 另发现并规避一个操作陷阱：用 `wsl.exe ... | Select-Object -First N` **截断输出会杀掉整个 WSL 会话**，连带杀掉已启动的 ROS 进程（曾导致一次探针中途断连）。启停脚本必须完整读取输出。
- **恢复过程**：由有管理员权限的账户重启 WSL 后确认为纯环境问题；恢复后重跑全部通过（§6）。
- **遗留**：宿主内存偏紧仍是风险，长时间高带宽录制（M4）需要先在更宽裕的环境或降低并发话题数下验证。

---

## 8. 性能观察

- 端到端 **8.1 MB/s**（6 话题、20 s、155.6 MiB，其中图像 94.9 MiB）下客户端无瓶颈；
  单条消息解码耗时（稳态均值 / 最大）：Image 20.3 µs / 89 µs、PointCloud2 52.9 µs / 4.5 ms、
  IMU 21.0 µs / 1.47 ms、Odom 13.0 µs / 233 µs、TF 10.7 µs / 184 µs、LaserScan 17.5 µs / 268 µs。
  最大耗时集中在首帧（schema 解析 + 点云 `positions()` 首次构建）。
- 20 秒 5412 条消息全部解码成功，客户端帧层 `decodeErrors = 0`，探针语义断言 0 失败。
- `uint8[]` 零拷贝视图避免了图像/点云的整块复制；`PointCloud2.positions()` 只在面板需要时调用，
  20000 点 → `Float32Array(60000)`，首帧构建耗时计入上表最大值。
- 尚未测：长时间（≥1 h）稳定性、内存增长、`positions()` 稳态吞吐基准、回放侧吞吐。
  这些属于 M3/M4/M5 的验收内容。

---

## 9. 版本冻结与技术选型

npm registry 实测（2026-11-20）：

| 组件 | 版本 | 决策 |
| --- | --- | --- |
| Electron | **45.4.1** | 采用（M1 起） |
| React / React DOM | **19.3.1** | 采用 |
| Vite | **8.3.8** | 采用（electron-vite 6.0.0 配套） |
| electron-vite | **6.0.0** | 采用 |
| electron-builder | **26.18.0** | 采用（Windows x64 NSIS） |
| Tailwind CSS | **4.3.5**（`@tailwindcss/vite` 同版本） | 采用 |
| Three.js | **0.187.0**（`@types/three` 同版本） | 采用 |
| ECharts | **6.1.0** | 采用 |
| Zustand | **5.1.0** | 采用 |
| TypeScript | **5.9.3** | M0/M1 采用。最新版是 7.0.2（Go 原生重写），生态兼容性未验证，M1 内做一次 spike 再决定是否升级 |
| Vitest | **5.1.1** | 采用 |
| pnpm | **11.28.5** | 采用（workspace） |
| Node.js | **24.x**（本机 24.16.0 / 24.21.0） | 采用；`engines: >=22.18` |
| ROS 2 | **Humble** | 第一优先；Jazzy 作为后续兼容目标 |
| foxglove_bridge | **3.6.3**（SDK 0.30.2） | 机器人端基线版本 |

约束与注意：
- Electron 45 内置的 Chromium/Node 具体版本，以 M1 首次启动时读取 `process.versions` 的结果为准并写入文档。
- 许可证核对：`foxglove_bridge` 为 MIT；`foxglove-sdk` 为 MIT。**不复用** 已归档 `ws-protocol` 库，本项目自研客户端（本次已实现并测试）。
- Node 24 自带全局 `WebSocket`，因此 `@labscope/ros-protocol` 无运行时依赖；`ws` 仅作为 devDependency 备用（当前未使用）。

---

## 10. 风险与未完成项

| 级别 | 项 | 说明 | 计划 |
| --- | --- | --- | --- |
| 高 | 实体机器人未验证 | 自定义消息、QoS（best_effort 传感器）、Wi-Fi MTU/丢包、机器人时钟与 Windows 时钟偏差均未在 Orin NX + Mid-360 + D435i 上验证 | M0.5：拿到机器人后跑同一 probe，补 15 分钟连续采集 |
| 中 | 端到端丢包率未严格量化 | 客户端速率与 ROS 侧同量级，但没有逐条序号对比；高负载下的丢弃行为无法断言 | M4 前用带序号的自定义消息 + 录制文件计数做精确统计 |
| 中 | 200 Hz IMU 源不可得 | Python 发布节点上限 ~150–163 Hz，无法在现有环境验证 200 Hz 压力 | M4 用 C++ 发布节点或 bag 回放加压 |
| 中 | `foxglove.sdk.v1.1` 未实现 | schema 表形式；SDK 0.31+ 可能启用 | M1 内跟踪，必要时实现 |
| 中 | 旧版 bridge（2.x）未实测 | 客户端声称兼容 `foxglove.websocket.v1`，但没有 2.x bridge 可测 | 用 docker/旧版本回归 |
| 中 | 时间基准策略未定稿 | `logTime` / `receiveTime` / `header.stamp` 三元组已保留，但录制与回放选哪个作为主时间轴需在 M4 前定案 | 设计文档 `docs/architecture/time-model.md` |
| 中 | 宿主内存偏紧 | 开发机 15.8 GB / 故障时 1.9 GB 空闲；长时间高带宽场景有再次 wedged 的风险 | M4 长稳测试换环境或限制并发话题 |
| 低 | `wstring` 不支持 | 显式抛错，不静默错解 | 有消息类型使用再实现 |
| 低 | 大端 CDR 未实测 | 代码支持，真实设备几乎不会出现 | 单测已覆盖识别逻辑 |

---

## 11. 复现步骤

### 11.1 机器人端（Ubuntu 22.04 + ROS 2 Humble）

```bash
# 1) 安装 bridge
sudo apt install -y ros-humble-foxglove-bridge

# 2) 把仓库里的脚本拷进 Linux 本地盘再运行（不要从 /mnt/d 直接跑）
bash /path/to/labOS/scripts/m0/ros2/stage_into_wsl.sh
bash /root/labscope/ros2/start_stack.sh 8765        # 起传感器节点 + bridge

# 3) 独立核对 ROS 侧速率（可选）
bash /path/to/labOS/scripts/m0/06_final_rates.sh
```

> 注意：用 `wsl.exe ... | Select-Object -First N` 截断输出会杀掉 WSL 会话及其子进程，启停脚本必须完整读取输出。

### 11.2 Windows 端

```powershell
pnpm -r build                                        # 必须！探针跑 dist，单测跑 src
pnpm test                                            # 45 个单测
node tools/m0-probe/dist/index.js --url ws://<robot-ip>:8765 --seconds 20 `
     --out docs/m0/artifacts --label m0-final
```

通过标准：`M0 probe PASSED`，且 JSON 中 `/imu/data`、`/livox/lidar` 的 `decodeErrors == 0`、全部断言 `ok == true`。

### 11.3 故障恢复（仅当 WSL 再次 wedged）

需要管理员权限执行其一：

```powershell
wsl --shutdown            # 首选；若命令本身挂起：
Restart-Service WSLService
# 或：任务管理器结束 vmmemWSL，或重启主机
```

---

## 12. 下一步（M1）

M0 已闭环，进入 M1 桌面骨架：

1. `apps/desktop`：Electron 45 + React 19 + Vite 8 + Tailwind 4 + Zustand；主进程 / preload / 渲染进程三层安全边界，IPC 白名单，窗口与六大导航骨架。
2. 把 `ros-protocol` 接到 **Data Worker**（Node 侧）：渲染进程通过 IPC 只拿"解码后的批次 + 二进制 transferable"，避免高频数据在 IPC 里反复 JSON 化。
3. 补齐 `docs/architecture/`：进程模型、统一 `DataSource` 接口、时间模型（logTime / receiveTime / header.stamp）、MCAP 录制背压策略。
4. Windows 安装包流水线（electron-builder，NSIS x64）与首个可安装版本。
5. 硬件到位后补 M0.5：真机（Orin NX + Mid-360 + D435i）跑同一探针 + 15 分钟连续采集。

---

## 附录 A：产物清单

| 路径 | 内容 |
| --- | --- |
| `packages/ros-schema/` | schema 解析 + CDR 解码 + PointCloud2（含单测与真实夹具） |
| `packages/ros-protocol/` | Foxglove 协议客户端（含单测） |
| `tools/m0-probe/` | 验收探针 CLI |
| `scripts/m0/ros2/sensors_demo.py` | 机器人侧真实 ROS 2 节点（单调时钟截止时间调度器） |
| `scripts/m0/ros2/{start,stop}_stack.sh`、`stage_into_wsl.sh` | 启停与部署脚本 |
| `scripts/m0/{00_env_probe,01_ros_inspect,02_install_bridge,03_probe_bridge,04_bruteforce_upgrade,05_measure_rates,06_final_rates}.sh` | 环境、协议与速率验证脚本 |
| `scripts/m0/{dump_wire,dump_wire2,probe_subprotocol,dump_schemas}.mjs` | 握手/抓包/子协议探测工具 |
| `scripts/m0/watch_wsl_recovery.ps1` | WSL 故障恢复探测（本次故障期间使用） |
| `docs/m0/PROTOCOL.md` | 协议实测记录 |
| `docs/m0/artifacts/schemas/*.ros2msg.txt` | 9 个频道真实 schema |
| `docs/m0/artifacts/samples/manifest.json` | 真实 IMU(324 B) + PointCloud2(320,145 B) 负载（base64） |
| `docs/m0/artifacts/m0-final-*.json` | **最终验收证据**（5412 条 / 155.6 MiB / 0 错误 / 0 断言失败） |
| `docs/m0/artifacts/m0-localhost-*.json` | 首轮证据（含 IMU 解析失败现场） |
| `packages/ros-schema/test/fixtures/{imu_data,livox_lidar}.payload.bin` | 真实负载回归夹具 |
| `packages/ros-schema/test/fixtures/*.ros2msg.txt` | 真实 schema 回归夹具 |
