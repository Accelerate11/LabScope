# LabScope Third-Party Notices

LabScope's original code is licensed under Apache-2.0. The components below retain the licenses and copyright notices supplied by their respective upstream projects. The [license texts](third-party/licenses/) are relative to this notice in the source tree and installed application. The packaging inventory and open license checks are recorded in the [binary distribution audit](docs/release/provenance/BINARY_DISTRIBUTION_AUDIT.md).

The Windows portable ZIP and Linux DEB use the Electron and application notices below. The NSIS, SDK D3D compiler, and AppImage entries document earlier candidates and deferred formats.

## Redistributed application code

| Component | Version | License and notice file |
| --- | --- | --- |
| React | 19.3.1 | MIT · [React](third-party/licenses/react-19.3.1.txt) |
| React DOM | 19.3.1 | MIT · [React DOM](third-party/licenses/react-dom-19.3.1.txt) |
| Scheduler | 0.28.0 | MIT · [Scheduler](third-party/licenses/scheduler-0.28.0.txt) |
| Zustand | 5.1.0 | MIT · [Zustand](third-party/licenses/zustand-5.1.0.txt) |
| Three.js | 0.187.0 | MIT · [Three.js](third-party/licenses/three-0.187.0.txt) |
| Tailwind CSS | 4.3.5 | MIT · [Tailwind CSS](third-party/licenses/tailwindcss-4.3.5.txt) |
| @mcap/core | 2.4.0 | MIT · [MCAP](third-party/licenses/mcap-core-2.4.0.txt) |
| @foxglove/crc | 0.0.3 | MIT · [CRC](third-party/licenses/foxglove-crc-0.0.3.txt) |
| heap-js | 2.7.1 | BSD-3-Clause · [heap-js](third-party/licenses/heap-js-2.7.1.txt) |
| tslib | 2.9.1 | 0BSD · [License](third-party/licenses/tslib-2.9.1.txt), [copyright](third-party/licenses/tslib-2.9.1-copyright.txt) |
| fzstd | 0.1.1 | MIT · [fzstd](third-party/licenses/fzstd-0.1.1.txt) |

## Desktop runtime and installer

