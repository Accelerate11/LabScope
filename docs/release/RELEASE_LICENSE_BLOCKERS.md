# Release license blockers

2026-11-23 · The maintainer approved the original-source licensing change for publication. The public Beta qualifies the portable Windows ZIP and Linux DEB. [Final license readiness](provenance/FINAL_LICENSE_READINESS.md)

| Affected formats | Outstanding work |
| --- | --- |
| Windows portable ZIP and Linux DEB | The build verifies the exact alternate FFmpeg library. Publish its corresponding source and instructions alongside the binaries and verify replacement with a compatible library. |
| Windows SDK Redist | The portable ZIP excludes the SDK D3D compiler DLL. The Windows acceptance test exercises WebGL2 and Three.js on the host graphics stack. |
| Windows NSIS | Close plug-in license, matching-source and notice checks for the exact installer and uninstaller. |
| Linux AppImage | Verify the legacy runtime build inputs and review the GPL-3.0-only libindicator linkage and source delivery, or rebuild without that dependency. |
| Rebuilt qualified artifacts | Inspect the final archives for notice coverage, generate matching SPDX and SHA-256, and run release acceptance. |

The artifact-specific evidence and open checks are maintained in the [binary distribution audit](provenance/BINARY_DISTRIBUTION_AUDIT.md).
