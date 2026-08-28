const START = 2000011300000;
const DT = 0.1;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 113,
  mode: "battle-royale",
  room: "engine-lab-edge-parachute-113",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "edge-ragdoll-113",
        kind: "human",
        name: "Edge Ragdoll",
        bot: false,
        team: 11301,
        health: 200,
        weapons: [],
        position: { x: 992, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "edge-ragdoll-113",
        { reason: "vehicle-eject", position: { x: 992, y: 1.2, z: 0 }, angle: 0, velocity: { x: 55, y: 30, z: 0 } },
        START + 10
      ] } },
      ...Array.from({ length: 20 }, (_, index) => ({
        command: "service.call",
        args: { service: "match-api", method: "step", arguments: [DT, START + 100 + index * 100] },
      })),
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["edge-ragdoll-113"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "deployParachute", arguments: ["edge-ragdoll-113", START + 2150] } },
      { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["edge-ragdoll-113"] } },
      { command: "service.call", args: { service: "world-safety", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "world-expansion", method: "summary", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-28T13:06:00Z"
});
