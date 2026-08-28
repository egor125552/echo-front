export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 102,
  mode: "battle-royale",
  room: "engine-lab-navigation-dropzone-102",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "dropzone-driver-a-102",
        kind: "human",
        name: "Dropzone Driver A",
        bot: false,
        team: 100201,
        health: 200,
        weapons: [],
        position: { x: 850, y: 0, z: 850, angle: 0 }
      } } },
      { command: "entity.spawn", args: { spec: {
        id: "dropzone-driver-b-102",
        kind: "human",
        name: "Dropzone Driver B",
        bot: false,
        team: 100202,
        health: 200,
        weapons: [],
        position: { x: -850, y: 0, z: 850, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000010200050] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "placeNear", arguments: [
        "dropzone-driver-a-102", { x: 850, y: 0, z: 850 }, 2000010200100
      ] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "assertNear", arguments: [
        { x: 850, y: 0, z: 850 }, 18, "dropzone-driver-a-102"
      ] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "assignedFor", arguments: ["dropzone-driver-a-102"] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "placeNear", arguments: [
        "dropzone-driver-b-102", { x: -850, y: 0, z: 850 }, 2000010200200
      ] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "assertNear", arguments: [
        { x: -850, y: 0, z: 850 }, 18, "dropzone-driver-b-102"
      ] } },
      { command: "service.call", args: { service: "dropzone-vehicle", method: "assignedFor", arguments: ["dropzone-driver-b-102"] } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-2"] } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-3"] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "dropzone-driver-a-102", { navigationNextPressed: true }, 2000010200300
      ] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "dropzone-driver-a-102", { navigationTogglePressed: true }, 2000010200320
      ] } },
      { command: "service.call", args: { service: "navigation", method: "assertState", arguments: [
        "dropzone-driver-a-102", {
          selectedTargetId: "warehouse",
          active: true,
          activeKind: "building",
          minCheckpoints: 45
        }
      ] } },
      { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["dropzone-driver-a-102"] } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: [
        "dropzone-driver-a-102", 2000010200400
      ] } }
    ]
  },
  requestedAt: "2026-08-28T11:29:00Z"
});
