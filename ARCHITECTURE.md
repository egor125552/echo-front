# Echo Front architecture

Echo Front is a preset, not a monolithic game class. The microkernel only provides plugin lifecycle, events, services, components, scheduling boundaries, and platform adapters. Gameplay lives under `src/plugins/` and browser behavior lives under `client/plugins/`.

## Rules

- Core must not import gameplay plugins.
- A plugin must not import another plugin directly.
- Plugins communicate through services, events, and components.
- Plugin capabilities are declared in each manifest and enforced by the server plugin host.
- Physics is supplied by the `rapier-physics` plugin.
- Armor is optional. An entity has armor only if the Armor component exists.
- Bot fill and bot loadouts are separate plugins; loadouts decide whether a bot receives armor.
- Presets compose the game. `empty`, `walking-test`, `combat-test`, and `echo-front` demonstrate that mechanics can be removed without rewriting the microkernel.

`scripts/architecture-check.mjs` turns these rules into CI failures when a direct cross-plugin dependency is introduced.
