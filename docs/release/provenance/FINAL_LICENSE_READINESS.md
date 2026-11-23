# Final license readiness

2026-11-23 · Provenance audit baseline `287b3f0` · Follow-up on `9998c7a`.

| Gate | Status | Evidence |
| --- | --- | --- |
| Original source ownership | MAINTAINER-ATTESTED | The maintainer supplied sole human contribution, authorship, known IP constraints and AI-assistance declarations. [Attestation](MAINTAINER_OWNERSHIP_DECLARATION.md) |
| Original source license | APPROVED FOR PUBLICATION | Exact official ASF text in the repository root, SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`. Original LabScope source is the scope of the maintainer's grant. [LICENSE](../../../LICENSE) · [Official text](https://www.apache.org/licenses/LICENSE-2.0.txt) |
| ROS/Foxglove material and fixtures | VERIFIED | Exact upstream schema provenance and applicable licenses established. The test IMU sample was replaced with the independently corroborated virtual-sensor capture from the final M0 manifest. [Fixture audit](ROS_FIXTURE_AUDIT.md) |
| Source-tree notices | PREPARED | Applicable upstream files retained in the notice kit, including the ROS BSD and Apache texts and Foxglove MIT text. [Notice index](../../../THIRD_PARTY_NOTICES.md) |
| npm and Electron runtime notice packaging | VERIFIED FOR UNPACKED BUILDS | Windows and Linux unpacked packages carry the notice kit plus Electron's supplied license files. The four previously built candidate archives predate the new configuration. |
| Binary inventory | COMPLETED FOR INSPECTED CANDIDATES | The four candidate archives and their package-specific components are recorded. Unresolved exact license findings use `NOASSERTION`. [SPDX](../../../SBOM.spdx.json) · [Binary audit](BINARY_DISTRIBUTION_AUDIT.md) |
| Binary redistribution | BLOCKED | FFmpeg source delivery and replacement validation apply to all four formats. Windows additionally needs to meet the confirmed Microsoft SDK redist terms, and NSIS adds WinShell and plug-in source delivery. AppImage adds legacy runtime build validation and GPL review of its linked indicator libraries. The six Ubuntu library versions, source archives, and copyright notices are staged. [Binary audit](BINARY_DISTRIBUTION_AUDIT.md) |

The updated fixture passed the ROS decoder and the loopback Data Worker integration. The full suite passed 122 unit tests, eight runtime checks, and three integration scenarios. The SPDX document validates against the official 2.3 JSON schema.

## Maintainer approval

The maintainer approved publication of the original-source Apache-2.0 changes and accompanying notices on 2026-11-23. Binary distribution remains subject to the outstanding third-party conditions and checks on rebuilt assets.
