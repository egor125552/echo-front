export const DROPZONE_VEHICLE_ID = "br-jeep-2";
export const DROPZONE_VEHICLE_OFFSET = 12;

export const manifest = {
  id: "battle-royale-dropzone-vehicle",
  version: "1.0.0",
  requires: [
    "battle-royale-parachute",
    "battle-royale-vehicle-fleet",
    "battle-royale-vehicle",
    "rapier-physics",
    "entities",
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
  const placedFor = new Set();

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

  function placeNear(entityId, landingPosition = null, now = Date.now()) {
    const entity = entities.get(entityId);
    if (!entity || entity.bot || entity.kind !== "human") return null;
    if (placedFor.has(entityId)) return vehicles.stateFor(DROPZONE_VEHICLE_ID);

    const vehicle = vehicles.stateFor(DROPZONE_VEHICLE_ID);
    const body = physics.dynamicBody(DROPZONE_VEHICLE_ID);
    const transform = ctx.components.get(entityId, "Transform");
    if (!vehicle || vehicle.occupied || !body || !transform) return null;

    const landing = landingPosition ?? transform;
    const parking = chooseParkingPoint(landing, finite(transform.angle));
    body.setTranslation({
      x: parking.x,
      y: parking.y + 1.25,
      z: parking.z,
    }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.wakeUp?.();
    physics.syncQueries?.();
    placedFor.add(entityId);

    const state = vehicles.stateFor(DROPZONE_VEHICLE_ID);
    ctx.events.emit("vehicle:dropzone-placed", {
      entityId,
      vehicleId: DROPZONE_VEHICLE_ID,
      x: state?.x ?? parking.x,
      y: state?.y ?? parking.y + 1.25,
      z: state?.z ?? parking.z,
      distance: state ? distance2(landing, state) : distance2(landing, parking),
      now,
    });
    return state;
  }

  function assertNear(position, maximumDistance = 18) {
    const state = vehicles.stateFor(DROPZONE_VEHICLE_ID);
    if (!state) throw new Error(`Dropzone vehicle not found: ${DROPZONE_VEHICLE_ID}`);
    const distance = distance2(position, state);
    if (distance > Number(maximumDistance)) {
      throw new Error(`Dropzone vehicle is ${distance.toFixed(2)} m away, expected <= ${maximumDistance}`);
    }
    return { vehicle: state, distance };
  }

  ctx.events.on("parachute:landed", ({ entityId, x, y, z, now }) => {
    placeNear(entityId, { x, y, z }, Number(now) || Date.now());
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    placedFor.delete(entityId);
  });

  ctx.services.provide("dropzone-vehicle", {
    vehicleId: DROPZONE_VEHICLE_ID,
    offset: DROPZONE_VEHICLE_OFFSET,
    placeNear,
    assertNear,
  });
}
