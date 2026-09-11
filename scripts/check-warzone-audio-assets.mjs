import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const sources = [
  'public/client/plugins/battle-royale-audio.js',
  'public/client/plugins/battle-royale-zone-audio.js',
];
const used = new Set();
const pattern = /(?:warzoneSound\(|encodeURIComponent\()"([^"]+\.mp3)"\)/g;
for (const file of sources) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(pattern)) used.add(match[1]);
}

const actual = (await readdir('public/assets/audio/warzone'))
  .filter((name) => name.toLowerCase().endsWith('.mp3'))
  .sort();
const expected = [...used].sort();
assert.deepEqual(
  actual,
  expected,
  'public/assets/audio/warzone must contain exactly the files referenced by the Warzone audio plugins',
);
console.log(`Warzone audio assets OK: ${actual.length} runtime files, no unused archive sounds.`);
