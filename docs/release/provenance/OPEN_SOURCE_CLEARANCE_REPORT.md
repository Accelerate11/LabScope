# Open Source Clearance Report

## Audit scope

Project LabScope, local source at `D:/LabScope/source/labOS`, audited at commit `48fa2c4`. The audit inspected Git history, tracked files, source headers, workspace manifests, lockfile metadata, M0 captured schemas and payloads, existing license notes, and the old unsigned Windows development package.

## Summary

| Area | Status | Finding |
| --- | --- | --- |
| Git contributor inventory | CONFIRMED as repository evidence | One human-looking Git identity, `accelerate <3062811267@qq.com>`, plus the remote GitHub placeholder identity. Legal identity and ownership remain UNKNOWN |
| LabScope implementation source | LIKELY | No copied-source headers or external implementation merge found. Legal authorship still requires maintainer confirmation |
| Foxglove compatibility code | LIKELY compatible implementation | No evidence of copied Foxglove source. Bridge binaries and captured metadata require separate attribution review |
| ROS schemas and fixtures | UNKNOWN | Captured definitions and payloads need exact upstream provenance and redistribution confirmation |
| npm/pnpm dependencies | LIKELY manageable | Existing inventory identifies licenses and notices. Final package-specific notice audit remains required |
| Electron/Chromium/FFmpeg binaries | BLOCKED | Old Windows package contains notices, but final Beta Windows/Linux package contents are not available for clearance |
| Images/fonts/brand assets | CONFIRMED for current tree | No tracked image or font assets. Default Electron icon is used |
| Final project license | BLOCKED | Apache-2.0 is a candidate only and no formal LICENSE file exists |

## Can source be publicly distributed?

The repository is already public and contains no detected credential or bundled product asset. This audit does not establish that every source file is legally cleared for redistribution. The maintainer must confirm source ownership, contributor authorization, captured fixture rights, and final license choice before treating the source as fully cleared.

## Can Windows and Linux installers be distributed?

Not yet. Windows has only an old M2.4 unsigned development package in the local release directory. No new beta package was generated, and no Linux AppImage or deb was available for this audit. Final binary distribution is blocked until package contents and all Electron/Chromium/FFmpeg/native notices are checked.

## Required notices

At minimum, preserve Electron and Chromium license documents, FFmpeg and native dependency notices, and each dependency's applicable license text. The exact set must be generated from the final Windows and Linux package contents.

## Recommended candidate

Apache-2.0 is the strongest technical candidate for LabScope's permissive, patent-aware, community and commercial-use goals. This is a recommendation only. The project maintainer and all relevant rights holders must approve it before a formal `LICENSE` file is added.

## Safe release order

1. Complete the human confirmation checklist.
2. Confirm ROS/Foxglove fixture provenance.
3. Confirm final binary notices for both platforms.
4. Select and add the formal license and notices.
5. Build fresh Beta artifacts from the approved commit.
6. Generate and verify SHA-256 values.
7. Run platform acceptance checks.
8. Create `v0.1.0-beta.1` and the GitHub pre-release.

Until steps 1–4 are complete, status is `BLOCKED` for a public binary Beta release. No license was selected, no LICENSE file was created, and no Release or tag was made by this audit.
