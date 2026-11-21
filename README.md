# LabScope

LabScope is an open-source robotics experiment workstation for visualization, recording, playback, and AI-assisted analysis. It is designed for research teams that need a local-first desktop workflow around ROS 2 data.

Current status is **V1 Foundation / Development Release**. This repository describes only capabilities that are implemented or explicitly marked as planned.

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
- AI Gateway adapters for OpenAI-compatible, Anthropic, and Gemini endpoints
- Windows `safeStorage` API-key protection when the platform credential store is available

### Planned

- LZ4 MCAP writing and reading
- Unindexed MCAP scan and temporary index creation
- Automatic crash repair and disk-full recovery
- Complete Data Center import, export, archive, and experiment editing
- ROS/TXT/JSON log analysis and evidence-linked reports
- Deterministic experiment analysis tools and controlled AI tool registry
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

The Windows package is unsigned by project policy. Build it with:

```powershell
pnpm --filter @labscope/desktop package
```

Linux x64 packages use:

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

AI Providers are configured from the AI Analysis workspace. Enter a provider name, model, HTTPS base URL, and API key. The key is passed to the Electron main process and encrypted with Windows `safeStorage` when available. It is not returned to the Renderer after saving.

The current AI surface sends selected deterministic experiment metadata. It does not upload an entire MCAP file, grant arbitrary filesystem access, or execute system commands. Review data before sending a request to a remote provider.

## Testing

The repository currently verifies:

```powershell
pnpm test
pnpm test:runtime
pnpm -r typecheck
pnpm -r build
pnpm test:integration <path-to-electron>
pnpm test:simulation-ui <path-to-electron>
pnpm test:mcap-packaged <path-to-electron> <path-to-mcap>
```

The current regression baseline is 119 Vitest tests. Simulation and packaged Electron checks use deterministic local fixtures. Real robot hardware, long-duration recording, and real provider credentials are separate validation activities.

## Screenshots

The repository does not include product screenshots yet. The reserved directory is [docs/assets/screenshots](docs/assets/screenshots). Screenshots added there must come from an actual Electron build and must not contain private robot data.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Security reports should follow [SECURITY.md](SECURITY.md).

## License status

LabScope's original-source license is still under maintainer review. Apache-2.0 is a candidate only. See [LICENSE_STATUS.md](LICENSE_STATUS.md) and [docs/third-party-licenses.md](docs/third-party-licenses.md). No formal `LICENSE` file is included until source ownership and third-party notices are confirmed.

## Roadmap

- Complete Data Management
- AI Experiment Analysis
- Cross-Experiment Comparison
- Private Knowledge Base interfaces
- Additional robot protocols
- Plugin ecosystem
