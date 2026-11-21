# Dependency License Audit

This is an engineering inventory based on workspace `package.json`, `pnpm-lock.yaml`, the existing `docs/third-party-licenses.md`, and the runtime package contents. It is not legal advice and does not replace checking each upstream license file.

| Dependency group | Examples | Use | Current evidence | Clearance |
| --- | --- | --- | --- | --- |
| Electron runtime | Electron 45.4.1, Chromium, Node.js, FFmpeg | Windows/Linux application runtime | Electron package includes `LICENSE.electron.txt` and `LICENSES.chromium.html` in the old Windows package | ACTION REQUIRED for final Windows/Linux notices and FFmpeg obligations |
| Renderer libraries | React 19.3.1, React DOM, Three.js 0.187.0, Zustand, Tailwind CSS | UI, GPU rendering, state, styling | Existing inventory records MIT for core runtime libraries | LIKELY compatible, verify exact package notices |
| MCAP | `@mcap/core` 2.4.0 | Indexed MCAP writer/reader | Package metadata in lockfile and old build | ACTION REQUIRED for bundled notice |
| Compression | `fzstd` 0.1.1 | Zstd playback | Package metadata in lockfile | ACTION REQUIRED for bundled notice |
| Build tooling | Vite, electron-vite, electron-builder, TypeScript, esbuild, CSS tooling | Development and packaging | Lockfile inventory records MPL, Apache, BSD, ISC, CC-BY and other expressions | Determine which assets enter each package |
| Workspace packages | `@labscope/*` | LabScope source modules | Local code, currently private workspace packages | Maintainer ownership confirmation required |

The existing dependency scan records MIT, ISC, Apache-2.0, BSD, Blue Oak, MPL-2.0, CC-BY-4.0, Python-2.0, 0BSD, WTFPL, and SPDX alternatives. No GPL/AGPL/SSPL dependency was identified in the existing inventory, but final package contents still require verification.

No package was reclassified as Apache-2.0. A final release must preserve upstream notices and retain the Electron/Chromium/FFmpeg license documents.
