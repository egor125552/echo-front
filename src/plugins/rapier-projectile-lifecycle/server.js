export const manifest = {
  id: "rapier-projectile-lifecycle",
  version: "1.0.0",
  requires: ["match-api", "rapier-projectiles", "rapier-physics"],
  capabilities: ["services.consume"],
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const projectiles = ctx.services.get("projectiles");
  const physics = ctx.services.get("physics");
  const originalStep = matchApi.step.bind(matchApi);

  matchApi.step = (dt, now = Date.now()) => {
    projectiles.beginFrame(now);
    const stepsBefore = projectiles.physicsStepCount();
    const result = originalStep(dt, now);

    // Battle Royale already advances the same Rapier world through the vehicle
    // controller. TDM normally does not. Only own the step when the wrapped match
    // did not advance Rapier itself and at least one real projectile exists.
    if (projectiles.hasActive() && projectiles.physicsStepCount() === stepsBefore) {
      const total = Math.max(0, Math.min(0.1, finite(dt)));
      if (total > 0) {
        const maxStep = Math.max(1 / 120, finite(projectiles.maxPhysicsStep, 1 / 60));
        const substeps = Math.max(1, Math.ceil(total / maxStep));
        const subDt = total / substeps;
        for (let index = 0; index < substeps; index += 1) physics.step(subDt);
      }
    }
    return result;
  };
}
