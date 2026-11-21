# RESULTS: libauth-git-dependency

Environment: node v24.22.2, npm 11.19.1, macOS arm64. Base eda85a88d752525ab1fe92f03e9dba04a45b518a. Installs ran with an empty npm user config
(the script replaces it) and `--allow-git=none`.

## 0. The published package fails (reproduction, empty temp dir)

```
$ mkdir /tmp/pr1-repro && cd /tmp/pr1-repro && npm init -y && npm install @solidcash/solidcash@0.50.0
npm error code EALLOWGIT
npm error Fetching packages of type "git" have been disabled
npm error Refusing to fetch "@bitauth/libauth@git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8"
```

(`allow-git=none` was the machine's own npm config. The `@mem-cash/*` packages carry the same spec:
`npm view @mem-cash/electrum@0.0.11 dependencies` lists it.)

## 1. BEFORE the patch: check is red (master manifests, final script)

```
npm install --allow-git=none of the packed @solidcash packages failed:
npm error code EALLOWGIT
npm error Fetching packages of type "git" have been disabled
npm error Refusing to fetch "@bitauth/libauth@git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8"
npm error A complete log of this run can be found in: /Users/kamal/.npm/_logs/2026-11-21T13_24_19_088Z-debug-0.log
Git dependencies declared in this repository:
  @solidcash/utils declares @bitauth/libauth@git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8
  @solidcash/solidc declares @bitauth/libauth@git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8
  @solidcash/solidcash declares @bitauth/libauth@git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8
  @solidcash/testing declares @bitauth/libauth@git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8
rc=1
```

## 2. AFTER the patch, no companion packages: still red, on the dependency outside this repository

```
npm install --allow-git=none of the packed @solidcash packages failed:
npm error code EALLOWGIT
npm error Fetching packages of type "git" have been disabled
npm error Refusing to fetch "@bitauth/libauth@git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8"
npm error A complete log of this run can be found in: /Users/kamal/.npm/_logs/2026-11-21T13_24_48_193Z-debug-0.log
The packages in this repository declare no git dependency, so the one above comes from a dependency outside it. Repack that dependency without it and pass it in EXTRA_TARBALLS to check the rest.
rc=1
```

## 3. AFTER the patch, companion @mem-cash 0.0.11 tarballs repacked with the same dependency change: green

`EXTRA_TARBALLS` = the seven `@mem-cash/*@0.0.11` tarballs from npm, `package.json` rewritten by a script
(`@bitauth/libauth` git spec to the archive URL, nothing else).

```
ok: the packed @solidcash packages install with --allow-git=none
rc=0
```

## 4. Mutation: one package keeps the git spec (solidc), companions as in 3: red

```
npm install --allow-git=none of the packed @solidcash packages failed:
npm error code EALLOWGIT
npm error Fetching packages of type "git" have been disabled
npm error Refusing to fetch "@bitauth/libauth@git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8"
npm error A complete log of this run can be found in: /Users/kamal/.npm/_logs/2026-11-21T13_25_58_516Z-debug-0.log
Git dependencies declared in this repository:
  @solidcash/solidc declares @bitauth/libauth@git+https://github.com/mainnet-pat/libauth.git#1cf4b432864b3a4ed9f33d1992355d7286f3dab8
rc=1
```

## 5. The packed utils tarball alone, after the patch (empty dir, allow-git=none; excerpts of three commands)

```
added 3 packages in 7s
node_modules/@bitauth/libauth/package.json version: 3.1.0-next.8
package-lock: "resolved": "https://github.com/mainnet-pat/libauth/archive/1cf4b432864b3a4ed9f33d1992355d7286f3dab8.tar.gz"
              "integrity": "sha512-eUcg/bgW2OSqi76RH2UKiAzhXLN8Lhl/83MLMwPmyw3PZJ7FSoWVxRrh/HKG7XxtPGLzRdMMH3dOEi9YUhMoKg=="
```

## 6. Rejected alternative: bundleDependencies (finding; excerpts of three commands)

```
$ (packages/utils has "bundleDependencies": ["@bitauth/libauth"]) npm pack
$ tar -tzf solidcash-utils-0.51.0.tgz | grep -c "node_modules/@bitauth/libauth/"
0
$ npm install --allow-git=none solidcash-utils-0.51.0.tgz
added 2 packages in 3s          (libauth is not among them: node_modules/@solidcash/utils/node_modules/@bitauth is absent)
```

Blind spots: the green run uses repacked companion tarballs, not released ones. Only npm 11.19.1 was run. yarn was not
run, so the lockfile edit is unverified by yarn.
