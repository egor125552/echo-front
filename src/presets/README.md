# Presets

- `empty.js`: microkernel without gameplay.
- `walking-test.js`: Rapier physics, arena, entities, movement only.
- `combat-test.js`: shooting and health without armor or bots.
- `echo-front.js`: the complete playable prototype.

Presets are composition roots. Gameplay plugins must never import each other directly.
