# fix: install the @solidcash packages without git, and check it

## Summary

`@solidcash/utils`, `solidc`, `solidcash` and `testing` declare `@bitauth/libauth` as
`git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8`
(`solidhat` and `create-solidhat` reach it through them). This PR points the four manifests, the root `resolutions`
entry, `yarn.lock` and the two example manifests at that same commit's GitHub archive tarball, and adds
`scripts/check-installable-without-git.mjs`, which packs every release package and installs the tarballs into an empty
project with `--allow-git=none`.

## Motivation

npm 11 can disable git dependencies (`allow-git=none`), and a CI
image or container without git or ssh keys cannot fetch one either. With either, installing a published package fails
before any code runs:

```
$ npm init -y && npm install @solidcash/solidcash@0.50.0 --allow-git=none
npm error code EALLOWGIT
npm error Fetching packages of type "git" have been disabled
npm error Refusing to fetch "@bitauth/libauth@git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8"
```

Consumers cannot fix this from their side except by adding an `overrides` entry that points libauth at a local tarball.

A remote tarball URL is not a git dependency, so npm accepts it under `allow-git=none`. The pinned commit already holds the
prebuilt `build/` tree and the package `main` points into it, so nothing needs to run on install (the repo's consumers
install with `ignore-scripts=true` as well).

## Changes

- `packages/{utils,solidc,solidcash,testing}/package.json`: `@bitauth/libauth` is
  `https://github.com/mainnet-pat/libauth/archive/1cf4b432864b3a4ed9f33d1992355d7286f3dab8.tar.gz`, the same commit.
- Root `package.json` `resolutions`, `yarn.lock`, `examples/package.json`, `examples/testing-suite/package.json`: same spec.
- `scripts/check-installable-without-git.mjs` and a root script `check:installable-without-git`.

## The check

`yarn check:installable-without-git` (after `yarn build`):

1. `npm pack` each of the six release packages.
2. In an empty temp project, with the user and global npm configs replaced by empty ones so the machine's own settings
   do not matter: `npm install --allow-git=none --ignore-scripts <all six tarballs>`.
3. Load `@bitauth/libauth` from the resolution root of utils, solidc, solidcash and testing. This step exists because a
   package that lists a dependency as bundled but ships none installs without error and breaks at import (see
   "Alternatives").

On failure it prints npm's EALLOWGIT lines and every git dependency the packages in the repository declare.
`EXTRA_TARBALLS=a.tgz,b.tgz` installs further tarballs alongside, for companion packages that are not in this repository.

CI step (not added to the workflow in this PR, see the first limit below), to go after `yarn build`:

```yaml
      - name: Packed packages install without git
        run: yarn check:installable-without-git
```

## Evidence

See RESULTS.md. Before: the check is red, with the EALLOWGIT above and the four declaring packages named. After: green
when the `@mem-cash/*` packages are repacked with the same one-line change, red (EALLOWGIT) without them, and red again
if any one package in this repository keeps the git spec (mutation of solidc).

## How to run

```bash
yarn install --ignore-scripts && yarn build
yarn check:installable-without-git
```

## Alternatives considered

- **Publish the fork under an npm name** (for example `@solidcash/libauth`) and depend on it with an alias that keeps every
  import unchanged: `"@bitauth/libauth": "npm:@solidcash/libauth@3.1.0-next.8"`. This is the durable fix, because a tarball
  on the registry has a stable integrity. It needs a publish by a maintainer, so it is not in this patch and was not
  verified here.
- **`bundleDependencies` for libauth** in each package: tried and dropped. In this yarn-workspace layout libauth is hoisted
  to the repository root, and `npm pack` found nothing to bundle: the packed `@solidcash/utils` held 0 files under
  `node_modules/@bitauth/libauth/`, yet installing it under `allow-git=none` reported "added 2 packages" and left libauth
  missing. A working bundle needs an unhoisted install at pack time plus the check's import step.

## Limits

- The companion packages `@mem-cash/types, storage, validation, core, electrum, server` (0.0.11, a separate repository)
  declare the same git spec. `@solidcash/solidcash` and `@solidcash/testing` depend on them, so the check stays red until
  that repository makes the same change and releases. That is why the CI step is not wired in here. The green run in
  RESULTS.md repacked the seven 0.0.11 tarballs from npm with only that dependency line rewritten, and installed them with
  `EXTRA_TARBALLS`: it shows the chain is complete once they are released, it does not replace their release.
- A GitHub archive's bytes are not guaranteed stable. The lockfile pins what GitHub served today
  (npm integrity `sha512-eUcg/bgW2OSqi76RH2UKiAzhXLN8Lhl/83MLMwPmyw3PZJ7FSoWVxRrh/HKG7XxtPGLzRdMMH3dOEi9YUhMoKg==`, yarn sha1
  fragment `90ea7ff448e61a07987362b6a379cad046acde65`). This is not the integrity of an `npm pack` of the commit
  (`sha512-bo/I5E+uRAyBtpwHAeB9/pq1kHgfmKeTs+1z8EUU1FSEz51BKsSS30f88Lz13UIAnamsxfOmskX7f+flSZaPpw==`). Hosting the packed
  tarball as a release asset, or the registry alias above, removes the dependency on GitHub's archive format.
- Install needs https access to github.com (tarball download), not git or ssh.
- `yarn` was not available, so `yarn.lock` was edited by hand (the git entry and its references) and the monorepo was
  installed and built in a scratch copy with npm and an `overrides` entry, because the `file:../mem-cash` resolutions do not
  exist outside the maintainers' layout. Run `yarn install` once to let yarn rewrite the lockfile itself.
- Checked with npm 11.19.1 and node 24.
