export const manifest = {
  id: "rapier-cardinal-ramps",
  version: "1.2.0",
  requires: ["rapier-physics"],
  capabilities: ["services.consume"],
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function multiplyQuaternion(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function axisQuaternion(axis, angle) {
  const half = angle / 2;
  const sine = Math.sin(half);
  return {
    x: axis.x * sine,
    y: axis.y * sine,
    z: axis.z * sine,
    w: Math.cos(half),
  };
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const originalCreateRamp = physics.createRamp.bind(physics);

  physics.createRamp = (spec = {}) => {
    const direction = String(spec.risesToward ?? "west");
    if (direction !== "north" && direction !== "south") {
      return originalCreateRamp(spec);
    }

    const run = Math.max(0.01, Math.abs(finite(spec.run, 4)));
    const rise = Math.max(0, finite(spec.rise));
    const width = Math.max(0.4, Math.abs(finite(spec.width, 2)));
    const thickness = Math.max(0.04, Math.abs(finite(spec.thickness, 0.2)));
    const slopeAngle = Math.atan2(rise, run);

    // Build the already proven east-rising Rapier slope, then yaw the entire
    // collider into the requested north/south direction. This gives the
    // CharacterController one continuous walkable surface instead of relying
    // on autostep heuristics for a stack of tiny cuboids.
    const collider = originalCreateRamp({
      ...spec,
      run,
      rise,
      width,
      thickness,
      risesToward: "east",
      cardinalRisesToward: direction,
    });
    if (!collider) return collider;

    const yaw = direction === "north" ? Math.PI / 2 : -Math.PI / 2;
    const yawRotation = axisQuaternion({ x: 0, y: 1, z: 0 }, yaw);
    const slopeRotation = axisQuaternion({ x: 0, y: 0, z: 1 }, slopeAngle);
    collider.setRotation(multiplyQuaternion(yawRotation, slopeRotation));

    const base = collider.translation();
    const horizontalNormalOffset = Math.sin(slopeAngle) * thickness / 2;
    collider.setTranslation({
      x: finite(spec.x),
      y: base.y,
      z: finite(spec.z) + (direction === "south" ? horizontalNormalOffset : -horizontalNormalOffset),
    });
    physics.syncQueries?.();
    return collider;
  };
}
