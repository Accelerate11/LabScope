# Release license blockers

2026-11-23 · The public Beta shipped the Windows portable ZIP and Linux DEB with the LGPL corresponding-source asset. The remaining format-specific conditions apply to NSIS and AppImage. [Release report](PUBLIC_BETA_RELEASE_REPORT.md)

| Affected formats | Outstanding work |
| --- | --- |
| Windows portable ZIP and Linux DEB | The released packages use the exact alternate FFmpeg library. Its corresponding source ships alongside the binaries and the replacement test passed on both platforms. |
| Windows SDK Redist | The released portable ZIP excludes the SDK D3D compiler DLL. Windows acceptance exercised WebGL2 and Three.js on the host graphics stack. |
| Windows NSIS | Close plug-in license, matching-source and notice checks for the exact installer and uninstaller. |
| Linux AppImage | Verify the legacy runtime build inputs and review the GPL-3.0-only libindicator linkage and source delivery, or rebuild without that dependency. |

The artifact-specific evidence and open checks are maintained in the [binary distribution audit](provenance/BINARY_DISTRIBUTION_AUDIT.md).
