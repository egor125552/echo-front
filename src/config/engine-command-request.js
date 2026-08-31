const DROP_BODY = "rapier-diagnostics-drop-222";
const commands = [
  { command: "physics.stats", args: {} },
  {
    command: "physics.shape-cast-capsule",
    args: {
      origin: { x: 994, y: 0.79, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 20,
      worldOnly: true
    }
  },
  {
    command: "service.call",
    args: {
      service: "physics",
      method: "createDynamicCuboid",
      arguments: [
        DROP_BODY,
        {
          x: 900,
          y: 3,
          z: 900,
          hx: 0.5,
          hy: 0.5,
          hz: 0.5,
          mass: 20,
          friction: 0.7,
          restitution: 0.02,
          ccd: true,
          metadata: {
            kind: "diagnostic-drop",
            accessibleName: "диагностическое тело",
            contactForceThreshold: 100
          }
        }
      ]
    }
  }
];

for (let i = 0; i < 25; i += 1) {
  commands.push({
    command: "service.call",
    args: { service: "physics", method: "step", arguments: [1 / 30] }
  });
}

commands.push(
  { command: "physics.contact-forces", args: { limit: 16 } },
  { command: "physics.stats", args: {} }
);

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 222,
  mode: "battle-royale",
  room: "rapier-diagnostics-222",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands },
  requestedAt: "2026-08-31T12:05:00+03:00"
});
