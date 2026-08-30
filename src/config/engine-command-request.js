const START = 2000021800000;
const PLAYER = "transcript-fixes-218";
const commands = [];

commands.push(
  { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },

  // Crate probe: approach the ground-floor rifle crate slightly off-centre.
  // With no strafe, the player must stop instead of silently sliding around it.
  { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 131.5, y: 0, z: 124.8, angle: -Math.PI / 2 }] } },
  { command: "service.call", args: { service: "movement", method: "setInput", arguments: [PLAYER, { forward: 1, strafe: 0 }] } },
);
for (let i = 0; i < 14; i += 1) {
  commands.push({ command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, START + i * 50] } });
}
commands.push(
  { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: [PLAYER, START + 800] } },

  // Deliberate strafe must still let the player choose to move around the crate.
  { command: "service.call", args: { service: "movement", method: "setInput", arguments: [PLAYER, { forward: 1, strafe: 0.8 }] } },
);
for (let i = 0; i < 10; i += 1) {
  commands.push({ command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, START + 900 + i * 50] } });
}
commands.push(
  { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: [PLAYER, START + 1500] } },

  // Generic location speech: specific floor first, building second.
  { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 129, y: 3.2, z: 120, angle: 0 }] } },
  { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: [PLAYER, START + 1600] } },

  // A near-boundary route must never explode into kilometre-scale detours.
  { command: "service.call", args: { service: "navigation", method: "buildRoute", arguments: [
    { x: 627.849, y: 0, z: 826.165 },
    { id: "journal-boundary-probe", name: "Журнальная цель", kind: "vehicle", position: { x: 669, y: 0, z: 988.7 }, mode: "foot" }
  ] } },
);

for (const [index, speedKph] of [30, 80, 140].entries()) {
  const id = `vehicle-crash-${speedKph}`;
  const speed = speedKph / 3.6;
  commands.push(
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [id] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [id, { x: -30 + index * 15, y: 30, z: -90, angle: 0 }] } },
    { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [id, { reason: "vehicle-crash", velocity: { x: speed, y: 3, z: 0 } }, START + 2000 + index] } },
    { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: [id] } },
  );
}
commands.push(
  { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
  { command: "service.call", args: { service: "match-api", method: "disconnectHuman", arguments: [PLAYER] } },
);

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 218,
  mode: "battle-royale",
  room: "transcript-fixes-218",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands },
  requestedAt: "2026-08-30T22:50:00+03:00"
});
