export const manifest = {
  id: "battle-royale-object-affordances",
  version: "1.0.0",
  requires: [
    "battle-royale-building-factory",
    "battle-royale-vehicle-fleet",
    "rapier-physics",
    "map-test-arena",
    "movement",
  ],
  capabilities: ["services.consume", "services.provide", "components.read", "events.emit"],
};

const DOOR_INTERACTION_MARGIN = 1.45;
const CRATE_INTERACTION_MARGIN = 1.55;
const VEHICLE_INTERACTION_MARGIN = 1.8;
const INTERACTION_VERTICAL_TOLERANCE = 2.2;
const DOOR_DEBOUNCE_MS = 450;

const VEHICLE_FOOTPRINTS = Object.freeze({
  offroad: { halfLength: 2.25, halfWidth: 1.08, halfHeight: 0.58, localY: -0.12 },
  supercar: { halfLength: 2.25, halfWidth: 1.02, halfHeight: 0.46, localY: -0.08 },
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value)));
}

function distanceToInterval(value, minimum, maximum) {
  if (value < minimum) return minimum - value;
  if (value > maximum) return value - maximum;
  return 0;
}

function doorDistance(actor, door) {
  const side = String(door.side ?? "");
  const halfWidth = Math.max(0.4, Math.abs(finite(door.width, 2.2)) / 2);
  if (side === "north" || side === "south") {
    const along = distanceToInterval(finite(actor.x), finite(door.x) - halfWidth, finite(door.x) + halfWidth);
    return Math.hypot(along, finite(actor.z) - finite(door.z));
  }
  if (side === "east" || side === "west") {
    const along = distanceToInterval(finite(actor.z), finite(door.z) - halfWidth, finite(door.z) + halfWidth);
    return Math.hypot(along, finite(actor.x) - finite(door.x));
  }
  return Math.hypot(finite(actor.x) - finite(door.x), finite(actor.z) - finite(door.z));
}

function crateDistance(actor, crate) {
  const hx = Math.max(0.82, Math.abs(finite(crate.hx, 0.9)));
  const hz = Math.max(0.62, Math.abs(finite(crate.hz, 0.7)));
  const dx = distanceToInterval(finite(actor.x), finite(crate.x) - hx, finite(crate.x) + hx);
  const dz = distanceToInterval(finite(actor.z), finite(crate.z) - hz, finite(crate.z) + hz);
  return Math.hypot(dx, dz);
}

function vehicleFootprint(vehicle) {
  return VEHICLE_FOOTPRINTS[vehicle?.kind] ?? VEHICLE_FOOTPRINTS.offroad;
}

function vehicleDistance(actor, vehicle) {
  const angle = finite(vehicle?.angle);
  const dx = finite(actor?.x) - finite(vehicle?.x);
  const dz = finite(actor?.z) - finite(vehicle?.z);
  const forward = dx * Math.sin(angle) - dz * Math.cos(angle);
  const lateral = dx * Math.cos(angle) + dz * Math.sin(angle);
  const footprint = vehicleFootprint(vehicle);
  const outsideForward = Math.max(0, Math.abs(forward) - footprint.halfLength);
  const outsideLateral = Math.max(0, Math.abs(lateral) - footprint.halfWidth);
  return Math.hypot(outsideForward, outsideLateral);
}

