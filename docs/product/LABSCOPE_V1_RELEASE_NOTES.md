# LabScope V1 Release Notes

## Current development build

| Area | Status | Evidence or boundary |
| --- | --- | --- |
| ROS 2 connection | PASS | Foxglove WebSocket discovery, subscription and CDR decoding from M0 regression |
| Electron desktop | PASS | Windows x64 packaged Renderer and preload smoke checks |
| Multimodal visualization | PASS | Viewer3D, CameraViewer, Plot, workspace persistence and shared timeline |
| Simulation-First validation | PASS | Deterministic virtual LiDAR, camera, IMU, TF and robot state paths |
| MCAP recording | PASS | Uncompressed indexed writer, bounded queue, pause/resume, segmentation, manifest and SHA-256 |
| MCAP playback | PASS | Indexed uncompressed and Zstd playback paths covered by packaged smoke tests |
| Data Center | PARTIAL | Basic experiment list and recording controls are available |
| AI Gateway | PARTIAL | OpenAI-compatible, Anthropic and Gemini adapters with encrypted API-key storage when Electron safeStorage is available |

## Explicit V1 boundaries

The current development build does not claim support for LZ4 writing or reading, unindexed MCAP scanning and temporary index creation, automatic crash repair, complete experiment import/delete/archive management, ROS/TXT/JSON log parsing, deterministic experiment analysis tools, report export, or a controlled AI tool registry. These items require further implementation and dedicated acceptance tests.

The following are not tested in this delivery. Real robot hardware, 30/60 minute recording stability, disk-full recovery, and calls to real model providers with user credentials. Windows builds are unsigned by project policy and no Windows security policy was changed.

## Verification artifacts

- Automated regression: 119 tests across 18 Vitest files.
- Packaged Electron regression: simulation smoke, Worker integration, workspace restore and MCAP playback smoke.
- Development package: `D:/LabScope/builds/development/m2.4/win-unpacked/LabScope.exe`.
- Regression log: `D:/LabScope/logs/tests/m2-4-electron-regression.log`.
