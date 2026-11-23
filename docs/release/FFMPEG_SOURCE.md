# LabScope FFmpeg corresponding source

LabScope includes Electron's alternate FFmpeg shared library, under LGPL-2.1-or-later. Electron 45.4.1's alternate build uses Chromium branding and disables proprietary codecs. LabScope's release configurations preserve the library as a separate file. [Electron FFmpeg configuration](https://github.com/electron/electron/blob/v45.4.1/build/args/ffmpeg.gn)

The GitHub release includes the corresponding FFmpeg source, the exact Electron source with its patch series, and these build instructions in the `LabScope-0.1.0-beta.1-ffmpeg-source.tar.gz` asset. The matching Chromium build inputs are pinned by Electron's DEPS. [Release source and binary downloads](https://github.com/Accelerate11/LabScope/releases/tag/v0.1.0-beta.1) · [Electron DEPS](https://github.com/electron/electron/blob/v45.4.1/DEPS) · [Chromium 156.0.8078.100 DEPS](https://chromium.googlesource.com/chromium/src/+/refs/tags/156.0.8078.100/DEPS)

| Input | Version or checksum |
| --- | --- |
| Electron source | v45.4.1, SHA-256 `bb81afc25316e08cb236b417deb255c01052febb6de3c3e9e45e83883026102f` |
| Chromium source and GN build inputs | 156.0.8078.100 |
| Chromium FFmpeg source | `9db86ce5b5b454dfc96c435f9f0723012980c37f`, SHA-256 `8c62dc7cb2d10dec3fd57691489cded4ec4aab2cd6798c68845f7c07335ad8e3` for the included archive |
| Windows x64 FFmpeg alternate archive | SHA-256 `84b570e53ed700e3c24bcfc2781c72510c46542334327074b726fad8f48de4c2` |
| Linux x64 FFmpeg alternate archive | SHA-256 `43072e99e0efbe9e42630392bfc03d4cc99ec46dee57c833961fc89b35572046` |

## Build and replace the library

1. Follow Electron's GN build instructions for Windows x64 or Linux x64. Use the v45.4.1 Electron checkout and the DEPS-pinned Chromium tree. `gclient sync` fetches the pinned dependency revisions and runs the Electron patch hooks. For a standalone source review, the included Chromium FFmpeg archive is unpatched and the Electron archive contains the ordered patch list in `patches/ffmpeg/.patches`. Apply the patches once. [Electron build instructions](https://github.com/electron/electron/blob/v45.4.1/docs/development/build-instructions-gn.md)
2. From the Chromium `src` checkout, run `gn gen out/FFmpeg --args='import("//electron/build/args/ffmpeg.gn") target_cpu="x64"'` in a shell that preserves the inner quotes, then `autoninja -C out/FFmpeg ffmpeg`. Build on the corresponding platform with the toolchain specified by Electron. The output is `ffmpeg.dll` on Windows and `libffmpeg.so` on Linux. [GN arguments](https://github.com/electron/electron/blob/v45.4.1/build/args/ffmpeg.gn)
3. Close LabScope. Replace the library beside the executable in the portable directory or in the DEB installation at `/opt/LabScope`. An administrator may be needed for the installed DEB. Use a compatible build that provides the same exported ABI. Keep the original library outside that folder as a backup. The application leaves the library separate from its ASAR payload. [FFmpeg licensing guidance](https://ffmpeg.org/legal.html)

LabScope's license terms allow modification and debugging of a modified FFmpeg library under the LGPL. See the supplied LGPL text for the full terms.
