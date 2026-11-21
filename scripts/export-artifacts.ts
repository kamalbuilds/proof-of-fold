// Copies the compiled artifacts next to the source so scripts and the web demo import them without a build step.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('../src/artifacts/', import.meta.url), { recursive: true });
for (const n of ['RootRegistry', 'FoldClaimPool']) copyFileSync(new URL(`../artifacts/solidcash/${n}.json`, import.meta.url), new URL(`../src/artifacts/${n}.json`, import.meta.url));
console.log('artifacts exported');
