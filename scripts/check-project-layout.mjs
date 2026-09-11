import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

assert.equal(await exists('client'), false, 'Do not recreate root client/. Browser code lives only in public/client/.');
assert.equal(await exists('assets/audio'), false, 'Do not recreate assets/audio/. Game audio lives only in public/assets/audio/.');
assert.equal(await exists('public/client'), true, 'Canonical browser client public/client/ is missing.');
assert.equal(await exists('public/assets/audio'), true, 'Canonical audio directory public/assets/audio/ is missing.');
assert.equal(await exists('index.html'), false, 'Do not recreate root index.html. Static browser files live in public/.');
assert.equal(await exists('styles.css'), false, 'Do not recreate root styles.css. Static browser files live in public/.');
assert.equal(await exists('public/index.html'), true, 'Canonical public/index.html is missing.');
assert.equal(await exists('public/styles.css'), true, 'Canonical public/styles.css is missing.');

const indexHtml = await readFile('public/index.html', 'utf8');
assert.match(indexHtml, /<link[^>]+href=["']\/styles\.css["']/i, 'public/index.html must load canonical /styles.css');
assert.match(indexHtml, /bootstrap\.src\s*=\s*["']\/client\/bootstrap\.js["']/, 'public/index.html must load canonical /client/bootstrap.js');
assert.equal(indexHtml.includes('/audio/'), false, 'public/index.html must not reference legacy /audio/ URLs');
assert.equal(indexHtml.includes('public/client/'), false, 'public/index.html must use served /client/ URLs, not filesystem public/client/ paths');

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const servedClientDocs = tracked.filter((file) => file.startsWith('public/client/') && /\.(?:md|txt|rst)$/i.test(file));
assert.deepEqual(servedClientDocs, [], `Documentation must not be served from public/client/: ${servedClientDocs.join(', ')}`);
const audioExtensions = /\.(?:mp3|wav|ogg|m4a|aac|flac)$/i;
const misplacedAudio = tracked.filter((file) => audioExtensions.test(file) && !file.startsWith('public/assets/audio/'));
assert.deepEqual(
  misplacedAudio,
  [],
  `Tracked game audio must live only under public/assets/audio/: ${misplacedAudio.join(', ')}`,
);

const misplacedClient = tracked.filter((file) => file.startsWith('client/'));
assert.deepEqual(
  misplacedClient,
  [],
  `Browser client files must live only under public/client/: ${misplacedClient.join(', ')}`,
);


const duplicatePublicFiles = [];
for (const file of tracked) {
  if (file.startsWith('public/')) continue;
  if (!await exists(file)) continue;
  const publicCopy = `public/${file}`;
  if (!await exists(publicCopy)) continue;
  const [source, served] = await Promise.all([readFile(file), readFile(publicCopy)]);
  if (source.equals(served)) duplicatePublicFiles.push(`${file} <-> ${publicCopy}`);
}
assert.deepEqual(
  duplicatePublicFiles,
  [],
  `Do not keep duplicate static files outside public/: ${duplicatePublicFiles.join(', ')}`,
);

console.log(`Project layout OK: one client tree and ${tracked.filter((f) => audioExtensions.test(f)).length} tracked audio files in one audio tree.`);
