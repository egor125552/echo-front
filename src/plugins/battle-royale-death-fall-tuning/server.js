export const manifest = {
  id: "battle-royale-death-fall-tuning",
  version: "1.0.0",
  requires: ["battle-royale-ragdoll-tuning"],
  capabilities: ["services.consume"],
};

export async function setup(ctx) {
  const tuning = ctx.services.get("ragdoll-tuning");

  // A player killed in mid-air used to receive the generic `death` profile,
  // which ignored the inherited fall velocity completely. That made a body
  // travelling at terminal-ish speed arrive with plenty of linear energy but
  // almost no coherent rotation, so the first contact looked strangely dead.
  //
  // Keep the collision response solver-driven: we do not add an artificial
  // upward bounce here. We only seed angular/tangential motion from the real
  // inherited vertical speed and lower friction/damping enough for that energy
  // to continue as rolls, slides and secondary impacts.
  tuning.configureReason("death", {
    linearDamping: 0.012,
    angularDamping: 0.012,
    headAngularDamping: 0.018,
    friction: 0.26,
    x: 1.8,
    y: 0.20,
    z: 1.4,
    speedMode: "vertical",
    scaleStartKph: 20,
    scaleSpanKph: 110,
    scaleMaxExtra: 2.4,
  });

  ctx.services.provide?.("death-fall-tuning", {
    profile() {
      return tuning.currentReason("death");
    },
  });
}
