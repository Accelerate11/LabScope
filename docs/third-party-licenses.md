# 第三方许可证检查

范围为 M1-R2 的 pnpm 锁文件、Windows 安装依赖、应用运行时包和 Electron 平台二进制。**Apache-2.0 可继续作为 LabScope 原创源码的候选许可证。** 检查确认当前直接进入应用 JS/CSS 的 npm 运行时组件声明 MIT。构建工具、外部 ROS 2 定义和平台二进制仍需按各自许可处理。此次检查未把依赖重新标记为 Apache-2.0。

| 范围 | 已核对 | 发布要求 |
| --- | --- | --- |
| 应用构建包 | React/React DOM 19.3.1、Scheduler 0.28.0、Zustand 5.1.0 与 Tailwind CSS 4.3.5 均声明 MIT。 | 发行包包含对应版本的原始版权及许可文本。内部 ROS 协议和解码代码以项目选定的原创源码许可发布。 |
| LabScope runtime dependencies | Three.js 0.187.0、`@mcap/core` 2.4.0、`fzstd` 0.1.1 and Zustand are used by the Renderer, MCAP reader/writer, compression reader and state layer. Their package metadata is retained in `pnpm-lock.yaml`. | Keep each package's upstream license and notices. The current recorder writes uncompressed MCAP and does not claim LZ4 support. |
| Windows npm 安装图 | 352 个实际安装包版本，均有许可证声明。273 MIT、36 ISC、10 Apache-2.0、10 BSD-3-Clause、5 BSD-2-Clause、9 BlueOak-1.0.0、2 MPL-2.0；其余为 Python-2.0、0BSD、CC-BY-4.0、WTFPL 和 SPDX 备选表达式。 | 检查构建工具是否实际进入分发包。Lightning CSS 和平台插件的 MPL-2.0、caniuse-lite 的 CC-BY-4.0、argparse 的 Python-2.0、WTFPL 工具等按原许可处理。单凭 npm 声明不能认定包内所有文件许可相同。 |
| Linux 安装图与锁文件 | 348 个实际安装包版本，均有许可证声明。与 Windows 安装图的许可分类一致，部分平台可选包及 Windows 专用工具的数量不同。 | 每个发布平台留存实际安装与产物清单。按最终内容核对 Linux 平台二进制和打包工具所附资产的许可。 |
| Electron 45.4.1 预编译分发 | Electron 声明 MIT。包内已有 `LICENSE.electron.txt`、`LICENSES.chromium.html`，后者包含 Chromium 组件和 FFmpeg 的许可文本。 | 保留上游许可。核对实际 ffmpeg DLL/so 的编译选项与相应源码来源、可重链接及通知等适用义务。许可文本里列出的可选 GPL 组件不能作为已启用的证据。 |
| ROS 2 Schema 与测试夹具 | M0 的 IMU、PointCloud2 等样本来自测试发布节点和 Bridge；归档还包含上游接口定义及 Bridge 提供的 Schema。 | 公开源码前核对所收录定义的上游版本和许可，补充必要的版权和许可归属，核对历史验证记录及夹具的可公开范围。 |

依赖声明筛查通过了原创源码候选许可的初步判断。公开源码仍需维护者确认许可证和归属。公开二进制前还需核对实际打包清单，并附上相应第三方通知与视频组件许可材料。GitHub 仓库已建立，待这些条件完成后再推送或发布。

[Apache Software Foundation 第三方许可分类参考](https://apache.org/legal/resolved) · [Electron 许可文件](https://github.com/electron/electron/blob/v45.4.1/LICENSE) · [FFmpeg 法务与许可](https://ffmpeg.org/legal.html)