- **Electron 45.4.1 and Chromium 156.0.8078.100.** Preserve the runtime's `LICENSE.electron.txt` and `LICENSES.chromium.html`. The latter covers Chromium third-party materials including ICU, V8, SwiftShader, Vulkan components and DirectX Shader Compiler. Electron is MIT-licensed. Chromium and its dependencies have multiple licenses. [Electron DEPS](https://github.com/electron/electron/blob/v45.4.1/DEPS)
- **Node.js 24.22.3.** Node is embedded in Electron. Preserve its [license and bundled notices](third-party/licenses/node-v24.22.3.txt) as well as Chromium's aggregate notice.
- **FFmpeg.** Electron dynamically loads `ffmpeg.dll` on Windows and `libffmpeg.so` on Linux. These packages use Electron's LGPL-2.1-or-later alternate variant with proprietary codecs disabled. [FFmpeg's licensing summary](third-party/licenses/ffmpeg-LICENSE.md.txt) · [LGPL text](third-party/licenses/ffmpeg-COPYING.LGPLv2.1.txt) · [Corresponding source and replacement instructions](https://github.com/Accelerate11/LabScope/blob/main/docs/release/FFMPEG_SOURCE.md)
- **NSIS 3.0.4.1 and NSIS resources 3.4.1.** The Windows installer uses NSIS and LZMA compression. Preserve [NSIS COPYING](third-party/licenses/nsis-3.0.4.1.txt), the [UAC license](third-party/licenses/uac-0.2.4c.txt), the [StdUtils copyright notice](third-party/licenses/stdutils-1.14-readme.txt), [LGPL](third-party/licenses/stdutils-1.14-lgpl.txt) and [installer clarification](third-party/licenses/stdutils-1.14-clarification.txt), and the [Nsis7z license](third-party/licenses/nsis7z-19.00-license.txt) plus the [7-Zip license](third-party/licenses/7zip-19.00-License.txt), [LGPL](third-party/licenses/7zip-19.00-copying.txt) and [unRAR terms](third-party/licenses/7zip-19.00-unRarLicense.txt). The binary audit records the outstanding WinShell terms and source delivery checks.
- **Microsoft D3D compiler.** The Windows `d3dcompiler_47.dll` is copyright Microsoft Corporation. The binary matches the x64 Redist copy from Microsoft Windows SDK 10.0.28000.2270. Its own SDK redistribution terms apply. [Microsoft SDK terms](https://aka.ms/WinSDKLicenseURL) · [Microsoft REDIST list](https://learn.microsoft.com/en-us/legal/windows-sdk/redist)
- **Remaining platform checks.** The binary audit tracks how the Microsoft SDK downstream terms will be met, the NSIS WinShell redistribution grant, and the AppImage linked components. The binary candidates are pending clearance.

## AppImage-only notices

The six libraries match the Ubuntu packages named by the AppImage toolset. Preserve the package copyright files for [GConf](third-party/licenses/appimage-gconf-copyright.txt), [libnotify](third-party/licenses/appimage-libnotify-copyright.txt), [libappindicator](third-party/licenses/appimage-libappindicator-copyright.txt), [libindicator](third-party/licenses/appimage-libindicator-copyright.txt), [libXtst](third-party/licenses/appimage-libxtst-copyright.txt), and [libXss](third-party/licenses/appimage-libxss-copyright.txt), plus [GPL 3.0](third-party/licenses/appimage-GPL-3.txt), [LGPL 2.0](third-party/licenses/appimage-LGPL-2.txt), and [LGPL 2.1](third-party/licenses/ffmpeg-COPYING.LGPLv2.1.txt). The AppImage also carries code from [AppImageKit](third-party/licenses/appimagekit-effcebc.txt), [libappimage](third-party/licenses/libappimage-13f401a.txt), and [squashfuse](third-party/licenses/squashfuse-1f98030.txt). See the binary audit for the runtime dependency notices and linked GPL component review.

The runtime build pins XZ Utils 5.2.3. Its license summary identifies liblzma as public-domain software. The source kit preserves the [XZ licensing summary](third-party/licenses/xz-5.2.3-COPYING.txt), [GPL 2.0](third-party/licenses/xz-5.2.3-COPYING.GPLv2.txt), [GPL 3.0](third-party/licenses/xz-5.2.3-COPYING.GPLv3.txt), and [LGPL 2.1](third-party/licenses/xz-5.2.3-COPYING.LGPLv2.1.txt) from the pinned source archive.

## Source-tree fixtures

- ROS 2 Humble definitions from sensor_msgs, nav_msgs, std_msgs, geometry_msgs, builtin_interfaces, and rcl_interfaces are Apache-2.0. The captured definitions preserve upstream comments and are assembled from the corresponding .msg files. [common_interfaces 4.9.1 license](third-party/licenses/ros-common_interfaces-4.9.1.txt) · [rcl_interfaces 1.2.2 license](third-party/licenses/ros-rcl_interfaces-1.2.2.txt)
- The tf2_msgs TFMessage definition is BSD-3-Clause. Its nested geometry_msgs, std_msgs, and builtin_interfaces definitions are Apache-2.0. [geometry2 0.25.20 license](third-party/licenses/ros-geometry2-0.25.20.txt)
- The Foxglove SystemInfo JSON Schema comes from the Foxglove SDK shipped with Foxglove ROS Bridge 3.6.3. It is MIT-licensed and attributed to Foxglove Technologies Inc. The bridge itself runs separately. [Foxglove license](third-party/licenses/foxglove-sdk-ros-v3.6.3.txt)
- The CDR fixtures and base64 samples contain values from the LabScope M0 virtual sensor publisher. The M0 JSON reports contain connection metadata and measured test outcomes. [Fixture audit](docs/release/provenance/ROS_FIXTURE_AUDIT.md)
