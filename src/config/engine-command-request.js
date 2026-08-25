export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 3,
  mode: "battle-royale",
  room: "engine-lab",
  command: "service.call",
  args: {
    service: "physics",
    method: "raycastWorld",
    arguments: [
      { x: 0, y: 10, z: 0 },
      { x: 0, y: -1, z: 0 },
      50
    ]
  },
  requestedAt: "2026-08-25T20:14:00Z",
});
