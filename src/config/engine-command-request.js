export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 202609042245,
  mode: "battle-royale",
  room: "br-audio-freefall-dropzone-audit",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: { service: "match-api", method: "connectHuman", arguments: ["engine-br-audio-audit"] },
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-br-audio-audit"] },
      },
      { command: "entity.inspect", args: { entityId: "engine-br-audio-audit" } },
      {
        command: "component.patch",
        args: { entityId: "engine-br-audio-audit", component: "Input", patch: { forward: 1, strafe: 0, sprint: true } },
      },
      { command: "game.step", args: { dt: 0.05, steps: 100 } },
      { command: "entity.inspect", args: { entityId: "engine-br-audio-audit" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-br-audio-audit"] },
      },
      {
        command: "service.call",
        args: { service: "dropzone-vehicle", method: "placeNear", arguments: ["engine-br-audio-audit", { x: 300, y: 0, z: 300 }] },
      },
      {
        command: "service.call",
        args: { service: "dropzone-vehicle", method: "assertNear", arguments: [{ x: 300, y: 0, z: 300 }, 30, "engine-br-audio-audit"] },
      },
      {
        command: "service.call",
        args: { service: "dropzone-vehicle", method: "placeNear", arguments: ["engine-br-audio-audit", { x: -300, y: 0, z: -300 }] },
      },
      {
        command: "service.call",
        args: { service: "dropzone-vehicle", method: "assertNear", arguments: [{ x: -300, y: 0, z: -300 }, 30, "engine-br-audio-audit"] },
      },
      {
        command: "service.call",
        args: { service: "dropzone-vehicle", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "armor", method: "describe", arguments: ["engine-br-audio-audit"] },
      },
      {
        command: "service.call",
        args: { service: "armor", method: "grantPlates", arguments: ["engine-br-audio-audit", 3] },
      },
      {
        command: "service.call",
        args: { service: "armor", method: "describe", arguments: ["engine-br-audio-audit"] },
      },
      {
        command: "service.call",
        args: { service: "armor", method: "startPlating", arguments: ["engine-br-audio-audit"] },
      },
      { command: "game.step", args: { dt: 0.05, steps: 25 } },
      {
        command: "service.call",
        args: { service: "armor", method: "describe", arguments: ["engine-br-audio-audit"] },
      },
      {
        command: "service.call",
        args: {
          service: "map",
          method: "acousticOcclusionBetween",
          arguments: [{ x: -110, y: 1, z: -75 }, { x: -98, y: 1, z: -75 }]
        },
      },
      { command: "physics.stats", args: {} },
      { command: "match.info", args: {} },
    ],
  },
  requestedAt: "2026-09-04T22:45:00+03:00",
});
