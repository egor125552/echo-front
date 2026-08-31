export const manifest = {
  id: "battle-royale-building-targets",
  version: "1.1.0",
  requires: [
    "battle-royale-navigation",
    "map-test-arena",
    "battle-royale-building-factory",
    "battle-royale-ground-navigation",
  ],
  capabilities: ["services.consume"],
};

const FRONT_APPROACH_DISTANCE = 6.5;
const LEGACY_DOOR_OFFSET = 1.45;
const TARGET_MATCH_DISTANCE = 0.4;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value = {}) {
  return { x: finite(value.x), y: finite(value.y), z: finite(value.z) };
}

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function insideBounds(position, bounds, padding = 0) {
  if (!position || !bounds) return false;
  return finite(position.x) >= finite(bounds.minX) - padding
    && finite(position.x) <= finite(bounds.maxX) + padding
    && finite(position.z) >= finite(bounds.minZ) - padding
    && finite(position.z) <= finite(bounds.maxZ) + padding;
}

function normalizedDirection(from, to, fallback = { x: 1, z: 0 }) {
  const dx = finite(to?.x) - finite(from?.x);
  const dz = finite(to?.z) - finite(from?.z);
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return { ...fallback };
  return { x: dx / length, z: dz / length };
}

function doorRuntime(map, doorId) {
  return (map.doors ?? []).find((door) => String(door?.id ?? "") === String(doorId ?? "")) ?? null;
}

function mainDoorScore(map, transition, index) {
  const doorId = String(transition?.doorId ?? "").toLowerCase();
  const door = doorRuntime(map, transition?.doorId);
  const name = String(door?.name ?? "").toLowerCase();
  let score = Math.max(0, 20 - index);
  if (/front|main|entrance/.test(doorId)) score += 160;
  if (/входн|главн|front|main|entrance/.test(name)) score += 140;
  if (/west|east|north|south/.test(doorId)) score += 2;
  return score;
}

function exteriorEntranceForTopology(map, building) {
  const candidates = (building?.transitions ?? [])
    .map((transition, index) => ({ transition, index }))
    .filter(({ transition }) => (
      String(transition?.kind ?? "") === "door"
      && (String(transition?.from ?? "") === "outside" || String(transition?.to ?? "") === "outside")
      && transition?.fromPoint
      && transition?.toPoint
    ))
    .sort((a, b) => mainDoorScore(map, b.transition, b.index) - mainDoorScore(map, a.transition, a.index));

  const selected = candidates[0]?.transition;
  if (!selected) return null;
  const outside = point(String(selected.from) === "outside" ? selected.fromPoint : selected.toPoint);
  const inside = point(String(selected.from) === "outside" ? selected.toPoint : selected.fromPoint);
  const outward = normalizedDirection(inside, outside);
  return {
    doorId: String(selected.doorId ?? ""),
    outside,
    inside,
    approach: {
      x: outside.x + outward.x * FRONT_APPROACH_DISTANCE,
      y: outside.y,
      z: outside.z + outward.z * FRONT_APPROACH_DISTANCE,
    },
  };
}

function exteriorPointsForLegacyDoor(door, bounds, offset = LEGACY_DOOR_OFFSET) {
  if (!door || !bounds) return null;
  const x = finite(door.x);
  const y = finite(door.y);
  const z = finite(door.z);
  const sides = [
    { side: "west", d: Math.abs(x - finite(bounds.minX)) },
    { side: "east", d: Math.abs(x - finite(bounds.maxX)) },
    { side: "north", d: Math.abs(z - finite(bounds.minZ)) },
    { side: "south", d: Math.abs(z - finite(bounds.maxZ)) },
  ].sort((a, b) => a.d - b.d);
  switch (sides[0]?.side) {
    case "west": return { outside: { x: x - offset, y, z }, inside: { x: x + offset, y, z } };
    case "north": return { outside: { x, y, z: z - offset }, inside: { x, y, z: z + offset } };
    case "south": return { outside: { x, y, z: z + offset }, inside: { x, y, z: z - offset } };
    default: return { outside: { x: x + offset, y, z }, inside: { x: x - offset, y, z } };
  }
}

