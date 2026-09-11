import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const sourceRoot = resolve('client');
const publicRoot = resolve('public/client');

async function filesUnder(root, dir = root) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, path));
    else if (entry.isFile()) files.push(relative(root, path));
  }
  return files.sort();
}

const [sourceFiles, publicFiles] = await Promise.all([
  filesUnder(sourceRoot),
  filesUnder(publicRoot),
]);

assert.deepEqual(
  publicFiles,
  sourceFiles,
  'client and public/client must contain the same files',
);

const mismatches = [];
for (const file of sourceFiles) {
  const [source, served] = await Promise.all([
    readFile(resolve(sourceRoot, file)),
    readFile(resolve(publicRoot, file)),
  ]);
  if (!source.equals(served)) mismatches.push(file);
}

assert.deepEqual(
  mismatches,
  [],
  `client and public/client differ: ${mismatches.join(', ')}`,
);

console.log(`Client mirror OK: ${sourceFiles.length} files match.`);
