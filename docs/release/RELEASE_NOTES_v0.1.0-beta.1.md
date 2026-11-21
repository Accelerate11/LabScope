# LabScope v0.1.0-beta.1 — First Public Beta

## Release status

This release preparation targets a GitHub pre-release for LabScope, an open-source robotics experiment workstation for visualization, recording, playback, and AI-assisted experiment analysis.

The current repository is prepared as a **release candidate under a license gate**. A public GitHub Release must wait until source ownership and third-party binary distribution obligations are confirmed.

## Implemented capabilities

- ROS 2 Foxglove WebSocket connectivity, topic discovery, schemas, and CDR decoding
- Simulation-First LiDAR, camera, IMU, TF, robot state, scenarios, and fault injection
- PointCloud2, RGB-D, TF, pose, path, marker, plot, and shared timeline visualization
- Indexed uncompressed MCAP recording and uncompressed/Zstd playback
- Recording pause/resume, segmentation, manifests, events, and SHA-256
- Deterministic MCAP analysis, log parsing, read-only analysis tools, and evidence-oriented reports
- AI Gateway adapters for OpenAI-compatible, Anthropic, Gemini, and a local mock provider
- Persistent AI conversations and Markdown/HTML/PDF report export code

## Known limitations

- LZ4 MCAP and unindexed MCAP scanning are not implemented
- Automatic crash repair and complete disk recovery are not implemented
- Data Center import, archive, restore, delete, export, and report history remain partial
- Provider-native streaming and full native Tool Calling are not complete
- AI evidence click-to-seek Timeline integration is not complete
- PDF export requires packaged Electron validation
- Real API credentials and robot hardware were not tested

## Windows security notice

Windows builds are unsigned by project policy. Windows Smart App Control or reputation-based protection can block unsigned executables. Do not disable security policy to run the software.

## Installation

The future beta assets will include an unsigned Windows x64 NSIS installer and portable archive, plus Linux x64 AppImage and deb packages. Each asset will have a SHA-256 entry in `SHA256SUMS.txt`.

## ROS 2 setup

Use Ubuntu or WSL2 with ROS 2 Humble and `foxglove_bridge`. LabScope does not install ROS 2 on Windows.

## AI setup

Configure a provider in AI Analysis. API keys remain local and use Electron `safeStorage` when available. The Local Mock Provider can run without credentials.

## License status

Apache-2.0 remains a candidate only. This beta is not published until [RELEASE_LICENSE_BLOCKERS.md](RELEASE_LICENSE_BLOCKERS.md) is resolved.

## Feedback

Report reproducible issues through the repository's GitHub Issues page. Remove API keys, private paths, robot addresses, and experiment data from reports.
