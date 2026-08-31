const TEST_NOW = 1788171600000;
const CASES = Object.freeze([
  { id: "br-jeep-1", z: 760, speed: 6 },
  { id: "br-jeep-2", z: 800, speed: 11 },
  { id: "br-jeep-3", z: 840, speed: 18 },
  { id: "br-jeep-4", z: 880, speed: 25 },
]);

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 230,
  mode: "battle-royale",
  room: "force-crash-chassis-calibration-230",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [TEST_NOW] } },
      ...CASES.flatMap(({ id, z, speed }) => [
        { command: "service.call", args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [id, { x: 997.0, y: 1.25, z }, true] } },
        { command: "service.call", args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [id, { x: speed, y: 0, z: 0 }, true] } },
      ]),
      { command: "game.step", args: { dt: 0.1, steps: 1, now: TEST_NOW } },
      ...CASES.map(({ id }) => ({
        command: "physics.contact-forces",
        args: { limit: 16, bodyId: id, kind: "vehicle-chassis", impactsOnly: true }
      })),
      ...CASES.map(({ id }) => ({
        command: "service.call",
        args: { service: "vehicles", method: "stateFor", arguments: [id] }
      })),
      { command: "physics.stats", args: {} }
    ]
  },
  requestedAt: "2026-08-31T13:15:00+03:00"
});
