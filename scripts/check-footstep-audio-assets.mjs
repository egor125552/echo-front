import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

function numbered(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}.mp3`);
}

const expected = new Map([
  ['public/assets/audio/footsteps/library/open-esport-concrete', [
    ...numbered('walk-', 8),
    ...numbered('run-', 8),
  ]],
  ['public/assets/audio/footsteps/library/scp', [
    ...numbered('metal-walk-', 8),
    ...numbered('metal-run-', 8),
  ]],
]);

for (const [dir, names] of expected) {
  const actual = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith('.mp3')).sort();
  const wanted = [...names].sort();
  assert.deepEqual(actual, wanted, `${dir} must contain only the footstep variants used by core-sound-pack.js`);
}

console.log('Footstep audio assets OK: concrete and metal runtime libraries contain only active variants.');
