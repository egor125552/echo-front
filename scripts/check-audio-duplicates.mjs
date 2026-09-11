import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const audioExtensions = /\.(?:mp3|wav|ogg|m4a|aac|flac)$/i;
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && file.startsWith('public/assets/audio/') && audioExtensions.test(file));

const byHash = new Map();
for (const file of tracked) {
  const bytes = await readFile(file);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const group = byHash.get(hash) ?? [];
  group.push(file);
  byHash.set(hash, group);
}

const duplicates = [...byHash.values()].filter((group) => group.length > 1);
assert.deepEqual(
  duplicates,
  [],
  `Duplicate tracked audio content is not allowed:\n${duplicates.map((group) => group.join(' <-> ')).join('\n')}`,
);

console.log(`Audio duplicates OK: ${tracked.length} tracked audio files have unique content hashes.`);
