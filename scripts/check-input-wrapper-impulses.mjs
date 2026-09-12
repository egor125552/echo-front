import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cases = [
  {
    file: 'client/plugins/parachute-input.js',
    pattern: /parachutePressed:\s*mergeParachutePressed\(sampled, pressed\)/,
    message: 'parachute wrapper must preserve keyboard-input parachutePressed',
  },
  {
    file: 'client/plugins/parkour-input.js',
    pattern: /posePressed:\s*Boolean\(sampled\.posePressed \|\| pressed\)/,
    message: 'parkour wrapper must preserve an existing posePressed impulse',
  },
  {
    file: 'client/plugins/battle-royale-navigation.js',
    pattern: /navigationNextPressed:\s*Boolean\(sampled\.navigationNextPressed \|\| next\)[\s\S]*navigationTogglePressed:\s*Boolean\(sampled\.navigationTogglePressed \|\| toggle\)/,
    message: 'navigation wrapper must preserve existing navigation impulses',
  },
  {
    file: 'client/plugins/battle-royale-navigation-face.js',
    pattern: /navigationFacePressed:\s*Boolean\(sampled\.navigationFacePressed \|\| face\)/,
    message: 'navigation face wrapper must preserve an existing face impulse',
  },
  {
    file: 'client/plugins/accessible-menus.js',
    pattern: /navigationTogglePressed:\s*Boolean\(base\.navigationTogglePressed \|\| navigation\.activate\)/,
    message: 'accessible menu wrapper must preserve an existing navigation toggle impulse',
  },
];

for (const item of cases) {
  const source = await readFile(item.file, 'utf8');
  assert.match(source, item.pattern, item.message);
}

console.log(`Input wrapper impulses OK: ${cases.length} wrapper merge rules preserve upstream one-shot actions.`);
