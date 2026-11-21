# First public source push report

This report records the repository preparation for the first public source push of LabScope V1 Foundation.

## Repository

- Repository: https://github.com/Accelerate11/LabScope
- Branch: `main`
- Commit message: `Initial public source release: LabScope V1 foundation`
- Source commit: `416461bd5c2f33e99cd5eb35e065d7fbca4fd903`
- Pushed branch head after preserving the remote placeholder history: `1e9c4b40736ad09c826a3e5c73bf5a532ba9005e`
- Source root: `D:/LabScope/source/labOS`

## Included source scope

The public tree includes the Electron desktop application, ROS schema and protocol packages, Simulation Engine, M0 probe, tests, deterministic fixtures, development scripts, M0–M2 documentation, V1 product documentation, CI workflow, and contribution/security guidance.

The tree excludes dependency directories, build output, packaged binaries, local recordings, databases, logs, crash dumps, credentials, certificates, and editor state.

The initial public source commit contains 238 files. The remote repository's existing README commit was retained as the first parent through a normal non-forced merge.

## Verification

- `pnpm test`: 119/119 Vitest tests passed
- `pnpm test:runtime`: passed
- `pnpm -r typecheck`: passed
- `pnpm -r build`: passed
- Packaged Simulation smoke: passed
- Packaged Worker Integration: passed
- Packaged Workspace Restore: passed
- Packaged MCAP Playback: passed
- Secret scan: repository text scan completed with no credential-pattern matches
- License audit: preliminary inventory passed, maintainer/legal confirmation remains open

## Current limitations

The public release is a V1 Foundation / Development Release. LZ4 MCAP, unindexed MCAP scan, automatic crash recovery, advanced Data Center management, full log analysis, deterministic experiment analysis tools, report export, real hardware validation, and long-duration recording remain future work.

Windows packages are unsigned by project policy. No Windows security policy was changed during preparation.

## GitHub Actions

`.github/workflows/build.yml` runs build, typecheck, unit tests, runtime checks, and platform packaging on pushes and pull requests. Windows artifacts are explicitly named unsigned. The workflow does not publish a GitHub Release automatically.

The first source push completed with `git push -u origin main`. No force push was used.

After the first CI run exposed Windows CRLF fixture handling, commit `1e9c4b4` normalized schema fixture line endings. Local tests and type checks passed before that corrective push.

## License status

Apache-2.0 remains a candidate only. See [LICENSE_STATUS.md](../../LICENSE_STATUS.md) and [docs/third-party-licenses.md](../third-party-licenses.md).
