const START = 2000021700000;
const CASES = Object.freeze([
  { player: "ragdoll-speed-15", speedKph: 15, x: -24 },
  { player: "ragdoll-speed-50", speedKph: 50, x: -8 },
  { player: "ragdoll-speed-100", speedKph: 100, x: 8 },
  { player: "ragdoll-speed-150", speedKph: 150, x: 24 },
]);

const commands = [];
for (const [index, test] of CASES.entries()) {
  const speed = test.speedKph / 3.6;
  commands.push(
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [test.player] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [test.player, { x: test.x, y: 30, z: -60, angle: 0 }] } },
    { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [test.player, { reason: "vehicle-eject", velocity: { x: speed, y: 5, z: 0 } }, START + index] } },
    { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: [test.player] } },
  );
}
commands.push(
  { command: "service.call", args: { service: "ragdoll-tuning", method: "currentReason", arguments: ["vehicle-eject"] } },
  { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
);

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 217,
  mode: "battle-royale",
  room: "ragdoll-speed-scaling-217",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands },
  requestedAt: "2026-08-30T22:21:00+03:00"
});
