import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repoRoot, 'dist');
const targetArg = process.argv[2];
const targetPath = targetArg || process.env.GOOSE_PIANO_SYNC_TARGET;

if (!targetPath) {
  console.error([
    'Missing sync target.',
    '',
    'Usage:',
    '  npm run sync-site -- ../your-site/<yourpath>',
    '',
    'Or:',
    '  GOOSE_PIANO_SYNC_TARGET=../your-site/<yourpath> npm run sync-site'
  ].join('\n'));
  process.exit(1);
}

const target = path.resolve(repoRoot, targetPath);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });

console.log(`Synced goose piano build to ${target}`);
