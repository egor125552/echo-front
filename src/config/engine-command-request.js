export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 99,
  mode: "battle-royale",
  room: "engine-lab-navigation-checkpoints-99",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "navigation-probe-99",
        kind: "human",
        name: "Navigation Probe",
        bot: false,
        team: 99901,
        health: 200,
        weapons: [],
        position: { x: 0, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009900050] } },

      // M selects the first registered target: the warehouse.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-probe-99", { navigationNextPressed: true }, 2000009900100
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-probe-99", { selectedTargetId: "warehouse", active: false }
      ] } },

      // Enter starts a server route that must encounter real Rapier warehouse walls
      // and route through intermediate checkpoints instead of pointing at the goal.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-probe-99", { navigationTogglePressed: true }, 2000009900200
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-probe-99", {
          selectedTargetId: "warehouse",
          active: true,
          activeKind: "building",
          minCheckpoints: 3,
          minDetours: 1,
          minRapierBlocks: 1
        }
      ] } },
      { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["navigation-probe-99"] } },

      // M changes only the selection while warehouse guidance stays active.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-probe-99", { navigationNextPressed: true }, 2000009900300
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-probe-99", {
          selectedTargetId: "vehicle:br-jeep-1",
          active: true,
          activeKind: "building"
        }
      ] } },

      // Enter on the newly selected vehicle replaces the active destination.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-probe-99", { navigationTogglePressed: true }, 2000009900400
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-probe-99", {
          selectedTargetId: "vehicle:br-jeep-1",
          active: true,
          activeKind: "vehicle",
          minCheckpoints: 2
        }
      ] } },
      { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["navigation-probe-99"] } },

      // Enter again on the same active target stops guidance but keeps selection.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "navigation-probe-99", { navigationTogglePressed: true }, 2000009900500
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "navigation-probe-99", { selectedTargetId: "vehicle:br-jeep-1", active: false }
      ] } },

      // Prove the separate landing helper physically relocates a real fleet jeep
      // beside an arbitrary actual landing point.
      { command: "service.call", args: { service: "dropzone-vehicle", method: "placeNear", arguments: [
        "navigation-probe-99", { x: 400, y: 0, z: 400 }, 2000009900600
      ] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "assertNear", arguments: [
        { x: 400, y: 0, z: 400 }, 18
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-2"] } },
      { command: "service.call", args: { service: "navigation", method: "availableTargets", arguments: ["navigation-probe-99"] } },
      { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["navigation-probe-99", 2000009900700] } }
    ]
  },
  requestedAt: "2026-08-28T11:05:00Z"
});
