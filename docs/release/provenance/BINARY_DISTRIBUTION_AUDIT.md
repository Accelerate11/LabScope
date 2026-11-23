# Binary distribution inventory

2026-11-23 · Audited the four local 0.1.0-beta.1 candidates built from `287b3f0`. [SPDX inventory and candidate checksums](../../../SBOM.spdx.json)

| Payload | Windows NSIS and portable ZIP | Linux DEB and AppImage | Disposition |
| --- | --- | --- | --- |
| Electron 45.4.1 and Chromium 156.0.8078.100 | LabScope.exe, electron_wer.dll, PAKs, locales, snapshots and ICU data | labscope, chrome-sandbox, chrome_crashpad_handler, PAKs, locales, snapshots and ICU data | Preserve `LICENSE.electron.txt` and `LICENSES.chromium.html` from each platform's own Electron archive. [Release](https://github.com/electron/electron/releases/tag/v45.4.1) · [Build pins](https://github.com/electron/electron/blob/v45.4.1/DEPS) |
| Node.js 24.22.3 | Built into Electron | Built into Electron | Preserve exact Node release license and bundled notices. [Node notices](../../../third-party/licenses/node-v24.22.3.txt) |
| FFmpeg | ffmpeg.dll | libffmpeg.so | Chromium fork and Electron patch series identified. Both x64 Chrome configs disable GPL, nonfree and version-3 options. Linux binary reports LGPL 2.1 or later. Source delivery and replaceability checks below apply. |
| Graphics and compute | dxcompiler.dll (Dawn custom build, 1.9.2609.0), vk_swiftshader.dll, vulkan-1.dll, vk_swiftshader_icd.json | libvk_swiftshader.so, libvulkan.so.1, vk_swiftshader_icd.json | Preserve DirectX Shader Compiler, SwiftShader and Vulkan credits in Chromium's aggregate license file. |
| Microsoft D3D compiler | d3dcompiler_47.dll, PE version 10.0.28000.2270 | — | The DLL matches the SDK's documented x64 Redist binary. The Windows release must meet the SDK downstream terms or omit the DLL after compatibility testing. |
| App code | resources/app.asar | resources/app.asar | Main, preload and renderer bundle the application and JS/CSS dependencies listed in the notice. There were zero `.node` files in the archive or unpacked candidate application trees. Build-only native tooling and host libraries are not application add-ons. [Notices](../../../THIRD_PARTY_NOTICES.md) |
| Packaging layers | ZIP is an archive of the desktop payload. NSIS adds installer/uninstaller stubs, NSIS and external plug-ins, and an app-64.7z payload. | DEB adds Debian package metadata, host dependencies and desktop integration. AppImage adds an ELF runtime, AppRun, a default Electron ASAR and six shared libraries. | See the format-specific findings below. |

## FFmpeg corresponding source

