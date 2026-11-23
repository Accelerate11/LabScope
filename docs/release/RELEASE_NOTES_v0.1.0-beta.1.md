# LabScope v0.1.0-beta.1 — Public Beta

## LabScope introduction

LabScope is a local-first robotics experiment workstation for visualization, recording, playback, and AI-assisted experiment analysis.

## Supported downloads

- **Windows x64** has an unsigned portable ZIP. The NSIS installer is deferred while its WinShell redistribution terms are unresolved.
- **Linux amd64** has a Debian package. AppImage is deferred while its legacy runtime and bundled GPL-linked libraries are under review.

## Implemented capabilities

- ROS 2 Foxglove WebSocket connectivity, topic discovery, schemas, and CDR decoding
- Simulation-First LiDAR, camera, IMU, TF, robot state, scenarios, and fault injection
- PointCloud2, RGB-D, TF, pose, path, marker, plot, and shared timeline visualization
- Indexed uncompressed MCAP recording and uncompressed/Zstd playback
- Recording pause/resume, segmentation, manifests, events, and SHA-256
- Deterministic indexed MCAP analysis for topic timing, IMU magnitudes, and point-cloud counts
- Local text log parsing and clustering, a read-only tool registry, and evidence-oriented reports
- AI Gateway adapters for OpenAI-compatible, Anthropic, Gemini, and a local mock provider
- Local AI conversation storage and Markdown and HTML report export

## Known limitations

- LZ4 MCAP and unindexed MCAP scanning are not implemented
- Automatic crash repair and complete disk recovery are not implemented
- Data Center import, archive, restore, delete, export, and report history remain partial
- Provider-native streaming and full native Tool Calling are not complete
- AI evidence click-to-seek Timeline integration is not complete
- PDF export is available in the interface and still requires packaged workflow validation
- Real API credentials and robot hardware were not tested
- The bundled FFmpeg variant excludes proprietary codecs. The RGB-D viewer accepts the supported ROS image payloads.

## Windows security notice

Windows builds are unsigned by project policy. Windows Smart App Control or reputation-based protection can block unsigned executables. Do not disable security policy to run the software.

## Installation

Verify the downloaded file against `SHA256SUMS.txt`. On Windows x64, extract the ZIP to a directory you own and open `LabScope.exe`. Remove that directory to uninstall the portable build. On a compatible Debian-based Linux x64 system, install with `sudo apt install ./LabScope-0.1.0-beta.1-linux-amd64.deb` and launch LabScope from the desktop menu or with `labscope`.

Fresh installations save recordings under the application's per-user data directory. Existing Windows installations with `D:/LabScope/data/experiments` continue using that directory.

## ROS 2 setup

Use Ubuntu or WSL2 with ROS 2 Humble and `foxglove_bridge`. LabScope does not install ROS 2 on Windows.

## AI setup

Configure a provider in AI Analysis. API keys remain local and use Electron `safeStorage` when available. The Local Mock Provider can run without credentials.

## License status

Original LabScope source is Apache-2.0. Third-party components retain their own licenses. See the release assets for third-party notices, the SPDX SBOM, and FFmpeg corresponding source. [FFmpeg build and replacement instructions](https://github.com/Accelerate11/LabScope/blob/v0.1.0-beta.1/docs/release/FFMPEG_SOURCE.md)

## Feedback

Report reproducible issues through [GitHub Issues](https://github.com/Accelerate11/LabScope/issues). Remove API keys, private paths, robot addresses, and experiment data from reports.
