# LabScope v0.1.0-beta.1 — First Public Beta

## Release status

LabScope is a local-first robotics experiment workstation for visualization, recording, playback, and AI-assisted experiment analysis.

The public pre-release is pending closure of the binary redistribution requirements.

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

## Windows security notice

Windows builds are unsigned by project policy. Windows Smart App Control or reputation-based protection can block unsigned executables. Do not disable security policy to run the software.

## Installation

Once the GitHub pre-release is available, verify the file against `SHA256SUMS.txt` before installation. On Windows x64, run the unsigned NSIS installer or extract the portable ZIP and open `LabScope.exe`. On Linux x86-64, make the AppImage executable and run it as your desktop user, or install the amd64 DEB with `sudo apt install ./LabScope-0.1.0-beta.1-linux-amd64.deb`.

## ROS 2 setup

Use Ubuntu or WSL2 with ROS 2 Humble and `foxglove_bridge`. LabScope does not install ROS 2 on Windows.

## AI setup

Configure a provider in AI Analysis. API keys remain local and use Electron `safeStorage` when available. The Local Mock Provider can run without credentials.

## License status

The maintainer selected Apache-2.0 for original LabScope code. Third-party components retain their own licenses. The remaining binary distribution requirements are tracked in the [release license blockers](RELEASE_LICENSE_BLOCKERS.md).

## Feedback

Report reproducible issues through the repository's GitHub Issues page. Remove API keys, private paths, robot addresses, and experiment data from reports.
