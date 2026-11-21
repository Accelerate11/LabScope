# Release license blockers

The v0.1.0-beta.1 public binary release is blocked by unresolved license and distribution review items.

## Open items

- Confirm ownership and contribution provenance for all original LabScope source.
- Confirm attribution and redistribution terms for captured ROS 2 schemas and Foxglove Bridge fixtures.
- Confirm Electron 45.4.1, Chromium, FFmpeg, and platform binary notices for Windows and Linux artifacts.
- Recheck the final Windows and Linux package contents against the third-party inventory.
- Select and publish a formal source license. Apache-2.0 is currently a candidate only.

## Current consequence

No formal `LICENSE` file has been created. No GitHub Release, public binary upload, or pre-release tag should be created until maintainers confirm these items.

The source repository can continue to receive normal development commits. Unsigned development builds remain distinct from a public beta release.
