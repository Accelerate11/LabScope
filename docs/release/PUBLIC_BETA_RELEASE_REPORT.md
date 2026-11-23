# LabScope v0.1.0-beta.1 public beta release report

Published as a GitHub pre-release on 2026-11-23.

- Version `0.1.0-beta.1` and tag `v0.1.0-beta.1`
- Source commit [`2b387e0`](https://github.com/Accelerate11/LabScope/commit/2b387e0671368576818ffacc2f2eeb022f750677)
- [GitHub Pre-release](https://github.com/Accelerate11/LabScope/releases/tag/v0.1.0-beta.1)
- [Official GitHub Actions tag build and acceptance run](https://github.com/Accelerate11/LabScope/actions/runs/45157899285)

## Downloads and checksums

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| [LabScope-0.1.0-beta.1-ffmpeg-source.tar.gz](https://github.com/Accelerate11/LabScope/releases/download/v0.1.0-beta.1/LabScope-0.1.0-beta.1-ffmpeg-source.tar.gz) | 39,723,394 | `231afaad1d6833eac184c1ec9df0ce1b8a05132fe2ee411e8356612f3d6151f2` |
| [LabScope-0.1.0-beta.1-linux-amd64.deb](https://github.com/Accelerate11/LabScope/releases/download/v0.1.0-beta.1/LabScope-0.1.0-beta.1-linux-amd64.deb) | 101,829,896 | `cefc569c5708c7ed17908b7da7ce6cebd1d700e8e71e90da2fe381bc51df68f9` |
| [LabScope-0.1.0-beta.1-windows-x64-portable.zip](https://github.com/Accelerate11/LabScope/releases/download/v0.1.0-beta.1/LabScope-0.1.0-beta.1-windows-x64-portable.zip) | 151,356,163 | `390f750409a77c9b3382569e05d295d69a8391a7eb2080a47cde0dab80917989` |
| [SBOM.spdx.json](https://github.com/Accelerate11/LabScope/releases/download/v0.1.0-beta.1/SBOM.spdx.json) | 194,229 | `2040b8088e5fa6405b095d823fe5284e39cf83d7e87f1013415065f3ee4e87b2` |
| [SHA256SUMS.txt](https://github.com/Accelerate11/LabScope/releases/download/v0.1.0-beta.1/SHA256SUMS.txt) | 496 | `a1e68152cee91963dbd4579eaf27dc2b08857da60eba64429274300fb3bde901` |
| [THIRD_PARTY_NOTICES.md](https://github.com/Accelerate11/LabScope/releases/download/v0.1.0-beta.1/THIRD_PARTY_NOTICES.md) | 6,823 | `4e3830dfc26569e0a8e35ba2311ed0683294410e1fa992cadba0b455aec21a08` |

The installed payloads contain 117 Windows and 126 Linux regular files. The SPDX 2.3 inventory was generated from those exact archives and validated against the official schema. The release asset digests match the local SHA-256 calculations and the binary hashes from the tag jobs.

## Build and acceptance

- Official Windows 2025 and Ubuntu 24.04 x64 runners used Node.js 24.16.0, pnpm 11.28.5 with a frozen lockfile, Electron 45.4.1, and Electron Builder 26.18.0. The builds, type checks, 122 unit tests, and eight runtime checks passed.
- The Windows job started LabScope from the extracted portable ZIP. The local Windows 11 candidate also rendered with Three.js and WebGL2 on the NVIDIA RTX 4060 through ANGLE Direct3D11 after dropping the SDK D3D DLL. The simulation, ROS connection interface, workspace with Camera Viewer and Plot, indexed MCAP recording and playback, and AI Workspace with Local Mock passed. Removing the portable folder removes the application files. Experiment data lives outside that folder.
- The Linux job installed the final DEB and verified the Electron main process, renderer, WebGL2 with the SwiftShader OpenGL ES driver, ROS loopback, simulation, indexed MCAP recording and playback, and AI Workspace with Local Mock. The Windows application also passed the simulated full 3D scene test on hardware.
- Both platforms started and ran the synthetic simulation after swapping in a compatible official FFmpeg library in isolated copies. The released binaries retain the pinned alternate FFmpeg library with proprietary codecs disabled. The configured Electron Fuses were verified in both final payloads.

## License and limits

LabScope original source is Apache-2.0. The releases carry the third-party notices and separate LGPL FFmpeg library. The source archive contains the exact Electron and Chromium FFmpeg inputs and the ordered patch series. [Source and replacement instructions](FFMPEG_SOURCE.md)

Windows executables are unsigned. Smart App Control or reputation-based protection may block them. Windows security settings were not changed. NSIS is deferred pending WinShell redistribution clearance. AppImage is deferred pending review of the legacy runtime and GPL-linked indicator libraries.

MCAP LZ4 and unindexed playback, automatic recovery, Data Center completion, and provider-native tool calling remain limited. The acceptance run used simulation and a local AI provider. [Release notes](RELEASE_NOTES_v0.1.0-beta.1.md)
