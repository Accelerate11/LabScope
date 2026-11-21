# Foxglove WebSocket Protocol — LabScope 实测记录

> 实测对象：`foxglove_bridge` **3.6.3**（`foxglove-sdk-cpp/0.30.2`），ROS 2 **Humble**，Ubuntu 22.04.5。
> 所有结论均来自真实握手与真实消息抓包，证据文件见文末索引。
> 本文只描述 **服务端 → 客户端** 的只读监控链路（LabScope V1 的第一阶段目标）。

---

## 1. 握手与子协议（M0 最重要的发现）

### 1.1 结论

| 服务端实现 | 子协议 |
| --- | --- |
| 旧版 `ws-protocol` 系 bridge（≤ 2.x） | `foxglove.websocket.v1` |
| **当前 SDK 系 bridge（3.x）** | **`foxglove.sdk.v1`**（JSON 内联 schema）<br>`foxglove.sdk.v1.1`（连接级 schema 表，C++ SDK 0.30.2 **不支持**） |
| 老版本 Foxglove 文档 / 归档 `ws-protocol` 仓库 | 只提到 `foxglove.websocket.v1`，**与 3.x 不兼容** |

LabScope 客户端默认依次请求：`["foxglove.sdk.v1", "foxglove.websocket.v1"]`，由服务端选择，两类服务端都能连。

### 1.2 实测证据

对同一端口依次尝试不同 `Sec-WebSocket-Protocol`：

| 请求的子协议 | 结果 |
| --- | --- |
| `foxglove.websocket.v1` | `HTTP/1.1 400 Bad Request`，body：`Missing expected sec-websocket-protocol header` |
| `foxglove.websocket.v2` | 同上 |
| `foxglove.sdk.v1.1` | 同上（SDK 0.30.2 未实现） |
| `foxglove.sdk.v1` | `101 Switching Protocols`，随后收到 `serverInfo` |
| 不发送该头 | 同上 400 |

> 注意错误信息有误导性：服务端并不是"没收到 header"，而是**没有收到它认识的子协议值**。
> SDK 源码中该 400 同时覆盖"缺少 header"和"header 中不含受支持子协议"两种情况。

服务端选择逻辑（SDK 源码 `rust/foxglove/src/websocket/handshake.rs`）：只在 `foxglove.sdk.v1` / `foxglove.sdk.v1.1` 中选，且**精确匹配 token**（`foxglove.sdk.v1` 是 `foxglove.sdk.v1.1` 的前缀，但不会被当作后者）。

### 1.3 对 LabScope 的影响

1. 客户端必须支持**两代子协议**；只写 `foxglove.websocket.v1` 会 100% 连不上 3.x bridge。
2. `schemaEncoding` 为 `ros2msg`、`encoding` 为 `cdr` 时，`advertise` 里的 `schema` 是**内联文本**；实现 v1.1 时 schema 会改成连接级表引用，需要额外实现。M0 明确只实现 v1。
3. 连接失败要给用户可操作的提示：`400 + Missing expected sec-websocket-protocol` ⇒ "机器人端 bridge 版本与客户端协议不匹配"。

---

## 2. `serverInfo`（连接后第一帧）

真实抓包（已省略会话号）：

```json
{
  "op": "serverInfo",
  "name": "",
  "capabilities": [
    "clientPublish", "connectionGraph", "parameters",
    "parametersSubscribe", "services", "assets"
  ],
  "supportedEncodings": ["cdr", "json"],
  "metadata": {
    "ROS_DISTRO": "humble",
    "fg-library": "foxglove-bridge/3.6.3 foxglove-sdk-cpp/0.30.2"
  },
  "sessionId": "1795172258652"
}
```

可用于：
- 版本/发行版展示（`metadata.ROS_DISTRO`、`metadata.fg-library`）；
- 能力探测（是否支持 services / parameters / clientPublish）；
- `sessionId` 判断是"重连到同一实例"还是"机器人端 bridge 重启了"。

**注意**：`capabilities` 里没有 `time`，因此服务端不会主动发二进制 time 帧；V1 的实时可视化不能依赖它，应以消息自带时间戳为准。

---

## 3. `advertise`（频道发现）

一个 `advertise` 可以只带部分频道，**同一次连接内可能收到多帧**；客户端必须增量合并，不能假设"第一帧就是全部"。

真实抓包（channels 摘要）：

