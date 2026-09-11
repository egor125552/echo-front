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

async function assertAudioFiles(urls, label) {
  const missingFiles = [];
  for (const url of urls) {
    const diskPath = resolve('public', url.replace(/^\//, ''));
    if (!await exists(diskPath)) missingFiles.push(url);
  }
  assert.deepEqual(missingFiles, [], label + ':\n' + missingFiles.join('\n'));
}

const parachuteSource = await readFile('public/client/plugins/parachute-audio-preload.js', 'utf8');
const parachuteRoot = '/assets/audio/core/parachute';
const parachuteUrls = [...parachuteSource.matchAll(/`\$\{ROOT\}\/([^`]+?\.mp3)`/g)]
  .map((match) => parachuteRoot + '/' + match[1]);
await assertAudioFiles(parachuteUrls, 'Missing parachute audio files');

const concreteRoot = '/assets/audio/footsteps/library/open-esport-concrete/';
const concreteRequired = [
  ...numbered('walk-', 8),
  ...numbered('jog-', 8),
  ...numbered('run-', 8),
  ...numbered('walk-stop-', 4),
  ...numbered('jog-stop-', 4),
  ...numbered('run-stop-', 4),
  ...numbered('jump-', 4),
  ...numbered('land-', 4),
].map((name) => concreteRoot + name);
await assertAudioFiles(concreteRequired, 'Missing concrete movement audio files');

const staticClientAudio = new Set();
for (const { source } of clientSources) {
  for (const match of source.matchAll(/["'`](\/assets\/audio\/[^"'`]+?\.mp3)["'`]/g)) {
    if (!match[1].includes('${')) staticClientAudio.add(match[1]);
  }
}
await assertAudioFiles([...staticClientAudio], 'Missing directly referenced client audio files');

console.log(
  'Audio assets OK: '
  + trackedAudio.length + ' unique tracked files, '
  + staticReferences + ' static references, '
  + parachuteUrls.length + ' parachute sounds, '
  + concreteRequired.length + ' preserved concrete movement sounds.',
);
