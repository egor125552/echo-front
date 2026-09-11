import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { echoFrontClientPreset } from '../public/client/presets/echo-front.js';
import { ClientPluginHost } from '../public/client/core/plugin-host.js';

const pluginsDir = resolve('public/client/plugins');
const pluginFiles = (await readdir(pluginsDir))
  .filter((name) => name.endsWith('.js'))
  .sort();

const modules = [];
for (const file of pluginFiles) {
  const module = await import(pathToFileURL(resolve(pluginsDir, file)).href);
  assert.equal(typeof module.manifest?.id, 'string', `${file} must export manifest.id`);
  assert(module.manifest.id.length > 0, `${file} has an empty manifest.id`);
  modules.push({ file, module });
}

const fileIds = modules.map(({ module }) => module.manifest.id);
assert.equal(new Set(fileIds).size, fileIds.length, 'Plugin files must have unique manifest.id values');

const presetIds = echoFrontClientPreset.map((plugin) => plugin.manifest?.id);
assert(presetIds.every((id) => typeof id === 'string' && id.length > 0), 'Every preset entry must export manifest.id');
assert.equal(new Set(presetIds).size, presetIds.length, 'Preset must not contain duplicate plugin ids');

assert.deepEqual(
  [...presetIds].sort(),
  [...fileIds].sort(),
  'Every client plugin file must be included in the preset exactly once',
);

const host = new ClientPluginHost(echoFrontClientPreset);
assert.equal(host.plugins.length, pluginFiles.length, 'PluginHost must resolve the complete client preset');

console.log(`Client preset OK: ${pluginFiles.length} plugin files, unique ids, complete preset, dependency graph resolved.`);
