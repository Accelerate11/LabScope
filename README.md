# LabScope

**English** · [简体中文](README.zh-CN.md)

LabScope is a local-first robotics experiment workstation for visualization, recording, playback, and AI-assisted analysis of ROS 2 data.

**LabScope 0.1.0-beta.1** is available as an unsigned Windows x64 portable ZIP and a Linux amd64 DEB. [Download the public Beta](https://github.com/Accelerate11/LabScope/releases/tag/v0.1.0-beta.1) · [Beta release report](docs/release/PUBLIC_BETA_RELEASE_REPORT.md)

## Core features

### Implemented

- ROS 2 connectivity through the Foxglove WebSocket protocol
- Topic discovery, subscription, ROS schema handling, and CDR decoding
- Three.js PointCloud2 rendering with dynamic fields and multiple topics
- RGB, depth, and CameraInfo viewers
- IMU and numeric time-series plots
- TF, fixed-frame, pose, odometry, path, and marker visualization
- Shared timeline for live and indexed MCAP playback
- Simulation Engine with deterministic seeds, scenarios, and fault injection
- Multi-topic RecordingManager with pause/resume, bounded queues, segmentation, manifests, and SHA-256
- Indexed uncompressed MCAP recording and indexed uncompressed/Zstd playback
- Electron desktop runtime for Windows x64 and Linux x64 build targets
- AI Gateway adapters for OpenAI-compatible, Anthropic, and Gemini endpoints, plus a credential-free Local Mock Provider
- Deterministic analysis of indexed MCAP, local text log parsing and clustering, a read-only tool registry, and Markdown and HTML reports
- Windows `safeStorage` API-key protection when the platform credential store is available

### Planned

- LZ4 MCAP writing and reading
- Unindexed MCAP scan and temporary index creation
- Automatic crash repair and disk-full recovery
- Complete Data Center import, export, archive, and experiment editing
- Clickable report evidence that seeks the linked position on the timeline
- Cross-experiment comparison, private knowledge base interfaces, and plugin APIs

## Architecture

```text
ROS 2 / Foxglove Bridge       Simulation Engine
             |                         |
             +------ Data Worker -----+
                         |
                  Unified Message Bus
                         |
       +-----------------+------------------+
       |                 |                  |
   Viewer3D         CameraViewer          Plot
       |                 |                  |
       +----------- Unified Timeline -------+
                         |
                    Playback / MCAP
                         |
               Electron Main Process
             RecordingManager / AI Gateway
```

The Renderer never opens an independent ROS connection. Raw recording is separate from rendering and uses a bounded queue. The Preload bridge exposes a narrow IPC surface with context isolation and Node integration disabled.

## Repository layout

```text
apps/desktop/       Electron main process, preload, Renderer, and Worker
packages/           ROS schema, protocol, data-source, and simulation packages
tools/              M0 protocol probe
scripts/            ROS 2 and development helpers
docs/m0/            ROS 2 protocol evidence and schemas
docs/m1/            Desktop runtime reports
docs/m2/            Visualization, timeline, and MCAP documentation
docs/m3/            AI workspace, deterministic analysis, tools, and report documentation
docs/product/       V1 product, architecture, data, AI, and user guides
.github/workflows/  Reproducible CI build and test workflow
```

## Installation and development

Requirements are Node.js 24.16.0 and pnpm 11.28.5.

```powershell
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm -r build
pnpm -r typecheck
pnpm test
pnpm test:runtime
pnpm --filter @labscope/desktop dev
```

To build the unsigned Windows x64 portable ZIP, run the following command.

```powershell
pnpm --filter @labscope/desktop package
```

To build the Linux amd64 DEB, run the following command.

```powershell
pnpm --filter @labscope/desktop package:linux
```

Build outputs are written to `apps/desktop/release` and are intentionally ignored by Git. Do not commit packaged binaries, `node_modules`, local recordings, or user credentials.

## ROS 2 connection

LabScope does not install ROS 2 on Windows. Run ROS 2 and `foxglove_bridge` on Ubuntu or WSL2, then connect the desktop to the bridge WebSocket endpoint.

```bash
sudo apt install -y ros-humble-foxglove-bridge
bash scripts/m0/ros2/stage_into_wsl.sh
bash /root/labscope/ros2/start_stack.sh 8765
```

In the Live view, enter an endpoint such as `ws://127.0.0.1:8765` or a bridge address reachable from the Windows host. The default application mode is read-only monitoring.

## AI configuration

Configure AI providers in the AI Analysis workspace. Use the Local Mock Provider to try the workflow without a key. For a remote provider, enter its name, model, HTTPS base URL, and API key. The Electron main process handles the key and uses Windows `safeStorage` for encryption when available. After saving, the Renderer receives only the key's presence status.

The current AI surface sends selected deterministic experiment metadata. It does not upload an entire MCAP file, grant arbitrary filesystem access, or execute system commands. Review data before sending a request to a remote provider.

## Testing

Run the following commands to verify the source and packaged application.

```powershell
pnpm test
pnpm test:runtime
pnpm -r typecheck
pnpm -r build
pnpm test:integration <path-to-electron>
pnpm test:simulation-ui <path-to-electron>
pnpm test:mcap-packaged <path-to-electron> <path-to-mcap>
```

The public Beta release passed 122 unit tests and eight runtime checks. Simulation and packaged Electron checks use deterministic local fixtures. Real robot hardware, long-duration recording, and real provider credentials are separate validation activities. [Beta release report](docs/release/PUBLIC_BETA_RELEASE_REPORT.md)

## Screenshots

The repository does not include product screenshots yet. The reserved directory is [docs/assets/screenshots](docs/assets/screenshots). Screenshots added there must come from an actual Electron build and must not contain private robot data.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Security reports should follow [SECURITY.md](SECURITY.md).

## License status

Original LabScope code is available under [Apache-2.0](LICENSE). Upstream components retain the terms listed in [Third-party notices](THIRD_PARTY_NOTICES.md). The [license readiness report](docs/release/provenance/FINAL_LICENSE_READINESS.md) tracks the remaining binary distribution requirements.

## Roadmap

- Complete Data Management
- Expanded AI experiment analysis and timeline links for evidence
- Cross-Experiment Comparison
- Private Knowledge Base interfaces
- Additional robot protocols
- Plugin ecosystem
