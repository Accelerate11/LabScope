# 源码构建与发布

这份流程使用 Node.js **24.16.0**、Corepack 和锁定的 pnpm **11.28.5**。从项目根目录运行命令。源码构建使用冻结锁文件和固定工具版本，生成的归档和安装包可能包含构建时间、元数据及平台工具差异。

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm -r build
pnpm -r typecheck
pnpm test
pnpm test:runtime
pnpm test:integration
```

自动化构建可以用 `pnpm install --frozen-lockfile --ignore-scripts` 跳过依赖生命周期脚本。electron-builder 会下载自己的 Electron 构建输入。开发模式需要 Electron 包安装其平台二进制，使用上面带生命周期脚本的安装命令。

```bash
pnpm --filter @labscope/desktop dev
```

## Windows x64

在 Windows 主机执行。默认输出为 `apps/desktop/release`，需要外部目录时使用绝对的 `-c.directories.output=...` 覆盖。

```powershell
pnpm --filter @labscope/desktop package
pnpm test:integration ./apps/desktop/release/win-unpacked/LabScope.exe
```

输出包含 `win-unpacked/LabScope.exe` 及 `LabScope-<版本>-windows-x64-unsigned.exe`。第二条命令通过本地模拟 Bridge 运行真实 Electron 冒烟测试。验证 WSL2 或真机 Bridge 时，使用已获准执行的 `LabScope.exe --smoke --url ws://127.0.0.1:8765`，以 `SMOKE_RESULT` 的通过状态与退出码 0 判定。

只在开发者确认并授权的测试环境运行未签名产物。Windows 可能阻止应用启动或 NSIS 构建期间的临时程序。遇到策略拦截，记录结果并使用组织已批准的构建或测试环境。保持系统安全策略原样。

## Linux x64

在 Linux x64（或 x64 WSL2 的 Linux 原生文件系统）构建。Debian 元数据的主页和维护者可以用 `-c.extraMetadata.homepage=...` 和 `-c.linux.maintainer=...` 覆盖。维护者的公开联系方式使用项目约定的 GitHub Issues。

```bash
pnpm --filter @labscope/desktop package:linux
```

输出 `LabScope-<版本>-linux-<架构>.AppImage` 和 `LabScope-<版本>-linux-<架构>.deb`。若需运行图形测试，使用已准备好桌面会话或虚拟显示及 Electron 沙箱支持的 Linux 环境。包内 Electron Fuses 关闭 RunAsNode、Node 环境参数和 Inspector CLI，并要求从 ASAR 装入应用。Windows 活化嵌入式 ASAR 完整性校验，Linux 只验证 ASAR 打包及相关 Fuse 位。 [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)

## GitHub Actions 与 Release

工作流在 Windows 和 Linux runner 上构建，附 SHA-256 上传 CI 产物。Windows 产物和文件名带 `unsigned`。配置仓库变量 `LABSCOPE_DEB_MAINTAINER` 可覆盖 Debian 维护者字段。

发布前审查 [第三方许可证](third-party-licenses.md)，验证来自相同源码版本的安装包和哈希。GitHub Release 的 Windows 下载项写明 **Windows x64（未签名）**，保留 SHA-256、版本说明和对应源码标签。CI 构建产物供验证，正式 GitHub Release 由项目维护者审核后发布。