function legacyWarehouseEntrance(map) {
  const building = map.building;
  if (!building) return null;
  const groundDoors = (map.doors ?? []).filter((door) => finite(door?.y) < finite(building.upperY, 3.2) / 2);
  const door = groundDoors
    .map((entry, index) => ({
      entry,
      score: (/front|main|entrance/.test(String(entry?.id ?? "").toLowerCase()) ? 200 : 0)
        + (/входн|главн|front|main|entrance/.test(String(entry?.name ?? "").toLowerCase()) ? 160 : 0)
        + Math.max(0, 20 - index),
    }))
    .sort((a, b) => b.score - a.score)[0]?.entry ?? null;
  const points = exteriorPointsForLegacyDoor(door, building);
  if (!door || !points) return null;
  const outward = normalizedDirection(points.inside, points.outside);
  return {
    id: String(building.id ?? "warehouse"),
    name: String(building.name ?? "Склад") === String(building.id ?? "warehouse") ? "Склад" : String(building.name ?? "Склад"),
    bounds: building,
    order: 10,
    arriveDistance: 1.05,
    entrance: {
      doorId: String(door.id ?? "warehouse-front-door"),
      outside: points.outside,
      inside: points.inside,
      approach: {
        x: points.outside.x + outward.x * FRONT_APPROACH_DISTANCE,
        y: points.outside.y,
        z: points.outside.z + outward.z * FRONT_APPROACH_DISTANCE,
      },
    },
    legacy: true,
  };
}

export async function setup(ctx) {
  const navigation = ctx.services.get("navigation");
  const map = ctx.services.get("map");
  const groundNavigation = ctx.services.get("ground-navigation");
  const targets = [];

  for (const building of map.navigationBuildings ?? []) {
    const id = String(building?.id ?? "").trim();
    if (!id) continue;
    const entrance = exteriorEntranceForTopology(map, building);
    const fallback = building?.metadata?.targetPosition ? point(building.metadata.targetPosition) : null;
    const target = entrance?.outside ?? fallback;
    if (!target) continue;
    targets.push({
      id,
      name: String(building.name ?? id),
      bounds: building.bounds ?? null,
      order: finite(building.metadata?.targetOrder, 12),
      arriveDistance: entrance ? 1.05 : Math.max(1, finite(building.metadata?.arriveDistance, 1)),
      entrance,
      legacy: false,
    });
  }

  const legacy = legacyWarehouseEntrance(map);
  if (legacy && !targets.some((entry) => entry.id === legacy.id)) targets.push(legacy);

  for (const building of targets) {
    const target = building.entrance?.outside;
    const fallback = (map.navigationBuildings ?? [])
      .find((entry) => String(entry?.id ?? "") === building.id)?.metadata?.targetPosition;
    const position = target ?? point(fallback);
    navigation.registerTarget({
      id: building.id,
      name: building.name,
      kind: "building",
      order: building.order,
      arriveDistance: building.arriveDistance,
      position,
      metadata: {
        buildingId: building.id,
        verticalTolerance: 2,
        declarative: !building.legacy,
        mainDoorId: building.entrance?.doorId ?? null,
        frontApproach: building.entrance?.approach ?? null,
      },
    });
  }

  // Every building target now gets a final face-on approach. The ordinary route
  // finder may bring the player around walls/corners however it needs to, but
  // before arrival it must pass through a point on the door normal, then travel
  // straight to the centre of the main entrance.
  const originalRequiredWaypoints = groundNavigation.requiredWaypoints.bind(groundNavigation);
  groundNavigation.requiredWaypoints = (from, target) => {
    const required = [...(originalRequiredWaypoints(from, target) ?? [])];
    const building = targets.find((entry) => (
      entry.entrance && distance2(target, entry.entrance.outside) <= TARGET_MATCH_DISTANCE
    ));
    if (!building?.entrance?.approach) return required;
    if (insideBounds(from, building.bounds, 0.2)) return required;
    if (distance2(from, building.entrance.outside) <= 1.8) return required;

    const approach = {
      ...building.entrance.approach,
      kind: "building-front-approach",
      buildingId: building.id,
      doorId: building.entrance.doorId,
      mandatory: true,
    };
    const previous = required.at(-1) ?? from;
    if (distance2(previous, approach) > 0.35) required.push(approach);
    return required;
  };
}