| id | topic | encoding | schemaEncoding | schemaName | schema 字节数 |
| --- | --- | --- | --- | --- | --- |
| 8 | `/imu/data` | `cdr` | `ros2msg` | `sensor_msgs/msg/Imu` | 2755 |
| 7 | `/livox/lidar` | `cdr` | `ros2msg` | `sensor_msgs/msg/PointCloud2` | 2598 |
| 9 | `/camera/color/image_raw` | `cdr` | `ros2msg` | `sensor_msgs/msg/Image` | 2391 |
| 4 | `/tf` | `cdr` | `ros2msg` | `tf2_msgs/msg/TFMessage` | 2673 |
| 5 | `/odom` | `cdr` | `ros2msg` | `nav_msgs/msg/Odometry` | 3718 |
| 6 | `/scan` | `cdr` | `ros2msg` | `sensor_msgs/msg/LaserScan` | 2549 |
| 2 | `/rosout` | `cdr` | `ros2msg` | `rcl_interfaces/msg/Log` | 2065 |
| 3 | `/parameter_events` | `cdr` | `ros2msg` | `rcl_interfaces/msg/ParameterEvent` | 2722 |
| 1 | `/foxglove_bridge/sysinfo` | `json` | `jsonschema` | `foxglove.SystemInfo` | 2214 |

要点：

1. **同一在线系统里编码可以混用**：ROS 2 话题是 `cdr`，bridge 自带的 sysinfo 是 `json`/`jsonschema`。解码器必须按频道选择路径，不能全局假设 CDR。
2. 频道 id 在重连后会变（实测重连后同一话题 id 从 8 变为其它值），**不能跨连接缓存**；订阅必须按 topic 重建。
3. `schema` 是完整可解析的定义文本（见第 6 节），客户端不需要安装 ROS 2 或 `.msg` 文件。

---

## 4. 二进制帧

### 4.1 Message Data（opcode `0x01`，服务端 → 客户端）

| 偏移 | 类型 | 含义 |
| --- | --- | --- |
| 0 | uint8 | `0x01` |
| 1 | uint32 LE | subscription id（客户端在 `subscribe` 时自选） |
| 5 | uint64 LE | log/receive time，纳秒 |
| 13 | uint8[] | 消息负载（编码由频道 `encoding` 决定） |

实测：

```
subId=1 logTime=1795172384589622939 len=324
hex: 00 01 00 00 | 20 28 00 6b | f7 3f 21 23 | 09 00 00 00 | 69 6d 75 5f 6c 69 6e 6b 00 ...
```

- `logTime` 是 **bridge 侧记录时间**，与消息内 `header.stamp` 不等（实测差 0.24 ms 级），V1 必须同时保留 `logTime`、`receiveTime`（客户端墙钟）和 `header.stamp`，三者语义不同。
- 订阅 id 与频道 id 不同：一个 topic 订阅对应一个 subscription id。

### 4.2 订阅/退订（JSON）

```json
{"op":"subscribe","subscriptions":[{"id":1,"channelId":8}]}
{"op":"unsubscribe","subscriptionIds":[1]}
```

`subscribe` 的 id 由客户端分配，同一连接内不得重复；重连后应重新从 1 开始。

---

## 5. CDR 负载格式（`encoding: "cdr"`）

### 5.1 封装头

真实负载前 4 字节恒为 `00 01 00 00`：

- `00 01` = OMG CDR 表示标识 `0x0001`（little-endian，按 big-endian 读这 2 字节）；
- 后 2 字节为选项，实测 `00 00`。

因此 **解码前必须跳过 4 字节**。LabScope 的解码器默认自动识别，识别不到才按裸 body 处理。

### 5.2 对齐基准（容易写错的地方）

CDR 对齐规则是"字段偏移必须是其大小（最大 8）的整数倍"，但**基准是封装头之后**（即 body 起点），不是整个 payload 起点。

用 `sensor_msgs/msg/Imu` 的实测长度可以证明：

- body 布局：`stamp(4+4)` + `frame_id(4+9)` = 21 字节 → 对齐 8 → 24；`orientation 32` + `covariance 72` + `angular_velocity 24` + `cov 72` + `linear_acceleration 24` + `cov 72` = 320。
- body = 320，加 4 字节头 = **324**，与实测 `len=324` 完全吻合。
- 若把对齐基准放在 payload 起点（含 4 字节头），同样字段会算出 328 字节，与实测不符。

### 5.3 字符串

ROS 2 string = `uint32 长度（含结尾 NUL）+ UTF-8 字节`。实测 `09 00 00 00` + `imu_link\0`，解码结果 `imu_link`。
长度包含 NUL 这一点如果写错，后续所有字段偏移都会错位（在 Imu 上表现为四元数全乱）。

