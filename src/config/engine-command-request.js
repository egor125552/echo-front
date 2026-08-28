const START = 2000010400000;
const STEP_SECONDS = 0.05;
const STEP_COUNT = 24;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 104,
  mode: "battle-royale",
  room: "engine-lab-real-landing-jeep-104",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "landing-driver-104",
        kind: "human",
        name: "Real Landing Driver",
        bot: false,
        team: 100401,
        health: 200,
        weapons: [],
        position: { x: 320, y: 0, z: 360, angle: 0 }
      } } },
      { command: "service.call", args: { service: "parachute", method: "launch", arguments: [
        "landing-driver-104", { altitude: 8, x: 320, z: 360, angle: 0 }, START + 25
      ] } },
      ...Array.from({ length: STEP_COUNT }, (_, index) => ({
        command: "service.call",
        args: {
          service: "match-api",
          method: "step",
          arguments: [STEP_SECONDS, START + 50 + index * 50],
        },
      })),
      { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["landing-driver-104"] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "assignedFor", arguments: ["landing-driver-104"] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "assertNear", arguments: [
        { x: 320, y: 0, z: 360 }, 18, "landing-driver-104"
      ] } },
      { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: [
        "landing-driver-104", START + 1400
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-28T11:45:00Z"
});
