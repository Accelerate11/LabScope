# Source Ownership Audit

Status values use `CONFIRMED`, `LIKELY`, `UNKNOWN`, `BLOCKED`, and `ACTION REQUIRED`.

## Repository-level result

The source tree has a single public source introduction commit and no detected merge from an external implementation repository. Source files do not contain third-party copyright headers or SPDX headers. That supports a `LIKELY` engineering classification for original LabScope implementation, but it cannot establish legal ownership. Every original-source row remains `ACTION REQUIRED` until the maintainer confirms provenance.

| Area | Representative paths | Engineering classification | Evidence | Clearance |
| --- | --- | --- | --- | --- |
| ROS protocol client | `packages/ros-protocol/src/client.ts`, `framing.ts`, `types.ts` | LIKELY LabScope implementation | Introduced in `416461b`, no upstream source header, custom tests and types | ACTION REQUIRED for contributor ownership |
| ROS schema/CDR decoder | `packages/ros-schema/src/*.ts` | LIKELY LabScope implementation | Introduced in `416461b`, custom parser and decoder tests | ACTION REQUIRED for contributor ownership |
| PointCloud renderer | `apps/desktop/src/renderer/src/pointcloud/*` | LIKELY LabScope implementation | Project-specific Three.js engine and tests, no copied header | ACTION REQUIRED for contributor ownership |
| TF/spatial engine | `apps/desktop/src/renderer/src/spatial/*` | LIKELY LabScope implementation | Project-specific data structures and tests | ACTION REQUIRED for contributor ownership |
| Camera and plot | `apps/desktop/src/renderer/src/camera/*`, `plot/*` | LIKELY LabScope implementation | Project-specific React components and decoders | ACTION REQUIRED for contributor ownership |
| Simulation Engine | `packages/simulation-engine/src/*` | LIKELY LabScope implementation | Deterministic scenarios and fault tests introduced in source commit | ACTION REQUIRED for contributor ownership |
| Recording and MCAP integration | `apps/desktop/src/main/recording-manager.ts`, `mcap-playback.ts` | LIKELY LabScope integration | Uses `@mcap/core`, code is project-specific | Separate upstream notice review required |
| AI Gateway and analysis | `apps/desktop/src/main/ai-gateway.ts`, `analysis-service.ts`, `packages/analysis-engine/src/index.ts` | LIKELY LabScope implementation | New project modules, no third-party source headers | ACTION REQUIRED for contributor ownership |
| M0 probe and scripts | `tools/m0-probe`, `scripts/m0` | UNKNOWN / LIKELY mixed | Includes local ROS test scripts and captured schemas | Confirm authorship and fixture rights |
| Documentation | `docs/` | UNKNOWN / mixed | Some reports describe local tests and upstream formats | Review copied excerpts, captures, and attribution |
| Generated lock/build data | `pnpm-lock.yaml`, ignored `out/` and `release/` | GENERATED | Package manager or build output | Retain only where reproducible and permitted |

No file was marked `CONFIRMED ORIGINAL` solely from Git history. No third-party source file was identified by headers or path evidence, but absence of a header is not proof of originality.
