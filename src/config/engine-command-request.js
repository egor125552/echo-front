export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 100,
  mode: "battle-royale",
  room: "engine-lab-navigation-checkpoints-100",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "navigation-probe-100",
        kind: "human",
        name: "Navigation Probe",
        bot: false,
        team: 100001,
        health: 200,
        weapons: [],
        position: { x: 0, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000010000050] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-probe-100", { navigationNextPressed: true }, 2000010000100
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-probe-100", { selectedTargetId: "warehouse", active: false }
      ] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-probe-100", { navigationTogglePressed: true }, 2000010000200
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-probe-100", {
          selectedTargetId: "warehouse",
          active: true,
          activeKind: "building",
          minCheckpoints: 3,
          minDetours: 1,
          minRapierBlocks: 1
        }
      ] } },
      { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["navigation-probe-100"] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-probe-100", { navigationNextPressed: true }, 2000010000300
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-probe-100", {
          selectedTargetId: "vehicle:br-jeep-1",
          active: true,
          activeKind: "building"
        }
      ] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-probe-100", { navigationTogglePressed: true }, 2000010000400
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-probe-100", {
          selectedTargetId: "vehicle:br-jeep-1",
          active: true,
          activeKind: "vehicle",
          minCheckpoints: 2
        }
      ] } },
      { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["navigation-probe-100"] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-probe-100", { navigationTogglePressed: true }, 2000010000500
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-probe-100", { selectedTargetId: "vehicle:br-jeep-1", active: false }
      ] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "placeNear", arguments: [
        "navigation-probe-100", { x: 400, y: 0, z: 400 }, 2000010000600
      ] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "assertNear", arguments: [
        { x: 400, y: 0, z: 400 }, 18
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-2"] } },
      { command: "service.call", args: { service: "navigation", method: "availableTargets", arguments: ["navigation-probe-100"] } },
      { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["navigation-probe-100", 2000010000700] } }
    ]
  },
  requestedAt: "2026-08-28T11:14:00Z"
});
