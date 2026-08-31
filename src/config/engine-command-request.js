const TEST_HUMAN = "force-crash-glancing-post-fix";
const VEHICLE = "br-jeep-1";
const TEST_NOW = 1788174600000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 240,
  mode: "battle-royale",
  room: "force-crash-glancing-post-fix-240",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [TEST_NOW] } },
      {
        command: "service.call",
        args: {
          service: "entities",
          method: "spawn",
          arguments: [{
            id: TEST_HUMAN,
            kind: "diagnostic-human",
            name: "Post Fix Glancing Crash Driver",
            bot: false,
            alive: true,
            health: 100,
            position: { x: 94, y: 1.25, z: 26, angle: 0 }
          }]
        }
      },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [TEST_HUMAN, TEST_NOW] } },
      { command: "service.call", args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 900, y: 1.25, z: 900 }, true] } },
      { command: "service.call", args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: 4, y: 0, z: 10 }, true] } },
      { command: "game.step", args: { dt: 0.03, steps: 1, now: TEST_NOW } },
      { command: "service.call", args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 998.0, y: 1.25, z: 900 }, true] } },
      { command: "service.call", args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: 4, y: 0, z: 10 }, true] } },
      { command: "game.step", args: { dt: 0.1, steps: 1 } },
      { command: "physics.contact-forces", args: { limit: 32, bodyId: VEHICLE, impactsOnly: true } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: [VEHICLE] } },
      { command: "service.call", args: { service: "ragdoll", method: "isActive", arguments: [TEST_HUMAN] } },
      { command: "entity.inspect", args: { entityId: TEST_HUMAN } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "summary", arguments: [] } },
      { command: "physics.stats", args: {} }
    ]
  },
  requestedAt: "2026-08-31T14:05:00+03:00"
});
