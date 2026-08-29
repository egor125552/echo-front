export const CRATE_HALF_X = 0.65;
export const CRATE_HALF_Z = 0.45;
export const CRATE_HEIGHT = 0.55;

export const manifest = {
  id: "battle-royale-crate-physics",
  version: "1.2.0",
  requires: ["rapier-physics", "map-test-arena"],
  capabilities: ["services.consume"],
};

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  const crates = Array.isArray(map.crates) ? map.crates : [];

  physics.beginBatch?.();
  try {
    for (const crate of crates) {
      // Declarative building factory crates already have their collider because
      // they may also be created dynamically. Legacy map crates still come
      // through this plugin.
      if (crate.collider) continue;
      crate.collider = physics.createWall({
        kind: "loot-crate",
        crateId: crate.id,
        accessibleName: "ящик",
        material: "wood",
        x: crate.x,
        y: crate.y ?? 0,
        z: crate.z,
        hx: CRATE_HALF_X,
        hz: CRATE_HALF_Z,
        height: CRATE_HEIGHT,
      });
    }
  } finally {
    physics.endBatch?.();
  }
}
