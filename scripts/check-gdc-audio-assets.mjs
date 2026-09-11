import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const source = await readFile('public/client/plugins/battle-royale-crate-interaction.js', 'utf8');
const expected = [...source.matchAll(/"\/assets\/audio\/gdc2026\/([^"]+\.mp3)"/g)]
  .map((match) => match[1])
  .sort();
const actual = (await readdir('public/assets/audio/gdc2026'))
  .filter((name) => name.toLowerCase().endsWith('.mp3'))
  .sort();
assert.deepEqual(actual, expected, 'gdc2026 runtime directory must contain exactly the crate-interaction sounds referenced by the client');
console.log(`GDC audio assets OK: ${actual.length} runtime files, no unused source-library sounds.`);
