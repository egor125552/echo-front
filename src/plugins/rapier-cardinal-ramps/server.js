export const manifest = {
  id: "rapier-cardinal-ramps",
  version: "1.1.0",
  requires: ["rapier-physics"],
  capabilities: ["services.consume"],
};

const MAX_STEP_RISE = 0.22;
const MIN_STEP_DEPTH = 0.38;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const originalCreateRamp = physics.createRamp.bind(physics);

  physics.createRamp = (spec = {}) => {
    const direction = String(spec.risesToward ?? "west");
    if (direction !== "north" && direction !== "south") {
      return originalCreateRamp(spec);
    }

    // Rapier's legacy helper is an X-axis slope. For Z-axis stairs we build
    // physical steps. Their height must fit CharacterController autostep AND
    // their tread must be wide enough for the controller to stand on. The old
    // implementation only checked height, which could create tiny treads that
    // were descendable but impossible to climb from the bottom.
    const run = Math.max(0.2, Math.abs(finite(spec.run, 4)));
    const rise = Math.max(0, finite(spec.rise));
    const width = Math.max(0.4, Math.abs(finite(spec.width, 2)));
    const minimumStepsForRise = Math.max(1, Math.ceil(rise / MAX_STEP_RISE));
    const maximumStepsForDepth = Math.max(1, Math.floor(run / MIN_STEP_DEPTH));
    if (minimumStepsForRise > maximumStepsForDepth) {
      throw new Error(
        `Cardinal stair is too steep for walkable steps: rise=${rise.toFixed(2)} run=${run.toFixed(2)}`,
      );
    }
    const steps = minimumStepsForRise;
    const stepDepth = run / steps;
    const startZ = finite(spec.z) - run / 2;
    let firstCollider = null;

    for (let index = 0; index < steps; index += 1) {
      const order = direction === "south" ? index : steps - index - 1;
      const height = rise * ((order + 1) / steps);
      const z = startZ + stepDepth * (index + 0.5);
      const collider = physics.createWall({
        ...spec,
        kind: spec.kind ?? "building-stair",
        x: finite(spec.x),
        y: finite(spec.y),
        z,
        hx: width / 2,
        hz: stepDepth / 2 + 0.012,
        height: Math.max(0.04, height),
        run,
        rise,
        width,
        risesToward: direction,
        rampStep: index + 1,
        rampSteps: steps,
        stepRise: rise / steps,
        stepDepth,
      });
      if (!firstCollider) firstCollider = collider;
    }

    return firstCollider;
  };
}
