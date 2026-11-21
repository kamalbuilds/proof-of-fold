#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Fails when the published @solidcash packages cannot be installed without git.
//
// Packs every release package and installs the tarballs together into an empty project with git dependencies
// disabled (npm's allow-git=none, which is also what a CI image or a container without git or ssh keys amounts to).
// A package that still declares a git dependency that is not bundled makes npm stop with EALLOWGIT, and so does a
// transitive one. The user and project npm configs are replaced by an empty one so the result does not depend on
// the machine running the check.
//
// EXTRA_TARBALLS (comma separated paths) installs more tarballs alongside, for example the companion @mem-cash packages
// repacked with the same dependency change before that repository has released it.
//
// Run it after `yarn build`: `yarn check:installable-without-git`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageDirs = ['utils', 'solidc', 'solidcash', 'testing', 'solidhat', 'create-solidhat'].map((name) => join(root, 'packages', name));
const work = mkdtempSync(join(tmpdir(), 'solidcash-no-git-'));
const tarballs = join(work, 'tarballs');
const consumer = join(work, 'consumer');
const userNpmrc = join(work, 'user.npmrc');
const globalNpmrc = join(work, 'global.npmrc');
const env = { ...process.env, npm_config_userconfig: userNpmrc, npm_config_globalconfig: globalNpmrc, npm_config_ignore_scripts: 'true' };

const npm = (args, cwd) => execFileSync('npm', args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: 'pipe' });

let failed = false;
try {
  mkdirSync(tarballs);
  mkdirSync(consumer);
  writeFileSync(userNpmrc, '');
  writeFileSync(globalNpmrc, '');
  writeFileSync(join(consumer, 'package.json'), '{ "name": "no-git-consumer", "private": true, "type": "module" }\n');

  const gitSpec = /^(git[+:]|github:|gitlab:|bitbucket:|[\w.-]+\/[\w.-]+(#.*)?$)|\.git(#.*)?$/;
  const declared = [];
  const packed = packageDirs.map((dir) => {
    const { name, version, ...manifest } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [dependency, spec] of Object.entries(manifest[field] ?? {})) {
        if (gitSpec.test(spec)) declared.push(`  ${name} declares ${dependency}@${spec}`);
      }
    }
    const filename = `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
    npm(['pack', '--ignore-scripts', '--pack-destination', tarballs], dir);
    return join(tarballs, filename);
  });

  try {
    const extra = (process.env.EXTRA_TARBALLS ?? '').split(',').filter(Boolean).map((path) => resolve(path));
    npm(['install', '--allow-git=none', '--ignore-scripts', '--no-audit', '--no-fund', ...packed, ...extra], consumer);
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split('\n').filter((line) => /^npm (error|warn)/.test(line));
    const cause = declared.length > 0
      ? `Git dependencies declared in this repository:\n${declared.join('\n')}`
      : 'The packages in this repository declare no git dependency, so the one above comes from a dependency outside it. '
        + 'Repack that dependency without it and pass it in EXTRA_TARBALLS to check the rest.';
    throw new Error(`npm install --allow-git=none of the packed @solidcash packages failed:\n${output.join('\n') || error.message}\n${cause}`);
  }

  // A package whose bundled or tarball dependency is missing still installs without error, so load libauth from each.
  writeFileSync(join(consumer, 'resolve.mjs'), `
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
for (const name of ['utils', 'solidc', 'solidcash', 'testing']) {
  const require = createRequire(new URL(\`./node_modules/@solidcash/\${name}/package.json\`, import.meta.url));
  const libauth = await import(pathToFileURL(require.resolve('@bitauth/libauth')));
  if (libauth.binToHex(libauth.hexToBin('00ff')) !== '00ff') throw new Error(\`@solidcash/\${name}: @bitauth/libauth did not load\`);
}
`);
  execFileSync('node', ['resolve.mjs'], { cwd: consumer, env, stdio: 'pipe' });
  console.log('ok: the packed @solidcash packages install with --allow-git=none');
} catch (error) {
  failed = true;
  console.error(String(error.message ?? error));
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
