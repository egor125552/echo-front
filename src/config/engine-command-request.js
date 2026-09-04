export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 202609042250,
  mode: "battle-royale",
  room: "br-armor-single-plate-audit",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: { service: "match-api", method: "connectHuman", arguments: ["engine-armor-audit"] },
      },
      {
        command: "service.call",
        args: { service: "armor", method: "grantPlates", arguments: ["engine-armor-audit", 3] },
      },
      {
        command: "service.call",
        args: { service: "armor", method: "describe", arguments: ["engine-armor-audit"] },
      },
      {
        command: "service.call",
        args: { service: "armor", method: "startPlating", arguments: ["engine-armor-audit", 1000] },
      },
      {
        command: "service.call",
        args: { service: "armor", method: "tick", arguments: [3000] },
      },
      {
        command: "service.call",
        args: { service: "armor", method: "describe", arguments: ["engine-armor-audit"] },
      },
    ],
  },
  requestedAt: "2026-09-04T22:50:00+03:00",
});
