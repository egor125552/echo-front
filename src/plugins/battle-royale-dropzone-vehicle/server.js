export const DROPZONE_VEHICLE_ID = "br-supercar-1";
export const DROPZONE_VEHICLE_OFFSET = 12;

export const manifest = {
  id: "battle-royale-dropzone-vehicle",
  version: "1.2.0",
  requires: [
    "battle-royale-parachute",
    "battle-royale-vehicle-fleet",
    "battle-royale-vehicle",
    "rapier-physics",
    "entities",
    "match-api",
  ],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on", "events.emit"],
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

export async function setup(ctx) {
  const vehicles = ctx.services.get("vehicles");
  const physics = ctx.services.get("physics");
  const entities = ctx.services.get("entities");
  const matchApi = ctx.services.get("match-api");
  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);
  const assignedByPlayer = new Map();
  const assignedVehicles = new Map();

  function groundCandidate(x, z, originY) {
    const hit = physics.raycastSupportWorld(
      { x, y: originY, z },
      { x: 0, y: -1, z: 0 },
      100,
    );
    if (!hit || hit.worldObject?.kind !== "ground") return null;
    return {
      x,
      y: originY - finite(hit.distance),
      z,
    };
  }

  function chooseParkingPoint(position, angle = 0) {
    const x = finite(position?.x);
    const z = finite(position?.z);
    const y = Math.max(20, finite(position?.y) + 20);
    const right = { x: Math.cos(angle), z: Math.sin(angle) };
    const forward = { x: Math.sin(angle), z: -Math.cos(angle) };
    const candidates = [
      { x: x + right.x * DROPZONE_VEHICLE_OFFSET, z: z + right.z * DROPZONE_VEHICLE_OFFSET },
      { x: x - right.x * DROPZONE_VEHICLE_OFFSET, z: z - right.z * DROPZONE_VEHICLE_OFFSET },
      { x: x - forward.x * (DROPZONE_VEHICLE_OFFSET + 3), z: z - forward.z * (DROPZONE_VEHICLE_OFFSET + 3) },
      { x: x + forward.x * (DROPZONE_VEHICLE_OFFSET + 3), z: z + forward.z * (DROPZONE_VEHICLE_OFFSET + 3) },
    ];
    for (const candidate of candidates) {
      const grounded = groundCandidate(candidate.x, candidate.z, y);
      if (grounded) return grounded;
    }
    return groundCandidate(x + DROPZONE_VEHICLE_OFFSET, z, y)
      ?? { x: x + DROPZONE_VEHICLE_OFFSET, y: 0, z };
  }

  function candidateVehicle(entityId) {
    const assigned = assignedByPlayer.get(entityId);
    if (assigned) {
      const state = vehicles.stateFor(assigned);
      if (state && (!state.occupied || state.driverId === entityId)) return state;
    }

    const candidates = (vehicles.snapshot?.() ?? [])
      .filter((vehicle) => vehicle.kind === "supercar")
      .filter((vehicle) => !vehicle.occupied)
      .filter((vehicle) => !assignedVehicles.has(vehicle.id))
      .sort((a, b) => {
        if (a.id === DROPZONE_VEHICLE_ID && b.id !== DROPZONE_VEHICLE_ID) return -1;
        if (b.id === DROPZONE_VEHICLE_ID && a.id !== DROPZONE_VEHICLE_ID) return 1;
        return String(a.id).localeCompare(String(b.id));
      });
    return candidates[0] ?? null;
  }

  function assignVehicle(entityId, vehicleId) {
    const previous = assignedByPlayer.get(entityId);
    if (previous && previous !== vehicleId) assignedVehicles.delete(previous);
    assignedByPlayer.set(entityId, vehicleId);
    assignedVehicles.set(vehicleId, entityId);
  }

  function placeNear(entityId, landingPosition = null, now = Date.now()) {
    const entity = entities.get(entityId);
    if (!entity || entity.bot || entity.kind !== "human") return null;

    const existingVehicleId = assignedByPlayer.get(entityId);
    if (existingVehicleId) return vehicles.stateFor(existingVehicleId);

    const vehicle = candidateVehicle(entityId);
    const body = vehicle ? physics.dynamicBody(vehicle.id) : null;
    const transform = ctx.components.get(entityId, "Transform");
    if (!vehicle || !body || !transform) return null;

    const landing = landingPosition ?? transform;
    const parking = chooseParkingPoint(landing, finite(transform.angle));
    const bodyHeight = vehicle.kind === "supercar" ? 1.05 : 1.25;
    body.setTranslation({
      x: parking.x,
      y: parking.y + bodyHeight,
      z: parking.z,
    }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.wakeUp?.();
    physics.syncQueries?.();
    assignVehicle(entityId, vehicle.id);

    const state = vehicles.stateFor(vehicle.id);
    const distance = state ? distance2(landing, state) : distance2(landing, parking);
    ctx.events.emit("vehicle:dropzone-placed", {
      entityId,
      vehicleId: vehicle.id,
      vehicleKind: state?.kind ?? vehicle.kind,
      vehicleName: state?.accessibleName ?? vehicle.accessibleName ?? "суперкар",
      x: state?.x ?? parking.x,
      y: state?.y ?? parking.y + bodyHeight,
      z: state?.z ?? parking.z,
      distance,
      now,
    });
    return state;
  }

  function assignedFor(entityId) {
    const vehicleId = assignedByPlayer.get(entityId) ?? null;
    return vehicleId ? vehicles.stateFor(vehicleId) : null;
  }

  function assertNear(position, maximumDistance = 18, entityId = null) {
    const states = entityId && assignedByPlayer.has(entityId)
      ? [assignedFor(entityId)].filter(Boolean)
      : (vehicles.snapshot?.() ?? []).filter((vehicle) => vehicle.kind === "supercar");
    const nearest = states
      .map((vehicle) => ({ vehicle, distance: distance2(position, vehicle) }))
      .sort((a, b) => a.distance - b.distance)[0] ?? null;
    if (!nearest) throw new Error("No dropzone vehicle found");
    if (nearest.distance > Number(maximumDistance)) {
      throw new Error(`Dropzone vehicle is ${nearest.distance.toFixed(2)} m away, expected <= ${maximumDistance}`);
    }
    return nearest;
  }

  ctx.events.on("parachute:landed", ({ entityId, x, y, z, now }) => {
    placeNear(entityId, { x, y, z }, Number(now) || Date.now());
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    const vehicleId = assignedByPlayer.get(entityId);
    if (vehicleId) assignedVehicles.delete(vehicleId);
    assignedByPlayer.delete(entityId);
  });

  matchApi.eventsForPlayer = (playerId, packets = []) => {
    const selected = originalEventsForPlayer(playerId, packets);
    const seen = new Set(selected);
    for (const packet of packets) {
      if (packet?.event !== "vehicle:dropzone-placed") continue;
      if (packet?.payload?.entityId !== playerId) continue;
      if (seen.has(packet)) continue;
      seen.add(packet);
      selected.push(packet);
    }
    return selected;
  };

  ctx.services.provide("dropzone-vehicle", {
    vehicleId: DROPZONE_VEHICLE_ID,
    offset: DROPZONE_VEHICLE_OFFSET,
    placeNear,
    assignedFor,
    assertNear,
  });
}
