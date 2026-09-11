import assert from 'node:assert/strict';
import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
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

const patterns = [
  /\bimport\s+(?:[^'"`]+?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+[^'"`]+?\s+from\s+['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const missing = [];
let checked = 0;
for (const file of await jsFiles('public/client')) {
  const source = await readFile(file, 'utf8');
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      checked += 1;
      let target = resolve(dirname(file), specifier);
      if (!target.endsWith('.js')) target += '.js';
      if (!await exists(target)) missing.push(`${file}: ${specifier} -> ${target}`);
    }
  }
}

assert.deepEqual(missing, [], `Missing local client modules:\n${missing.join('\n')}`);
console.log(`Client imports OK: ${checked} relative module references resolve.`);
