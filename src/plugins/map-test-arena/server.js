export const manifest = {
  id: "map-test-arena",
  version: "1.0.0",
  requires: ["rapier-physics"],
  capabilities: ["services.consume", "services.provide"],
};

export async function setup(ctx) {
  const physics = ctx.services.get("physics");

  const walls = [
    { x: 0, z: -15, hx: 15, hz: 0.35 },
    { x: 0, z: 15, hx: 15, hz: 0.35 },
    { x: -15, z: 0, hx: 0.35, hz: 15 },
    { x: 15, z: 0, hx: 0.35, hz: 15 },
    { x: 0, z: -3.5, hx: 5.5, hz: 0.35 },
    { x: 0, z: 3.5, hx: 5.5, hz: 0.35 },
    { x: -7.5, z: 0, hx: 0.35, hz: 4.0 },
    { x: 7.5, z: 0, hx: 0.35, hz: 4.0 },
    { x: -10.5, z: -8.5, hx: 2.2, hz: 0.35 },
    { x: 10.5, z: 8.5, hx: 2.2, hz: 0.35 },
  ];
  for (const wall of walls) physics.createWall(wall);

  const spawns = {
    1: [
      { x: -11, z: 11, angle: Math.PI * 0.75 },
      { x: -11, z: -11, angle: Math.PI * 0.25 },
    ],
    2: [
      { x: 11, z: -11, angle: -Math.PI * 0.25 },
      { x: 11, z: 11, angle: -Math.PI * 0.75 },
    ],
  };
  const counters = { 1: 0, 2: 0 };

  ctx.services.provide("map", {
    id: "test-arena",
    walls,
    nextSpawn(team = 1) {
      const list = spawns[team] ?? spawns[1];
      const index = counters[team]++ % list.length;
      return { ...list[index] };
    },
  });
}
