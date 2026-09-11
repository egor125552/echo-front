import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function mp3s(dir) {
  return (await readdir(dir)).filter((name) => name.toLowerCase().endsWith('.mp3')).sort();
}

async function jsFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...await jsFiles(path));
    else if (entry.isFile() && path.endsWith('.js')) out.push(path);
  }
  return out;
}

const sources = await jsFiles('public/client');
const clientSource = (await Promise.all(sources.map((file) => readFile(file, 'utf8')))).join('\n');

function referencedNames(prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`['\"]${escaped}([^'\"]+\\.mp3)['\"]`, 'g');
  return [...clientSource.matchAll(pattern)].map((match) => match[1]).sort();
}

const environmentExpected = referencedNames('/assets/audio/environment/');
assert.deepEqual(
  await mp3s('public/assets/audio/environment'),
  environmentExpected,
  'environment runtime directory must contain exactly the files referenced anywhere in public/client',
);

const vehicleExpected = referencedNames('/assets/audio/vehicles/ts3/');
assert.deepEqual(
  await mp3s('public/assets/audio/vehicles/ts3'),
  vehicleExpected,
  'vehicles/ts3 runtime directory must contain exactly the files referenced anywhere in public/client',
);

console.log(`Runtime audio sets OK: ${environmentExpected.length} environment files and ${vehicleExpected.length} vehicle files.`);
