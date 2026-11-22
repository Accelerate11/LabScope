# Release license blockers

The v0.1.0-beta.1 public binary release is blocked by unresolved license and distribution review items.

## Recheck on 2026-11-22

The release check used the [clearance audit](provenance/OPEN_SOURCE_CLEARANCE_REPORT.md), [fixture audit](provenance/ROS_FIXTURE_AUDIT.md), and [maintainer checklist](provenance/HUMAN_CONFIRMATION_CHECKLIST.md). No final readiness report, rights-holder confirmation, formal project license, or approved notice bundle was present.

The new Windows unpacked build and Linux DEB contain the Electron and Chromium license files and their platform FFmpeg libraries. The AppImage also contains shared libraries for X11, application indicators, GConf, and desktop notifications. The notice inventory must cover the exact builds, including the AppImage libraries, NSIS components, bundled JavaScript, and any applicable FFmpeg corresponding-source and relinking obligations. [FFmpeg upstream licensing guidance](https://ffmpeg.org/legal.html)

## Open items

- Confirm ownership and contribution provenance for all original LabScope source.
- Confirm attribution and redistribution terms for captured ROS 2 schemas and Foxglove Bridge fixtures.
- Confirm Electron 45.4.1, Chromium, FFmpeg, and platform binary notices for Windows and Linux artifacts.
- Recheck the final Windows and Linux package contents against the third-party inventory.
- Select and publish a formal source license. Apache-2.0 is currently a candidate only.

## Current consequence

No formal `LICENSE` file has been created. No GitHub Release, public binary upload, or pre-release tag should be created until maintainers confirm these items.

The Actions workflow builds and tests pushes to `main`. Artifact upload runs only on version tag pushes. Local Beta candidates are available for acceptance and notice review.
