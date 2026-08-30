export const manifest = {
  id: "battle-royale-building-targets",
  version: "1.0.0",
  requires: ["battle-royale-navigation", "map-test-arena", "battle-royale-building-factory"],
  capabilities: ["services.consume"],
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function setup(ctx) {
  const navigation = ctx.services.get("navigation");
  const map = ctx.services.get("map");

  for (const building of map.navigationBuildings ?? []) {
    const id = String(building?.id ?? "").trim();
    const target = building?.metadata?.targetPosition;
    if (!id || !target) continue;
    navigation.registerTarget({
      id,
      name: String(building.name ?? id),
      kind: "building",
      order: finite(building.metadata?.targetOrder, 12),
      arriveDistance: Math.max(1.2, finite(building.metadata?.arriveDistance, 1.6)),
      position: {
        x: finite(target.x),
        y: finite(target.y),
        z: finite(target.z),
      },
      metadata: {
        buildingId: id,
        verticalTolerance: 2,
        declarative: true,
      },
    });
  }
}
