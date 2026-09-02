export const manifest = {
  id: "battle-royale-building-targets",
  version: "1.1.0",
  requires: ["battle-royale-navigation", "map-test-arena", "battle-royale-building-factory"],
  capabilities: ["services.consume", "components.read", "components.write", "events.on", "events.emit"],
};

const OUTSIDE_REGION = "outside";
const DEFAULT_DOOR_APPROACH_OFFSET = 1.45;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value = {}) {
  return {
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z),
  };
}

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function midpoint(a, b) {
  return {
    x: (finite(a?.x) + finite(b?.x)) / 2,
    y: (finite(a?.y) + finite(b?.y)) / 2,
    z: (finite(a?.z) + finite(b?.z)) / 2,
  };
}

function shortestAngleDelta(a, b) {
  let delta = finite(a) - finite(b);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function angleTo(from, target) {
  const dx = finite(target?.x) - finite(from?.x);
  const dz = finite(target?.z) - finite(from?.z);
  return Math.atan2(dx, -dz);
}

function exteriorDoorPoints(door, building, offset = DEFAULT_DOOR_APPROACH_OFFSET) {
  if (!door || !building) return null;
  const x = finite(door.x);
  const y = finite(door.y);
  const z = finite(door.z);
  const safeOffset = Math.max(0.8, finite(door.approachOffset, offset));
  const explicitSide = String(door.side ?? "").toLowerCase();
  const distances = [
    { side: "west", value: Math.abs(x - finite(building.minX)) },
    { side: "east", value: Math.abs(x - finite(building.maxX)) },
    { side: "north", value: Math.abs(z - finite(building.minZ)) },
    { side: "south", value: Math.abs(z - finite(building.maxZ)) },
  ].sort((a, b) => a.value - b.value);
  const side = ["west", "east", "north", "south"].includes(explicitSide)
    ? explicitSide
    : distances[0]?.side;

  if (side === "west") return {
    outside: { x: x - safeOffset, y, z },
    inside: { x: x + safeOffset, y, z },
  };
  if (side === "north") return {
    outside: { x, y, z: z - safeOffset },
    inside: { x, y, z: z + safeOffset },
  };
  if (side === "south") return {
    outside: { x, y, z: z + safeOffset },
    inside: { x, y, z: z - safeOffset },
  };
  return {
    outside: { x: x + safeOffset, y, z },
    inside: { x: x - safeOffset, y, z },
  };
}

function topologyEntrance(building, preferredTarget = null) {
  const candidates = (building?.transitions ?? [])
    .filter((transition) => String(transition?.kind ?? "") === "door")
    .filter((transition) => transition.from === OUTSIDE_REGION || transition.to === OUTSIDE_REGION)
    .map((transition) => {
      const outside = transition.from === OUTSIDE_REGION
        ? point(transition.fromPoint)
        : point(transition.toPoint);
      const inside = transition.from === OUTSIDE_REGION
        ? point(transition.toPoint)
        : point(transition.fromPoint);
      return {
        outside,
        inside,
        face: midpoint(outside, inside),
        doorId: transition.doorId ? String(transition.doorId) : null,
        transitionId: transition.id ? String(transition.id) : null,
      };
    });
  if (!candidates.length) return null;
  if (!preferredTarget) return candidates[0];
  return candidates.sort((a, b) => distance2(a.outside, preferredTarget) - distance2(b.outside, preferredTarget))[0];
}

function legacyEntrance(map) {
  const building = map?.building;
  if (!building) return null;
  const doors = (map.doors ?? [])
    .filter((door) => finite(door.y) < Math.max(1.2, finite(building.upperY, 3.2) / 2))
    .map((door) => ({ door, passage: exteriorDoorPoints(door, building) }))
    .filter((entry) => entry.passage)
    .sort((a, b) => {
      const ac = Math.min(
        Math.abs(finite(a.door.x) - finite(building.minX)),
        Math.abs(finite(a.door.x) - finite(building.maxX)),
        Math.abs(finite(a.door.z) - finite(building.minZ)),
        Math.abs(finite(a.door.z) - finite(building.maxZ)),
      );
      const bc = Math.min(
        Math.abs(finite(b.door.x) - finite(building.minX)),
        Math.abs(finite(b.door.x) - finite(building.maxX)),
        Math.abs(finite(b.door.z) - finite(building.minZ)),
        Math.abs(finite(b.door.z) - finite(building.maxZ)),
      );
      return ac - bc;
    });
  const chosen = doors[0];
  if (!chosen) return null;
  return {
    outside: chosen.passage.outside,
    inside: chosen.passage.inside,
    face: midpoint(chosen.passage.outside, chosen.passage.inside),
    doorId: chosen.door.id ? String(chosen.door.id) : null,
    transitionId: chosen.door.id ? `${chosen.door.id}:outside` : null,
  };
}

export async function setup(ctx) {
  const navigation = ctx.services.get("navigation");
  const map = ctx.services.get("map");
  const registered = new Set();

  function registerBuildingTarget(building) {
    const id = String(building?.id ?? "").trim();
    const configuredTarget = building?.metadata?.targetPosition;
    if (!id || !configuredTarget) return false;

    const configured = point(configuredTarget);
    const entrance = topologyEntrance(building, configured);
    const targetPosition = entrance?.outside ?? configured;
    navigation.registerTarget({
      id,
      name: String(building.name ?? id),
      kind: "building",
      order: finite(building.metadata?.targetOrder, 12),
      // Building completion is deliberately strict. The target is the exterior
      // door approach point, so a nearby wall can never count as arrival.
      arriveDistance: 1,
      position: targetPosition,
      metadata: {
        buildingId: id,
        verticalTolerance: 1.25,
        declarative: true,
        arrivalDoorId: entrance?.doorId ?? null,
        arrivalTransitionId: entrance?.transitionId ?? null,
        arrivalFacePosition: entrance?.face ?? null,
      },
    });
    registered.add(id);
    return true;
  }

  for (const building of map.navigationBuildings ?? []) registerBuildingTarget(building);

  // The original warehouse predates declarative buildings and used a point in
  // front of the east wall. Override that legacy target with its real doorway
  // as well, otherwise the old target can still announce arrival beside a wall.
  if (map.building && !registered.has("warehouse")) {
    const entrance = legacyEntrance(map);
    if (entrance) {
      navigation.registerTarget({
        id: "warehouse",
        name: String(map.building.name ?? "Склад"),
        kind: "building",
        order: 10,
        arriveDistance: 1,
        position: entrance.outside,
        metadata: {
          buildingId: String(map.building.id ?? "warehouse"),
          verticalTolerance: 1.25,
          legacyDoorTarget: true,
          arrivalDoorId: entrance.doorId,
          arrivalTransitionId: entrance.transitionId,
          arrivalFacePosition: entrance.face,
        },
      });
    }
  }

  ctx.events.on("navigation:reached", ({ entityId, targetId, targetKind, now }) => {
    if (!entityId || targetKind !== "building") return;
    const target = navigation.availableTargets(entityId)
      .find((entry) => entry.id === targetId) ?? null;
    if (!target || target.metadata?.vehicleApproach) return;
    const facePosition = target.metadata?.arrivalFacePosition;
    if (!facePosition) return;

    const transform = ctx.components.get(entityId, "Transform");
    if (!transform || distance2(transform, facePosition) < 0.05) return;
    const previousAngle = finite(transform.angle);
    const angle = angleTo(transform, facePosition);
    transform.angle = angle;
    ctx.events.emit("navigation:arrival-aligned", {
      entityId,
      targetId,
      targetName: target.name,
      targetKind: target.kind,
      doorId: target.metadata?.arrivalDoorId ?? null,
      facePosition: point(facePosition),
      previousAngle,
      angle,
      turnedRadians: Math.abs(shortestAngleDelta(angle, previousAngle)),
      now: Number(now) || Date.now(),
    });
  });
}
