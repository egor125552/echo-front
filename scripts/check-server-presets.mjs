import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { PluginHost } from '../src/core/plugin-host.js';
import { battleRoyalePreset } from '../src/presets/battle-royale.js';
import { echoFrontPreset } from '../src/presets/echo-front.js';
import { combatTestPreset } from '../src/presets/combat-test.js';
import { walkingTestPreset } from '../src/presets/walking-test.js';
import { emptyPreset } from '../src/presets/empty.js';

const presets = new Map([
  ['battle-royale', battleRoyalePreset],
  ['echo-front', echoFrontPreset],
  ['combat-test', combatTestPreset],
  ['walking-test', walkingTestPreset],
  ['empty', emptyPreset],
]);

for (const [name, plugins] of presets) {
  const host = new PluginHost({ plugins });
  assert.equal(host.plugins.length, plugins.length, `${name} preset must resolve every plugin`);
  await host.start();
  await host.stop();
}

const importPattern = /\b(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const roots = [...presets.keys()].map((name) => resolve(`src/presets/${name}.js`));
const reachable = new Set();
const stack = [...roots];
while (stack.length) {
  const file = stack.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    let target = resolve(dirname(file), specifier);
    try {
      const statNames = await readdir(target);
      if (statNames.includes('index.js')) target = resolve(target, 'index.js');
    } catch {
      if (!target.endsWith('.js')) target += '.js';
    }
    try {
      await readFile(target);
      stack.push(target);
    } catch {}
  }
}

const pluginDirs = await readdir('src/plugins', { withFileTypes: true });
const serverFiles = [];
for (const entry of pluginDirs) {
  if (!entry.isDirectory()) continue;
  const file = resolve('src/plugins', entry.name, 'server.js');
  try { await readFile(file); serverFiles.push(file); } catch {}
}
const unreachable = serverFiles
  .filter((file) => !reachable.has(file))
  .map((file) => relative(process.cwd(), file))
  .sort();
assert.deepEqual(unreachable, [], `Server plugins not reachable from any preset:\n${unreachable.join('\n')}`);

console.log(`Server presets OK: ${presets.size} presets resolve and all ${serverFiles.length} server plugins are reachable.`);