function lineReachesObject(physics, actor, target, acceptedIds = []) {
  if (typeof physics.raycastWorld !== "function") return true;
  const origin = { x: finite(actor.x), y: finite(actor.y) + 1, z: finite(actor.z) };
  const destination = { x: finite(target.x), y: finite(target.y) + 0.55, z: finite(target.z) };
  const direction = {
    x: destination.x - origin.x,
    y: destination.y - origin.y,
    z: destination.z - origin.z,
  };
  const distance = Math.hypot(direction.x, direction.y, direction.z);
  if (distance < 0.1) return true;
  const hit = physics.raycastWorld(origin, direction, distance + 0.2);
  if (!hit) return true;
  const object = hit.worldObject ?? {};
  const ids = new Set(acceptedIds.filter(Boolean).map(String));
  return ids.has(String(object.crateId ?? object.doorId ?? object.vehicleId ?? object.id ?? ""));
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  const vehicles = ctx.services.get("vehicles");

  const crateShells = new Map();
  const vehicleShells = new Map();
  const originalMapInteract = map.interact.bind(map);
  const originalVehicleEnter = vehicles.enter.bind(vehicles);
  const originalVehicleInteract = vehicles.interact.bind(vehicles);

  // Make loot crates physically substantial. The shell is deliberately a bit
  // larger than the decorative crate so a one-step lateral miss still bumps the
  // player into an object instead of silently slipping past it.
  for (const crate of map.crates ?? []) {
    if (!crate?.id || crateShells.has(crate.id)) continue;
    const collider = physics.createWall({
      kind: "loot-crate-presence",
      crateId: crate.id,
      buildingId: crate.buildingId ?? null,
      accessibleName: "ящик",
      interactionHint: "Нажмите E, чтобы открыть",
      material: "wood",
      x: finite(crate.x),
      y: finite(crate.y),
      z: finite(crate.z),
      hx: 0.9,
      hz: 0.7,
      height: 0.72,
    });
    crate.hx = Math.max(0.9, finite(crate.hx, 0.9));
    crate.hz = Math.max(0.7, finite(crate.hz, 0.7));
    crateShells.set(crate.id, collider);
  }

  // Add a massless collision shell around every vehicle. It changes neither
  // mass nor suspension tuning, only the physical body envelope a pedestrian
  // can bump into.
  for (const vehicle of vehicles.snapshot?.() ?? []) {
    const footprint = vehicleFootprint(vehicle);
    const collider = physics.addDynamicCuboidCollider(vehicle.id, {
      x: 0,
      y: footprint.localY,
      z: 0,
      hx: footprint.halfLength,
      hy: footprint.halfHeight,
      hz: footprint.halfWidth,
      mass: 0,
      friction: 0.72,
      restitution: 0.04,
      sensor: false,
      metadata: {
        kind: "vehicle-presence",
        vehicleId: vehicle.id,
        vehicleKind: vehicle.kind,
        accessibleName: vehicle.accessibleName ?? (vehicle.kind === "supercar" ? "суперкар" : "внедорожник"),
        interactionHint: "Нажмите E, чтобы сесть",
      },
    });
    if (collider) vehicleShells.set(vehicle.id, collider);
  }

  map.interact = ({ entityId, x, y = 0, z, now = Date.now() }) => {
    const actor = { x: finite(x), y: finite(y), z: finite(z) };

    const doorCandidate = (map.doors ?? [])
      .filter((door) => Math.abs(actor.y - finite(door.y)) <= INTERACTION_VERTICAL_TOLERANCE)
      .map((door) => ({ door, distance: doorDistance(actor, door) }))
      .filter((entry) => entry.distance <= DOOR_INTERACTION_MARGIN)
      .sort((a, b) => a.distance - b.distance)[0] ?? null;

    if (doorCandidate && lineReachesObject(physics, actor, doorCandidate.door, [doorCandidate.door.id])) {
      const door = doorCandidate.door;
      if (now - finite(door.lastToggleAt, -Infinity) < DOOR_DEBOUNCE_MS) {
        return {
          type: "door",
          entityId,
          doorId: door.id,
          name: door.name,
          open: Boolean(door.open),
          ignored: true,
          x: door.x,
          y: door.y,
          z: door.z,
        };
      }
      map.setDoorOpen(door.id, !door.open, entityId, now);
      return {
        type: "door",
        entityId,
        doorId: door.id,
        name: door.name,
        open: Boolean(door.open),
        x: door.x,
        y: door.y,
        z: door.z,
      };
    }

    const crateCandidate = (map.crates ?? [])
      .filter((crate) => !crate.opened)
      .filter((crate) => Math.abs(actor.y - finite(crate.y)) <= INTERACTION_VERTICAL_TOLERANCE)
      .map((crate) => ({ crate, distance: crateDistance(actor, crate) }))
      .filter((entry) => entry.distance <= CRATE_INTERACTION_MARGIN)
      .sort((a, b) => a.distance - b.distance)[0] ?? null;

    if (crateCandidate && lineReachesObject(physics, actor, crateCandidate.crate, [crateCandidate.crate.id])) {
      const crate = crateCandidate.crate;
      crate.opened = true;
      const payload = {
        entityId,
        crateId: crate.id,
        loot: crate.loot,
        x: crate.x,
        y: crate.y,
        z: crate.z,
      };
      ctx.events.emit("loot:opened", payload);
      return { type: "crate", ...payload };
    }

    return originalMapInteract({ entityId, x, y, z, now });
  };

  function expandedVehicleCandidate(playerId, requestedVehicleId = null) {
    const transform = ctx.components.get(playerId, "Transform");
    if (!transform) return null;
    return (vehicles.snapshot?.() ?? [])
      .filter((vehicle) => !vehicle.occupied)
      .filter((vehicle) => !requestedVehicleId || vehicle.id === requestedVehicleId)
      .filter((vehicle) => Math.abs(finite(transform.y) - finite(vehicle.y)) <= 2.8)
      .map((vehicle) => ({ vehicle, distance: vehicleDistance(transform, vehicle) }))
      .filter((entry) => entry.distance <= VEHICLE_INTERACTION_MARGIN)
      .sort((a, b) => a.distance - b.distance)[0]?.vehicle ?? null;
  }

  vehicles.enter = (playerId, now = Date.now(), requestedVehicleId = null) => {
    if (originalVehicleEnter(playerId, now, requestedVehicleId)) return true;
    const transform = ctx.components.get(playerId, "Transform");
    const candidate = expandedVehicleCandidate(playerId, requestedVehicleId);
    if (!transform || !candidate) return false;

    // The fleet service still performs all authoritative entry checks. We only
    // present it a temporary proximity probe at the chassis center after the
    // player's real position has already passed our footprint/LOS checks.
    const original = { x: transform.x, y: transform.y, z: transform.z };
    transform.x = candidate.x;
    transform.y = candidate.y;
    transform.z = candidate.z;
    const entered = originalVehicleEnter(playerId, now, candidate.id);
    if (!entered) {
      transform.x = original.x;
      transform.y = original.y;
      transform.z = original.z;
    }
    return entered;
  };

  vehicles.interact = (playerId, now = Date.now()) => {
    if (vehicles.isDriving?.(playerId)) return originalVehicleInteract(playerId, now);
    return vehicles.enter(playerId, now);
  };

  ctx.services.provide("object-affordances", {
    crateShellCount: crateShells.size,
    vehicleShellCount: vehicleShells.size,
    nearestVehicle(playerId) {
      const transform = ctx.components.get(playerId, "Transform");
      const candidates = (vehicles.snapshot?.() ?? [])
        .map((vehicle) => ({
          id: vehicle.id,
          kind: vehicle.kind,
          distanceFromBody: transform ? vehicleDistance(transform, vehicle) : Infinity,
        }))
        .sort((a, b) => a.distanceFromBody - b.distanceFromBody);
      return candidates[0] ?? null;
    },
    constants: {
      doorInteractionMargin: DOOR_INTERACTION_MARGIN,
      crateInteractionMargin: CRATE_INTERACTION_MARGIN,
      vehicleInteractionMargin: VEHICLE_INTERACTION_MARGIN,
      vehicleFootprints: VEHICLE_FOOTPRINTS,
    },
  });
}
