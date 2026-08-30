const START = 2000021900000;
const PLAYER = "transcript-fixes-219";
const commands = [];

commands.push(
  { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
  { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 131.5, y: 0, z: 124.8, angle: -Math.PI / 2 }] } },
  { command: "service.call", args: { service: "movement", method: "setInput", arguments: [PLAYER, { forward: 1, strafe: 0 }] } },
);
for (let i = 0; i < 7; i += 1) {
  commands.push({ command: "service.call", args: { service: "movement", method: "tick", arguments: [0.1, START + i * 100] } });
}
commands.push(
  { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: [PLAYER, START + 750] } },
  { command: "service.call", args: { service: "movement", method: "setInput", arguments: [PLAYER, { forward: 1, strafe: 0.8 }] } },
);
for (let i = 0; i < 5; i += 1) {
  commands.push({ command: "service.call", args: { service: "movement", method: "tick", arguments: [0.1, START + 800 + i * 100] } });
}
commands.push(
  { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: [PLAYER, START + 1350] } },
  { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 129, y: 3.2, z: 120, angle: 0 }] } },
  { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: [PLAYER, START + 1450] } },
  { command: "service.call", args: { service: "navigation", method: "buildRoute", arguments: [
    { x: 627.849, y: 0, z: 826.165 },
    { id: "journal-boundary-probe", name: "Журнальная цель", kind: "vehicle", position: { x: 669, y: 0, z: 988.7 }, mode: "foot" }
  ] } },
);

for (const [index, speedKph] of [40, 120].entries()) {
  const id = `vehicle-crash-${speedKph}`;
  const speed = speedKph / 3.6;
  commands.push(
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [id] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [id, { x: -20 + index * 20, y: 30, z: -90, angle: 0 }] } },
    { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [id, { reason: "vehicle-crash", velocity: { x: speed, y: 3, z: 0 } }, START + 2000 + index] } },
    { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: [id] } },
  );
}
commands.push(
  { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
);

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 219,
  mode: "battle-royale",
  room: "transcript-fixes-219",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands },
  requestedAt: "2026-08-30T22:54:00+03:00"
});
