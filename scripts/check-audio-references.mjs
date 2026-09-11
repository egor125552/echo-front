import assert from 'node:assert/strict';
import { readdir, readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

async function filesUnder(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(path));
    else if (entry.isFile() && path.endsWith('.js')) out.push(path);
  }
  return out;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

const pattern = /["'`](\/assets\/audio\/[^"'`]+?\.(?:mp3|wav|ogg|m4a|aac|flac))["'`]/gi;
const missing = [];
let checked = 0;

for (const file of await filesUnder('public/client')) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(pattern)) {
    checked += 1;
    const url = match[1];
    if (url.includes('${')) continue;
    const diskPath = resolve('public', url.slice(1));
    if (!await exists(diskPath)) missing.push(`${file}: ${url}`);
  }
}

assert.deepEqual(missing, [], `Missing audio files referenced by client:\n${missing.join('\n')}`);
console.log(`Audio references OK: ${checked} static client URLs resolve inside public/assets/audio/.`);
