export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 101,
  mode: "battle-royale",
  room: "engine-lab-navigation-long-range-101",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "navigation-edge-probe-101",
        kind: "human",
        name: "Long Range Navigation Probe",
        bot: false,
        team: 100101,
        health: 200,
        weapons: [],
        position: { x: 900, y: 0, z: 900, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000010100050] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-edge-probe-101", { navigationNextPressed: true }, 2000010100100
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-edge-probe-101", { selectedTargetId: "warehouse", active: false }
      ] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-edge-probe-101", { navigationTogglePressed: true }, 2000010100200
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-edge-probe-101", {
          selectedTargetId: "warehouse",
          active: true,
          activeKind: "building",
          minCheckpoints: 50
        }
      ] } },
      { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["navigation-edge-probe-101"] } },
      { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: [
        "navigation-edge-probe-101", "vehicle:br-supercar-4", 2000010100300
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-edge-probe-101", { selectedTargetId: "vehicle:br-supercar-4", active: true, activeKind: "building" }
      ] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-edge-probe-101", { navigationTogglePressed: true }, 2000010100400
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-edge-probe-101", {
          selectedTargetId: "vehicle:br-supercar-4",
          active: true,
          activeKind: "vehicle",
          minCheckpoints: 10
        }
      ] } },
      { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["navigation-edge-probe-101"] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-edge-probe-101", { navigationTogglePressed: true }, 2000010100500
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-edge-probe-101", { selectedTargetId: "vehicle:br-supercar-4", active: false }
      ] } },
      { command: "service.call", args: { service: "navigation", method: "registerTarget", arguments: [{
        id: "validation-landmark-101",
        name: "Контрольная точка",
        kind: "landmark",
        order: 15,
        arriveDistance: 4,
        position: { x: -500, y: 0, z: 500 }
      }] } },
      { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: [
        "navigation-edge-probe-101", "validation-landmark-101", 2000010100550
      ] } },
      { command: "service.call", args: { service: "navigation", method: "toggle", arguments: [
        "navigation-edge-probe-101", 2000010100575
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-edge-probe-101", {
          selectedTargetId: "validation-landmark-101",
          active: true,
          activeKind: "landmark",
          minCheckpoints: 50
        }
      ] } },
      { command: "service.call", args: { service: "navigation", method: "stop", arguments: [
        "navigation-edge-probe-101", 2000010100590, "validation"
      ] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "placeNear", arguments: [
        "navigation-edge-probe-101", { x: 850, y: 0, z: 850 }, 2000010100600
      ] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "assertNear", arguments: [
        { x: 850, y: 0, z: 850 }, 18
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-2"] } },
      { command: "service.call", args: { service: "navigation", method: "availableTargets", arguments: ["navigation-edge-probe-101"] } },
      { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: [
        "navigation-edge-probe-101", 2000010100700
      ] } }
    ]
  },
  requestedAt: "2026-08-28T11:25:00Z"
});
