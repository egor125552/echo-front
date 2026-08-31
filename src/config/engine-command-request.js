const TEST_HUMAN = "force-crash-test-human";
const VEHICLE = "br-jeep-1";

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 225,
  mode: "battle-royale",
  room: "force-crash-e2e-225",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: {
          service: "entities",
          method: "spawn",
          arguments: [{
            id: TEST_HUMAN,
            kind: "human",
            name: "Force Crash Test Human",
            bot: false,
            alive: true,
            health: 100,
            position: { x: 94, y: 1.25, z: 26, angle: 0 }
          }]
        }
      },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [TEST_HUMAN, 1788170100000] } },
      {
        command: "service.call",
        args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 900, y: 1.25, z: 900 }, true] }
      },
      {
        command: "service.call",
        args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: 18, y: 0, z: 0 }, true] }
      },
      { command: "game.step", args: { dt: 0.03, steps: 1, now: 1788170100000 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: [VEHICLE] } },
      {
        command: "service.call",
        args: { service: "physics", method: "setDynamicBodyTranslation", arguments: [VEHICLE, { x: 995.2, y: 1.25, z: 900 }, true] }
      },
      {
        command: "service.call",
        args: { service: "physics", method: "setDynamicBodyLinearVelocity", arguments: [VEHICLE, { x: 18, y: 0, z: 0 }, true] }
      },
      { command: "game.step", args: { dt: 0.1, steps: 1 } },
      { command: "physics.contact-forces", args: { limit: 32, bodyId: VEHICLE, impactsOnly: true } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: [VEHICLE] } },
      { command: "service.call", args: { service: "ragdoll", method: "isActive", arguments: [TEST_HUMAN] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: [TEST_HUMAN] } },
      { command: "entity.inspect", args: { entityId: TEST_HUMAN } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "summary", arguments: [] } },
      { command: "physics.stats", args: {} }
    ]
  },
  requestedAt: "2026-08-31T12:50:00+03:00"
});
