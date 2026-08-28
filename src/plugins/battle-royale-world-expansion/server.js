export const EXPANDED_WORLD_HALF_SIZE = 1000;
export const EXPANDED_WORLD_SIZE = EXPANDED_WORLD_HALF_SIZE * 2;
export const EXPANDED_SPAWN_RADII = Object.freeze([180, 350, 520, 690, 860, 960]);
const BOUNDARY_HALF_THICKNESS = 1;
const SPAWNS_PER_RING = 20;

export const manifest = {
  id: "battle-royale-world-expansion",
  version: "1.0.0",
  requires: ["map-test-arena", "rapier-physics"],
  capabilities: ["services.consume", "services.provide"],
};

function buildSpawnPoints() {
  const points = [];
  for (let ring = 0; ring < EXPANDED_SPAWN_RADII.length; ring += 1) {
    const radius = EXPANDED_SPAWN_RADII[ring];
    const offset = ring % 2 ? Math.PI / SPAWNS_PER_RING : 0;
    for (let slot = 0; slot < SPAWNS_PER_RING; slot += 1) {
      const angle = offset + (slot * Math.PI * 2) / SPAWNS_PER_RING;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      points.push(Object.freeze({
        x,
        y: 0,
        z,
        angle: Math.atan2(-x, z),
      }));
    }
  }
  return Object.freeze(points);
}

const EXPANDED_SPAWN_POINTS = buildSpawnPoints();

export async function setup(ctx) {
  const map = ctx.services.get("map");
  const physics = ctx.services.get("physics");

  physics.beginBatch?.();
  try {
    // Remove only the original 400 m arena shell. The warehouse, stairs, doors,
    // crates and every other world collider remain untouched.
    for (let i = map.walls.length - 1; i >= 0; i -= 1) {
      const wall = map.walls[i];
      if (wall?.kind !== "world-boundary") continue;
      physics.removeWall(wall.collider);
      map.walls.splice(i, 1);
    }

    if (map.groundCollider) physics.removeWall(map.groundCollider);
    map.groundCollider = physics.createFloor({
      kind: "ground",
      material: map.defaultSurface ?? "forest",
      x: 0,
      y: 0,
      z: 0,
      hx: EXPANDED_WORLD_HALF_SIZE,
      hz: EXPANDED_WORLD_HALF_SIZE,
      thickness: 0.4,
    });

    const boundarySpecs = [
      { side: "north", x: 0, z: -EXPANDED_WORLD_HALF_SIZE, hx: EXPANDED_WORLD_HALF_SIZE, hz: BOUNDARY_HALF_THICKNESS },
      { side: "south", x: 0, z: EXPANDED_WORLD_HALF_SIZE, hx: EXPANDED_WORLD_HALF_SIZE, hz: BOUNDARY_HALF_THICKNESS },
      { side: "west", x: -EXPANDED_WORLD_HALF_SIZE, z: 0, hx: BOUNDARY_HALF_THICKNESS, hz: EXPANDED_WORLD_HALF_SIZE },
      { side: "east", x: EXPANDED_WORLD_HALF_SIZE, z: 0, hx: BOUNDARY_HALF_THICKNESS, hz: EXPANDED_WORLD_HALF_SIZE },
    ];

    for (const spec of boundarySpecs) {
      const enriched = {
        kind: "world-boundary",
        accessibleName: "граница мира",
        height: 10,
        ...spec,
      };
      const collider = physics.createWall(enriched);
      map.walls.push({ ...enriched, collider });
    }
  } finally {
    physics.endBatch?.();
  }

  map.halfSize = EXPANDED_WORLD_HALF_SIZE;
  let spawnIndex = 0;
  map.nextSpawn = () => {
    const point = EXPANDED_SPAWN_POINTS[spawnIndex % EXPANDED_SPAWN_POINTS.length];
    spawnIndex += 1;
    return { ...point };
  };

  function summary() {
    return {
      halfSize: map.halfSize,
      size: map.halfSize * 2,
      spawnPointCount: EXPANDED_SPAWN_POINTS.length,
      furthestSpawnRadius: EXPANDED_SPAWN_RADII.at(-1),
      boundaryCount: map.walls.filter((wall) => wall?.kind === "world-boundary").length,
      hasGround: Boolean(map.groundCollider),
    };
  }

  function assertExpanded(expected = {}) {
    const state = summary();
    const minHalfSize = Number(expected.minHalfSize ?? EXPANDED_WORLD_HALF_SIZE);
    if (state.halfSize < minHalfSize) {
      throw new Error(`Expected world half-size >= ${minHalfSize}, got ${state.halfSize}`);
    }
    if (state.boundaryCount !== 4) {
      throw new Error(`Expected four world boundaries, got ${state.boundaryCount}`);
    }
    if (!state.hasGround) throw new Error("Expanded world ground collider is missing");
    if (state.furthestSpawnRadius >= state.halfSize) {
      throw new Error(`Spawn radius ${state.furthestSpawnRadius} reaches world boundary ${state.halfSize}`);
    }
    return state;
  }

  ctx.services.provide("world-expansion", {
    summary,
    assertExpanded,
    spawnPoints: EXPANDED_SPAWN_POINTS,
  });
}
