const VEHICLE = "br-jeep-1";
const TEST_NOW = 1788171300000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 229,
  mode: "battle-royale",
  room: "force-crash-calibration-229",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [TEST_NOW] } },

      { command: "service.call", args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 997.2, y: 1.25, z: 820 }, true] } },
      { command: "service.call", args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: 6, y: 0, z: 0 }, true] } },
      { command: "game.step", args: { dt: 0.1, steps: 1, now: TEST_NOW } },
      { command: "physics.contact-forces", args: { limit: 16, bodyId: VEHICLE, impactsOnly: true } },

      { command: "service.call", args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 997.2, y: 1.25, z: 860 }, true] } },
      { command: "service.call", args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: 11, y: 0, z: 0 }, true] } },
      { command: "game.step", args: { dt: 0.1, steps: 1 } },
      { command: "physics.contact-forces", args: { limit: 16, bodyId: VEHICLE, impactsOnly: true } },

      { command: "service.call", args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 997.2, y: 1.25, z: 900 }, true] } },
      { command: "service.call", args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: 18, y: 0, z: 0 }, true] } },
      { command: "game.step", args: { dt: 0.1, steps: 1 } },
      { command: "physics.contact-forces", args: { limit: 16, bodyId: VEHICLE, impactsOnly: true } },

      { command: "service.call", args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 997.2, y: 1.25, z: 940 }, true] } },
      { command: "service.call", args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: 25, y: 0, z: 0 }, true] } },
      { command: "game.step", args: { dt: 0.1, steps: 1 } },
      { command: "physics.contact-forces", args: { limit: 16, bodyId: VEHICLE, impactsOnly: true } },

      { command: "physics.stats", args: {} }
    ]
  },
  requestedAt: "2026-08-31T13:10:00+03:00"
});
