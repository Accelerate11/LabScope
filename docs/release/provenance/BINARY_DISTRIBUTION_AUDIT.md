# Binary Distribution Audit

## Observed Windows package

The existing `apps/desktop/release` contents are an unsigned M2.4 development package. It contains `LabScope.exe`, Electron runtime DLLs, Chromium resource files, `ffmpeg.dll`, locale assets, and `resources/app.asar`. It contains `LICENSE.electron.txt` and `LICENSES.chromium.html`.

This package is not a beta.1 artifact and is not cleared for a new public release. Its presence proves the type of runtime contents that must be audited, not permission to redistribute a new release.

## Linux packages

No Linux AppImage or deb was present in the local release directory during this audit. Linux binary notices and package metadata remain unverified.

## Required release checks

- Compare final Windows and Linux package contents with the dependency inventory.
- Preserve Electron, Chromium, FFmpeg, and dependency notices.
- Confirm whether any platform binary requires source offer or additional attribution.
- Generate platform-specific `SHA256SUMS.txt` only from final, approved assets.
- Do not relabel M2.4 artifacts as beta.1.

Status is `BLOCKED` for binary publication until the final package inventory and license gate are resolved.
