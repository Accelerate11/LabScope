# Release license blockers

2026-11-23 · The maintainer approved the original-source licensing change for publication. The binary Beta remains blocked. [Final license readiness](provenance/FINAL_LICENSE_READINESS.md)

| Affected formats | Outstanding work |
| --- | --- |
| All four | Complete FFmpeg corresponding source delivery and verify the replacement or relinking path. Check codec distribution scope. |
| Windows ZIP and NSIS | Apply the confirmed Microsoft SDK downstream terms to the exact Redist DLL or verify a package without it. |
| Windows NSIS | Close plug-in license, matching-source and notice checks for the exact installer and uninstaller. |
| Linux AppImage | Verify the legacy runtime build inputs and review the GPL-3.0-only libindicator linkage and source delivery, or rebuild without that dependency. |
| Rebuilt approved artifacts | Inspect the final archives for notice coverage, regenerate matching SPDX and SHA-256, and run release acceptance. |

The artifact-specific evidence and open checks are maintained in the [binary distribution audit](provenance/BINARY_DISTRIBUTION_AUDIT.md).
