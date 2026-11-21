# Contributing to LabScope

Thank you for helping improve LabScope. The project is a Windows-first, local-first robotics data workstation with Linux build support.

## Development environment

- Node.js 24.16.0
- pnpm 11.28.5
- Windows 11 for Electron acceptance
- Ubuntu 22.04 and ROS 2 Humble for the optional Foxglove Bridge test stack

Install dependencies and run the normal checks from the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm -r build
pnpm -r typecheck
pnpm test
pnpm test:runtime
```

Keep ROS 2 communication, Viewer3D, CameraViewer, Plot, MCAP, and AI Gateway changes compatible with their existing public interfaces. Preserve deterministic fixtures and prior M0–M2 regression coverage.

## Branches and commits

Use a short branch name that describes the change, such as `fix/mcap-seek` or `docs/provider-setup`. Use imperative commit subjects with a scope when useful, for example `fix(recorder): close segments after queue drain`.

Keep each commit focused. Do not commit `node_modules`, build output, recordings, credentials, private logs, or generated user data.

## Pull requests

A pull request should include:

- A concise description of user-visible behavior
- The affected package or application area
- Tests and build commands run locally
- Any platform-specific limitations
- Documentation updates when behavior or configuration changes

Do not claim hardware validation when a change was tested only with Simulation Engine data. Do not include API keys or private robot data in screenshots, fixtures, logs, or issue reports.

## Code style

Prefer existing types and data paths. Keep IPC input validation in the main process, keep Renderer access behind preload, and use the Unified Message Bus for panel data. Use readable names and avoid unrelated formatting changes.

## License

The LabScope source license is still under maintainer review. Apache-2.0 remains a candidate only. See [LICENSE_STATUS.md](LICENSE_STATUS.md) before adding third-party code or changing notices.
