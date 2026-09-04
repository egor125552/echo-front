export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 202609041701,
  mode: "battle-royale",
  room: "battle-royale-portability-targeted",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "connectHuman",
          arguments: ["engine-targeted-audit"],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 500 } },
      { command: "game.step", args: { dt: 0.05, steps: 500 } },
      { command: "game.step", args: { dt: 0.05, steps: 200 } },
      {
        command: "service.call",
        args: { service: "movement", method: "teleport", arguments: ["engine-targeted-audit", { x: 0, y: 0, z: -900, angle: 0 }] },
      },
      {
        command: "service.call",
        args: { service: "entities", method: "setAlive", arguments: ["br-bot-96", true] },
      },
      { command: "event.emit", args: { event: "entity:respawned", payload: { entityId: "br-bot-96" } } },
      { command: "component.patch", args: { entityId: "br-bot-96", component: "Health", patch: { current: 200 } } },
      {
        command: "service.call",
        args: { service: "movement", method: "teleport", arguments: ["br-bot-96", { x: 126.8, y: 0, z: 120.8, angle: 0 }] },
      },
      {
        command: "bot.think",
        args: {
          entityId: "br-bot-96",
          context: {
            visibleEnemies: [],
            memory: null,
            zoneTarget: null,
            underFire: false,
            interestTarget: {
              kind: "poi-interest",
              group: "two-storey-house",
              pointId: "forced-upper",
              x: 140,
              y: 3.2,
              z: 120,
              expiresAt: 9999999999999
            }
          }
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 12 } },
      { command: "bot.inspect", args: { entityId: "br-bot-96" } },
      {
        command: "service.call",
        args: { service: "bot-building-stairs", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "entities", method: "setAlive", arguments: ["br-bot-95", true] },
      },
      { command: "event.emit", args: { event: "entity:respawned", payload: { entityId: "br-bot-95" } } },
      { command: "component.patch", args: { entityId: "br-bot-95", component: "Health", patch: { current: 200 } } },
      {
        command: "service.call",
        args: { service: "movement", method: "teleport", arguments: ["br-bot-95", { x: -175, y: 0, z: 95, angle: 0 }] },
      },
      {
        command: "event.emit",
        args: {
          event: "sound:spatial",
          payload: {
            entityId: "engine-targeted-audit",
            key: "weapon.engine-audit",
            radius: 45,
            x: -175,
            y: 0,
            z: 95
          }
        }
      },
      {
        command: "service.call",
        args: { service: "bot-interest", method: "heardFor", arguments: ["br-bot-95"] },
      },
      {
        command: "bot.think",
        args: {
          entityId: "br-bot-95",
          context: {
            visibleEnemies: [],
            memory: null,
            zoneTarget: null,
            underFire: false,
            interestTarget: {
              kind: "sound-interest",
              sourceId: "engine-targeted-audit",
              key: "weapon.engine-audit",
              priority: 3,
              confidence: 1,
              heardAt: 9999999990000,
              x: -175,
              y: 0,
              z: 95,
              expiresAt: 9999999999999
            }
          }
        }
      },
      {
        command: "bot.think",
        args: {
          entityId: "br-bot-95",
          context: {
            visibleEnemies: [],
            memory: null,
            zoneTarget: null,
            underFire: false,
            interestTarget: {
              kind: "sound-interest",
              sourceId: "engine-targeted-audit",
              key: "weapon.engine-audit",
              priority: 3,
              confidence: 1,
              heardAt: 9999999990000,
              x: -175,
              y: 0,
              z: 95,
              expiresAt: 9999999999999
            },
            investigationReached: true
          }
        }
      },
      {
        command: "service.call",
        args: { service: "building-ai-portability", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "building-ai-portability", method: "searchFor", arguments: ["br-bot-95"] },
      },
      { command: "game.step", args: { dt: 0.05, steps: 12 } },
      { command: "bot.inspect", args: { entityId: "br-bot-95" } },
      { command: "match.info", args: {} },
    ],
  },
  requestedAt: "2026-09-04T17:01:00Z",
});
