import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const AUDIO_EXTENSIONS = /\.(?:mp3|wav|ogg|m4a|aac|flac)$/i;

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function filesUnder(dir, predicate = () => true) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(path, predicate));
    else if (entry.isFile() && predicate(path)) out.push(path);
  }
  return out;
}

async function mp3s(dir) {
  return (await readdir(dir)).filter((name) => name.toLowerCase().endsWith('.mp3')).sort();
}

function numbered(prefix, count, start = 1) {
  return Array.from({ length: count }, (_, index) => prefix + (index + start) + '.mp3');
}

const clientFiles = await filesUnder('public/client', (path) => path.endsWith('.js'));
const clientSources = await Promise.all(clientFiles.map(async (file) => ({ file, source: await readFile(file, 'utf8') })));
const combinedClientSource = clientSources.map(({ source }) => source).join('\n');

const staticUrlPattern = new RegExp('["\\\'`](\\/assets\\/audio\\/[^"\\\'`]+?\\.(?:mp3|wav|ogg|m4a|aac|flac))["\\\'`]', 'gi');
const missing = [];
let staticReferences = 0;
for (const { file, source } of clientSources) {
  for (const match of source.matchAll(staticUrlPattern)) {
    const url = match[1];
    if (url.includes('${')) continue;
    staticReferences += 1;
    const diskPath = resolve('public', url.slice(1));
    if (!await exists(diskPath)) missing.push(file + ': ' + url);
  }
}
assert.deepEqual(missing, [], 'Missing audio files referenced by client:\n' + missing.join('\n'));

const trackedAudio = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && file.startsWith('public/assets/audio/') && AUDIO_EXTENSIONS.test(file));

const byHash = new Map();
for (const file of trackedAudio) {
  const hash = createHash('sha256').update(await readFile(file)).digest('hex');
  const group = byHash.get(hash) ?? [];
  group.push(file);
  byHash.set(hash, group);
}

const duplicates = [...byHash.values()].filter((group) => group.length > 1);
assert.deepEqual(
  duplicates,
  [],
  'Duplicate tracked audio content is not allowed:\n' + duplicates.map((group) => group.join(' <-> ')).join('\n'),
);

const warzoneFiles = [
  'public/client/plugins/battle-royale-audio.js',
  'public/client/plugins/battle-royale-zone-audio.js',
];
const warzoneUsed = new Set();
const warzonePattern = /(?:warzoneSound\(|encodeURIComponent\()"([^"]+\.mp3)"\)/g;
for (const file of warzoneFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(warzonePattern)) warzoneUsed.add(match[1]);
}
assert.deepEqual(
  await mp3s('public/assets/audio/warzone'),
  [...warzoneUsed].sort(),
  'public/assets/audio/warzone must contain exactly the files referenced by the Warzone audio plugins',
);

const footstepSets = new Map([
  ['public/assets/audio/footsteps/library/open-esport-concrete', [...numbered('walk-', 8), ...numbered('run-', 8)]],
  ['public/assets/audio/footsteps/library/scp', [...numbered('metal-walk-', 8), ...numbered('metal-run-', 8)]],
]);
for (const [dir, expected] of footstepSets) {
  assert.deepEqual(await mp3s(dir), [...expected].sort(), dir + ' must contain only active footstep variants');
}

const crateSource = await readFile('public/client/plugins/battle-royale-crate-interaction.js', 'utf8');
const gdcExpected = [...crateSource.matchAll(/"\/assets\/audio\/gdc2026\/([^"]+\.mp3)"/g)]
  .map((match) => match[1])
  .sort();
assert.deepEqual(
  await mp3s('public/assets/audio/gdc2026'),
  gdcExpected,
  'gdc2026 runtime directory must contain exactly the crate-interaction sounds referenced by the client',
);

function referencedNames(prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('["\\\']' + escaped + '([^"\\\']+\\.mp3)["\\\']', 'g');
  return [...combinedClientSource.matchAll(pattern)].map((match) => match[1]).sort();
}

const environmentExpected = referencedNames('/assets/audio/environment/');
const vehicleExpected = referencedNames('/assets/audio/vehicles/ts3/');
assert.deepEqual(
  await mp3s('public/assets/audio/environment'),
  environmentExpected,
  'environment runtime directory must exactly match client references',
);
assert.deepEqual(
  await mp3s('public/assets/audio/vehicles/ts3'),
  vehicleExpected,
  'vehicles/ts3 runtime directory must exactly match client references',
);

console.log(
  'Audio assets OK: '
  + trackedAudio.length + ' unique tracked files, '
  + staticReferences + ' static references, '
  + warzoneUsed.size + ' Warzone sounds, '
  + gdcExpected.length + ' GDC sounds, '
  + environmentExpected.length + ' environment sounds, '
  + vehicleExpected.length + ' vehicle sounds.',
);
