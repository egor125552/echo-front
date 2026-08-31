const VEHICLE = "br-jeep-1";
const TEST_NOW = 1788173100000;
const CASES = Object.freeze([
  { id: "force-crash-driver-11kph", name: "Crash Driver 11 kmh", speed: 3, offset: 0 },
  { id: "force-crash-driver-22kph", name: "Crash Driver 22 kmh", speed: 6, offset: 1000 },
]);

function crashCase({ id, name, speed, offset }) {
  const now = TEST_NOW + offset;
  return [
    { command: "service.call", args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 94, y: 1.25, z: 24 }, true] } },
    { command: "service.call", args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: 0, y: 0, z: 0 }, true] } },
    { command: "game.step", args: { dt: 0.03, steps: 1, now } },
    {
      command: "service.call",
      args: {
        service: "entities",
        method: "spawn",
        arguments: [{
          id,
          kind: "diagnostic-human",
          name,
          bot: false,
          alive: true,
          health: 100,
          position: { x: 94, y: 1.25, z: 26, angle: 0 }
        }]
      }
    },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [id, now] } },
    { command: "service.call", args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 900, y: 1.25, z: 900 }, true] } },
    { command: "service.call", args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: speed, y: 0, z: 0 }, true] } },
    { command: "game.step", args: { dt: 0.03, steps: 1 } },
    { command: "service.call", args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 998.0, y: 1.25, z: 900 }, true] } },
    { command: "service.call", args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: speed, y: 0, z: 0 }, true] } },
    { command: "game.step", args: { dt: 0.1, steps: 1 } },
    { command: "physics.contact-forces", args: { limit: 32, bodyId: VEHICLE, impactsOnly: true } },
    { command: "service.call", args: { service: "ragdoll", method: "isActive", arguments: [id] } },
    { command: "entity.inspect", args: { entityId: id } },
    { command: "service.call", args: { service: "vehicles", method: "exit", arguments: [id, now + 500, "diagnostic-reset"] } },
  ];
}

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 235,
  mode: "battle-royale",
  room: "force-crash-low-speed-sweep-235",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [TEST_NOW] } },
      ...CASES.flatMap(crashCase),
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "summary", arguments: [] } },
    ]
  },
  requestedAt: "2026-08-31T13:40:00+03:00"
});