- Chromium `156.0.8078.100` pins FFmpeg `9db86ce5b5b454dfc96c435f9f0723012980c37f`. Electron pins that Chromium release and applies the ordered series in `patches/ffmpeg/.patches`. Its `build/args/all.gn` uses Chrome branding and enables proprietary codecs. Its `build/args/release.gn` builds FFmpeg as a separate shared library. The Chromium snapshot contains the generated `chromium/config/Chrome/{win,linux}/x64` config and build files. [Chromium DEPS](https://github.com/chromium/chromium/blob/156.0.8078.100/DEPS) · [Electron patch series](https://github.com/electron/electron/tree/v45.4.1/patches/ffmpeg) · [Electron GN args](https://github.com/electron/electron/tree/v45.4.1/build/args)
- The complete upstream source archives were downloaded and checked locally. The artifact preparation directory `D:/LabScope/builds/development/license-verification-9998c7a/corresponding-source` contains the Electron source (SHA-256 `bb81afc25316e08cb236b417deb255c01052febb6de3c3e9e45e83883026102f`) and Chromium FFmpeg source (SHA-256 `8c62dc7cb2d10dec3fd57691489cded4ec4aab2cd6798c68845f7c07335ad8e3`). Both are inputs to the release source kit.
- Before binary release, make corresponding source available from the binary download location and include the pinned Chromium build inputs, exact Electron patch application, target build settings, instructions for rebuilding and replacing the shared library, and an LGPL notice with the source location. Verify replacement using a compatible independently rebuilt library, or satisfy the applicable relinking alternative. Keep user terms compatible with the library license's modification and debugging rights. Proprietary codec distribution rights depend on distribution scope and are separate from the LGPL code license. [FFmpeg legal guidance](https://ffmpeg.org/legal.html)
- The Electron source archive includes the release build instructions. Use the tagged Electron `DEPS` and documented gclient checkout to pull the pinned Chromium and FFmpeg trees, then use the distributable GN settings for the applicable x64 target to build the shared FFmpeg library. Verify that the release process preserves the generated DLL or SO as a separate replaceable file. Record the GN args, Electron and Chromium commits, patch application, resulting library checksum, and results of launching and exercising media with the replacement. [Electron build instructions](https://github.com/electron/electron/blob/v45.4.1/docs/development/build-instructions-gn.md)

## Microsoft Windows SDK redistributable

The signed `d3dcompiler_47.dll` matches `c/Redist/D3D/x64/d3dcompiler_47.dll` from Microsoft's `Microsoft.Windows.SDK.CPP` NuGet package, version `10.0.28000.2270`, byte-for-byte. SHA-256 is `f5c95e919b4ffa1ac71049cd45b9f986d2965e6888395ca2806337985334fa56`. Microsoft's REDIST list identifies the x64 DLL for classic Windows applications. The SDK terms attach downstream agreement, copyright, redistribution, and indemnity conditions. Confirm the agreed distribution terms and their delivery for both ZIP and NSIS, or verify an approved package without the DLL. [Exact Microsoft SDK package](https://www.nuget.org/packages/Microsoft.Windows.SDK.CPP/10.0.28000.2270) · [SDK terms](https://aka.ms/WinSDKLicenseURL) · [REDIST list](https://go.microsoft.com/fwlink/?LinkId=524842)

## NSIS installer

The outer installer was inspected as NSIS and as an embedded non-solid 7z archive. The installer payload contains `System.dll`, `nsDialogs.dll`, `nsExec.dll`, `UAC.dll`, `StdUtils.dll`, `nsis7z.dll`, `WinShell.dll`, a bundled wizard bitmap, and the uninstaller. All six DLLs in the uninstaller are byte-identical to their installer copies. Upstream NSIS COPYING covers NSIS's own stubs, standard plug-ins and compression modules. The external plug-ins require their individual terms. [NSIS COPYING](../../../third-party/licenses/nsis-3.0.4.1.txt)

| Plug-in | Upstream evidence and release action |
| --- | --- |
| UAC | Shipped x86 Unicode binary matches the author's 0.2.4c archive byte-for-byte. The bundled upstream license states zlib terms and includes the rights-holder attribution. [UAC plug-in](https://nsis.sourceforge.io/UAC_plug-in) |
| StdUtils | Shipped x86 Unicode binary matches the 1.14 upstream ZIP. Retain its LGPL terms, copyright and installer clarification. The matching source tag is archived locally for release-source delivery. [StdUtils upstream](https://github.com/lordmulder/stdutils/tree/1.14) |
| Nsis7z | Shipped x86 Unicode binary matches the upstream 19.00 archive, which includes plug-in source and Visual Studio build inputs. Preserve its own license and those of 7-Zip 19.00. Both source archives are staged locally. Verify the exact linked 7-Zip license subset and package the corresponding source for download. Electron Builder's separate 7-Zip build tool is outside this payload. [Nsis7z upstream](https://nsis.sourceforge.io/Nsis7z_plug-in) · [7-Zip source downloads](https://www.7-zip.org/download.html) |
| WinShell | Shipped x86 Unicode DLL matches the author's 20121005 archive, which contains the DLLs only. The author lists freeware without an explicit redistribution grant on the download page. Obtain applicable terms or use a cleared replacement and recheck the installer. [WinShell upstream](https://nsis.sourceforge.io/WinShell_plug-in) |

## AppImage shared libraries and runtime

The AppImage contains the six libraries listed by electron-builder's tagged packaging script. Each ELF file matched the corresponding Ubuntu `amd64` package byte-for-byte. The notice kit preserves the package copyright files and the referenced GNU licenses. The Ubuntu source archives and packaging deltas are staged locally and match the SHA-256 manifests in their `.dsc` files. [Tagged packaging script](https://github.com/electron-userland/electron-builder-binaries/blob/appimage-12.0.1/appImage-packages-x64.sh) · [AppImage notices](../../../THIRD_PARTY_NOTICES.md#appimage-only-notices)

| Shipped file | Ubuntu package and version | ELF Build ID |
| --- | --- | --- |
| libXss.so.1 | libxss1 `1:1.2.2-1` | `82c0e3569eb993bf2c2e2bb8379b1564fe28eebf` |
| libXtst.so.6 | libxtst6 `2:1.2.2-1` | `0403493a3501094414e75b977548928a413d8146` |
| libappindicator.so.1 | libappindicator1 `12.10.1+13.10.20130920-0ubuntu4` | `3952e6e8393caf73029e13d642c28e822ee50521` |
| libgconf-2.so.4 | libgconf-2-4 `3.2.6-0ubuntu2` | `ac0a2bc11dc7505e276c0327b1c1897a997ba02c` |
| libindicator.so.7 | libindicator7 `12.10.2+14.04.20140402-0ubuntu1` | `089a982c5c6194888bb10d378a2f29f719bcddef` |
| libnotify.so.4 | libnotify4 `0.7.6-1ubuntu3` | `bc29207f80a6b64aec329dd8397df57672ee132e` |

The Ubuntu notice and upstream library implementation both identify libindicator7 as GPL-3.0-only. The shipped `libappindicator.so.1` links to it through ELF `DT_NEEDED`. Review distribution of that linked set and the corresponding-source obligations, or replace the toolset and confirm that the dependency is absent. These six libraries are absent from the DEB payload. [GPL 3.0](https://www.gnu.org/licenses/gpl-3.0.html)

The first 188,392 bytes of the AppImage match the toolset’s ELF runtime exactly (SHA-256 `24da8e0e149b7211cbfb00a545189a1101cb18d1f27d4cfc1895837d2c30bc30`). The runtime reports AppImageKit commit `effcebc`. That commit pins libappimage `13f401a4a384ec59ec9a144e2a7006adf751571f`, whose default build uses patched squashfuse `1f98030` and XZ/liblzma 5.2.3. Their source archives and notices are staged, including an XZ archive that matches the pinned SHA-512. The ELF imports host zlib, libc, libdl and libpthread. The exact legacy binary build configuration and final public source delivery remain to be verified. [Runtime source](https://github.com/AppImage/AppImageKit/tree/effcebc) · [libappimage dependency pins](https://github.com/AppImage/libappimage/blob/13f401a4a384ec59ec9a144e2a7006adf751571f/cmake/dependencies.cmake)

## Verification boundaries

The four candidates predate the new notice packaging configuration. Their hashes identify inspected inputs. New Windows and Linux unpacked builds each contained all 45 notice-kit files byte-for-byte under `resources/licenses`, alongside Electron's supplied notices. The release gate requires rebuilt archives and an inventory/hash comparison of the actual distributed files after the outstanding format-specific terms are closed.
