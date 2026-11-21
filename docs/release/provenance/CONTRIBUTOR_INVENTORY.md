# Contributor Inventory

## Scope and evidence

The audited repository contains 10 commits reachable from `HEAD` at audit time. `git log --all --format=fuller`, `git shortlog -sne --all`, and the merge graph were inspected. File history begins with the public source commit `416461b` because the local source repository was initialized for the public push. This is repository evidence, not legal authorship evidence.

| Git identity | Evidence | Main contributions | Legal identity status | Action |
| --- | --- | --- | --- | --- |
| `accelerate <3062811267@qq.com>` | 9 source and release commits from `416461b` through `48fa2c4` | Electron app, ROS packages, M2/M3 source, tests, documentation, release preparation | UNKNOWN | Maintainer must confirm the author had authority to contribute all source and fixtures |
| `GitHub <noreply@github.com>` | Remote placeholder commit `d32b15c` | Initial README placeholder | UNKNOWN automated account identity | Confirm that retaining the placeholder history creates no ownership issue |

No other author identity appears in the reachable local history. A merge commit `1fa2247` joins the remote README placeholder history to the public source history. No external source repository merge is present in the local graph.

## Limitations

Git author and committer fields do not prove legal identity, employment status, institutional ownership, copyright assignment, or third-party permission. The project maintainer must confirm these facts before selecting a final license.
