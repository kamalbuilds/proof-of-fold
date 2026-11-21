# Upstream pull-request packages for github.com/solidcash/solidcash

Three packages, nothing opened, pushed or posted. Base for all three: `eda85a88d752525ab1fe92f03e9dba04a45b518a` (master, 0.51.0).
The clone is `upstream/work/solidcash` (gitignored, its `origin` removed). Each directory holds `branch.txt`, a `0001-*.patch`
from `git format-patch`, `PR.md`, `RESULTS.md` with the captured red and green runs, and `test/`.

| Directory | Branch in the clone | Patch touches | Stacked on |
| --- | --- | --- | --- |
| `libauth-git-dependency/` | `libauth-git-dependency` (73d0f2240) | four package manifests, root `package.json`, `yarn.lock`, `scripts/check-installable-without-git.mjs` | nothing |
| `stateful-this-age-sequence/` | `stateful-this-age-sequence` (dad668cd7) | one new test file | upstream PR #4 (`setSequence`, head 5b52811f) |
| `merkle-pull-claim-example/` | `merkle-pull-claim-example` (4acf8ce9d) | `examples/merkle_pull_claim/`, one testing-suite test, `website/docs/showcase.md` | upstream PR #4 |

Upstream PR #4 already adds `setSequence(n)` to a stateful call, so the third item is a test-only follow-up on top of it and the
example uses it. Merge order: libauth (independent), #4, then the other two.

## Apply

```bash
cd upstream/work/solidcash
git checkout -b <name> eda85a88d752525ab1fe92f03e9dba04a45b518a
git apply ../../stateful-this-age-sequence/prereq/upstream-pr4.diff && git add -A && git commit -m "base: #4"   # the two stacked ones only
git am ../../<name>/0001-*.patch
```

Each patch also applies on the base alone (`git apply --check` was run); the stacked tests are red there, by design.
Once #4 is merged, skip the prereq step. `git am` was run for all three on fresh clones in /tmp.

## Verification route

The monorepo cannot be installed as is (`resolutions` point at `file:../mem-cash`, and the libauth git spec is blocked by
`allow-git=none`; `yarn` is not installed). It was cloned to a scratch directory outside the repo and installed with
`npm install --ignore-scripts` plus an `overrides` entry that points libauth at `vendor/bitauth-libauth-3.1.0-next.8.tgz`,
then built with `tsc -b tsconfig.packages.json` (`@noble/curves@1.9.7` added with `--no-save`, it is not declared). All three PRs
were verified there against the clone's own source and `dist`, not against the installed 0.50.0 packages. The patch commits
were made in that scratch copy and fetched into the clone; the scratch copy is /tmp/scbuild (temporary, outside the repo).

| PR | Red | Green |
| --- | --- | --- |
| libauth | the check script on master: EALLOWGIT, plus the four declaring packages named | with the seven `@mem-cash/*@0.0.11` tarballs repacked with the same one-line change |
| this.age tests | master without #4: `setSequence is not a function` (3 of 3), and `setSequence` made a no-op | master plus #4: 5 of 5 |
| example | example missing; example present without #4; four guard removals | master plus #4: 6 of 6 |

## Not verified

- libauth: the `@mem-cash/*` packages (separate repository) declare the same git spec, so the check stays red on
  the real registry until that repository releases; the green run used repacked copies. The publish-under-an-npm-name alternative was
  not built (needs a maintainer publish). `yarn.lock` was edited by hand and never run through yarn. The GitHub archive tarball's
  integrity is what GitHub served on 2026-11-21, not the `npm pack` integrity of the commit. npm 11.19.1 only.
- this.age tests: the mock network only; `_pinMasterSequence` is untested by #4 and by this patch (mutation stays green, see RESULTS.md).
- example: `push` and `openPush` are not exercised; `cumulative > already` is not covered (mutation survives); the SDK and testing
  suite run from a scratch build, not the maintainers' yarn layout; the showcase page is a draft page of CashScript projects.
- None of the three was run against a real node, chipnet or mainnet.
