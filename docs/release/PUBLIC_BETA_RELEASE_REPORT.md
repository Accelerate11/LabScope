# Public beta release report

## Target

- Version: `0.1.0-beta.1`
- Tag: `v0.1.0-beta.1`
- Repository: https://github.com/Accelerate11/LabScope
- Current local source: `9790a93 feat(m3-r1): persist AI sessions and export PDF reports`

## Local verification

- `pnpm test`: 122/122 passed
- `pnpm test:runtime`: passed
- `pnpm -r typecheck`: passed
- `pnpm -r build`: passed
- Existing packaged M2.4 regressions remain historical evidence only

## Artifact status

- Windows beta installer: NOT GENERATED for this release
- Windows portable ZIP: NOT GENERATED
- Linux AppImage: NOT GENERATED
- Linux deb: NOT GENERATED
- SHA256SUMS.txt for beta: NOT GENERATED

The existing `apps/desktop/release` artifacts are from the M2.4 development build and must not be relabeled as beta.1.

## CI and build blocker

Electron Builder dependency download timed out while preparing a new M3/R1 Windows package. The build cache and network path require a later retry. No unknown Electron binary or security-policy workaround was used.

## License gate

The release is blocked until source ownership, ROS/Foxglove fixture attribution, Electron/Chromium/FFmpeg notices, and platform redistribution obligations are confirmed. See `RELEASE_LICENSE_BLOCKERS.md`.

## Publication status

No tag, GitHub Release, or public beta asset upload was performed.
