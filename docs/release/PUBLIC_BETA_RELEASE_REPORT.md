# LabScope v0.1.0-beta.1 release execution

2026-11-22, Asia/Shanghai. Public pre-release status is **blocked by the license gate**.

| Field | Result |
| --- | --- |
| Repository and branch | [Accelerate11/LabScope](https://github.com/Accelerate11/LabScope) · `main` |
| Version | `0.1.0-beta.1` in the root manifest, desktop manifest, and both inspected app.asar archives |
| Candidate source commit | `287b3f0a971b9db23c07638d9c0332fca58eef32`, including M3.0 and M3.0-R1 |
| Local verification changes | Runtime test coverage for the six R1 IPC channels and release documentation. Both package builds used the application code at the candidate commit |
| Remote main before source synchronization | `2d259b281b2a09ebcb62caa5b70b4af52e3a123e`, an ancestor of the candidate |
| Tag | `v0.1.0-beta.1` absent locally and on GitHub at the preflight check |
| Release URL | Pending. The GitHub Release lookup for the target tag returned 404 |
| GitHub Actions | The source push triggers Windows and Linux builds and tests. Artifact upload runs only on version tag pushes |

## Local verification

| Check | Result |
| --- | --- |
| Freezing the dependency graph | `pnpm install --frozen-lockfile` passed on Windows and with `--ignore-scripts --prefer-offline` on Ubuntu 22.04 under WSL2 |
| Tests, types, and workspace builds | 122/122 unit tests, 8/8 runtime checks, typecheck, and build passed on both hosts after updating the IPC test allowlist |
| Electron inputs | Electron 45.4.1 Windows and Linux ZIPs in local caches matched the official SHA-256 digests. electron-builder 26.18.0 generated fresh packages. [Official Electron release](https://github.com/electron/electron/releases/tag/v45.4.1) |
| Windows NSIS | Silent per-user installation, installed EXE hash match, installed Simulation smoke, and uninstall passed |
| Windows unpacked build | Simulation, Electron Renderer and preload, loopback Worker, workspace save/restore, and indexed MCAP playback passed |
| Windows portable ZIP | All 74 entries verified byte for byte against the tested unpacked build |
| Windows security | NSIS and the unpacked application returned `NotSigned`. The configured ASAR integrity, ASAR-only loading, and Node environment/inspector restrictions were verified on the packaged executable. Windows Smart App Control registry state was read as `0` for the approved test host |
| Linux AppImage | x86-64 ELF and Simulation smoke passed on WSLg with AppImage extract-and-run |
| Linux DEB | Package `labscope`, Debian version `0.1.0~beta.1`, architecture `amd64`. Indexed MCAP playback passed from DEB contents extracted to a temporary directory. System installation and AppImage FUSE launch remain untested |
| Windows user data | NSIS sets `deleteAppDataOnUninstall: false`. The installation smoke used temporary profiles |
| AI workflow | Registry and provider entry points covered by runtime tests. Packaged PDF output and live model credentials remain unverified |

Build and smoke logs are in `D:/LabScope/logs/tests`, using the `beta-1-` prefix.

## Local assets

Files are staged under `D:/LabScope/builds/development/v0.1.0-beta.1-287b3f0/assets`. SHA-256 was calculated with PowerShell and all entries in `SHA256SUMS.txt` passed Linux `sha256sum -c`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| LabScope-0.1.0-beta.1-windows-x64-unsigned.exe | 121741165 | `54309b4e8232e4665540c6e0d5807fc9491ffb71023f91364239e8f815d6e731` |
| LabScope-0.1.0-beta.1-windows-x64-portable.zip | 163056058 | `003b0aba068adf50bb9bbfc7926d098a20ea2212a68527f5cebdff716b11bfc9` |
| LabScope-0.1.0-beta.1-linux-x86_64.AppImage | 126381026 | `5337280699eefdd92ef69cc2ed88d7e525badc42e57e3f7499012338d56bd2e4` |
| LabScope-0.1.0-beta.1-linux-amd64.deb | 101587260 | `393a82aad6f9e1a069f34243d565b6eb9206670b44ca5bf51ceebdeeab7970ee` |

For local acceptance, use the four files above and verify the manifest before installation. Public download links are pending the GitHub pre-release. The [release notes](RELEASE_NOTES_v0.1.0-beta.1.md) cover the installation steps, MCAP limits, incomplete Data Center and AI workflows, and hardware validation scope.

## License gate and publication

`FINAL_LICENSE_READINESS.md` was absent at preflight. The clearance audit leaves LabScope ownership, rights for ROS and Foxglove fixtures, and final licensing unresolved. The new package contents add evidence for the binary review. The final NOTICE bundle and redistribution checks, including FFmpeg and the AppImage system libraries, remain outstanding. [License blockers](RELEASE_LICENSE_BLOCKERS.md) · [Clearance audit](provenance/OPEN_SOURCE_CLEARANCE_REPORT.md)

The maintainer authorized synchronization of the source and release documentation to `main`. The Beta tag, pre-release, and asset upload remain pending license clearance. Run the release workflow against the exact commit selected for the tag after clearance.