### 5.4 数组

- 定长数组 `T[N]`：无长度前缀。
- 变长序列 `T[]`：`uint32 长度` + 元素。
- `uint8[]`（图像像素、点云 buffer）：长度前缀 + 裸字节；LabScope 返回**零拷贝视图**，否则 640×480×3 的图像每帧都要多复制一次。

---

## 6. `ros2msg` schema 文本格式

真实 `sensor_msgs/msg/Imu` schema（节选）：

```
std_msgs/Header header
geometry_msgs/Quaternion orientation
float64[9] orientation_covariance
================================================================================
MSG: geometry_msgs/Quaternion
float64 x 0
float64 y 0
float64 z 0
float64 w 1
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
```

解析要点（每一条都实际踩过或必须支持）：

| 规则 | 说明 |
| --- | --- |
| 分隔线 | 一行 `=`（80 个）分隔根定义与依赖定义 |
| `MSG: pkg/Type` | 依赖定义头，类型名是 **2 段**（`pkg/Type`），不是 `pkg/msg/Type` |
| 根类型 | 由频道 `schemaName` 给出（`pkg/msg/Type`），不取自文本 |
| 依赖引用 | 字段写 `std_msgs/Header`，需要规范化成统一键 `std_msgs/msg/Header`；裸 `Header` 按同包解析 |
| **IDL 默认值** | 依赖定义里会出现 `float64 x 0`、`float64 w 1`——**没有 `=`**。若解析器只接受 `type name`，整个 schema 解析失败（M0 首次运行 800/800 条 IMU 解码失败就是这个原因） |
| 常量 | `uint8 INT8=1` 这类大写常量必须识别并**跳过**，否则点云 `fields` 数组会多解出 9 个"字段"导致错位 |
| 注释 | `#` 到行尾 |
| 定长/变长 | `float64[9]`、`float64[]`、`string<=16`、`float64[<=5]` |

LabScope 的解析器（`packages/ros-schema/src/msgdef.ts`）对默认值做了**字面量校验**：只有数字/布尔/引号字符串才被当成默认值，这样 `this is not a field` 这类脏行不会被误解析成"字段 `is`，默认值 `not a field`"。

---

## 7. 尚未实现（V1 范围之外）

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| `foxglove.sdk.v1.1` schema 表 | 未实现 | 服务端 0.30.2 不支持；SDK 0.31+ 可能支持，需要跟进 |
| Service 调用 | 未实现 | 只读取 `advertiseServices` 计数，不调用 |
| 参数读取/订阅 | 未实现 | 只记录能力位 |
| 客户端发布（clientPublish） | 未实现 | 默认关闭（安全要求）；帧格式已实现并单测 |
| TLS / WSS | 未实现 | 协议层无差异，属于传输层配置 |
| Frames/视频（新版 remote access） | 未实现 | V1 不需要 |

---

## 8. 证据文件索引

| 文件 | 内容 |
| --- | --- |
| `docs/m0/artifacts/schemas/*.ros2msg.txt` | 9 个频道真实 schema 原文 |
| `docs/m0/artifacts/samples/manifest.json` | 真实 IMU（324 B）与 PointCloud2（320,145 B）负载（base64） |
| `packages/ros-schema/test/fixtures/imu_data.payload.bin` | 324 字节真实 IMU 负载（回归测试，解出 `imu_link` / 单位四元数 / 9.80665） |
| `packages/ros-schema/test/fixtures/livox_lidar.payload.bin` | 320,145 字节真实点云负载（回归测试） |
| `packages/ros-schema/test/fixtures/*.ros2msg.txt` | 真实 schema 回归夹具 |
| `docs/m0/artifacts/m0-final-*.json` | **最终验收证据**：9 频道、6 话题订阅、5412 条 / 155.6 MiB / 0 解码错误 / 0 断言失败 |
| `docs/m0/artifacts/m0-reconnect-during-stack-loss-*.json` | 真实断线 → 5 次退避重连的时间线证据 |
| `docs/m0/artifacts/m0-localhost-*.json` | 首轮证据（含 `float64 x 0` 解析失败现场） |
| `scripts/m0/dump_wire2.mjs` | 握手/抓包脚本（可直接复现第 1、3、4 节） |
| `scripts/m0/04_bruteforce_upgrade.sh` | 子协议暴力探测（复现 1.2 的 400 结果） |
| `scripts/m0/dump_schemas.mjs` | 一键导出所有频道 schema |
| `scripts/m0/06_final_rates.sh` | ROS 侧独立速率测量 |
