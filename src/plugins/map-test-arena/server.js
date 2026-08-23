export const WORLD_HALF_SIZE = 50;
export const BOUNDARY_HALF_THICKNESS = 0.5;

export const manifest = {
  id: "map-test-arena",
  version: "2.0.0",
  requires: ["rapier-physics"],
  capabilities: ["services.consume", "services.provide"],
};

export function describeBlockedMove(position, attempted, moved) {
  const attemptedDistance = Math.hypot(attempted.x, attempted.z);
  if (attemptedDistance < 0.01) return null;

  const alongAttempt = (
    moved.x * attempted.x + moved.z * attempted.z
  ) / attemptedDistance;
  const lostDistance = attemptedDistance - Math.max(0, alongAttempt);
  if (lostDistance < 0.035) return null;

  const boundaryThreshold = WORLD_HALF_SIZE - 1;
  const atEast = position.x >= boundaryThreshold && attempted.x > 0;
  const atWest = position.x <= -boundaryThreshold && attempted.x < 0;
  const atSouth = position.z >= boundaryThreshold && attempted.z > 0;
  const atNorth = position.z <= -boundaryThreshold && attempted.z < 0;

  if (atEast || atWest || atSouth || atNorth) {
    return {
      kind: "world-boundary",
      speech: "Здесь пройти нельзя. Граница мира",
    };
  }

  return null;
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");

  // Large open forest training ground. Buildings and interior obstacles are
  // intentionally absent for now; only the physical world boundary remains.
  const walls = [
    { kind: "world-boundary", side: "north", x: 0, z: -WORLD_HALF_SIZE, hx: WORLD_HALF_SIZE, hz: BOUNDARY_HALF_THICKNESS },
    { kind: "world-boundary", side: "south", x: 0, z: WORLD_HALF_SIZE, hx: WORLD_HALF_SIZE, hz: BOUNDARY_HALF_THICKNESS },
    { kind: "world-boundary", side: "west", x: -WORLD_HALF_SIZE, z: 0, hx: BOUNDARY_HALF_THICKNESS, hz: WORLD_HALF_SIZE },
    { kind: "world-boundary", side: "east", x: WORLD_HALF_SIZE, z: 0, hx: BOUNDARY_HALF_THICKNESS, hz: WORLD_HALF_SIZE },
  ];
  for (const wall of walls) physics.createWall(wall);

  const spawns = {
    1: [
      { x: -28, z: 20, angle: Math.PI / 2 },
      { x: -28, z: -20, angle: Math.PI / 2 },
    ],
    2: [
      { x: 28, z: -20, angle: -Math.PI / 2 },
      { x: 28, z: 20, angle: -Math.PI / 2 },
    ],
  };
  const counters = { 1: 0, 2: 0 };

  ctx.services.provide("map", {
    id: "forest-training-ground",
    halfSize: WORLD_HALF_SIZE,
    walls,
    describeBlockedMove,
    nextSpawn(team = 1) {
      const list = spawns[team] ?? spawns[1];
      const index = counters[team]++ % list.length;
      return { ...list[index] };
    },
  });
}
