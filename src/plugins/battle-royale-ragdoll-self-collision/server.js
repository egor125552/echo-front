export const manifest = {
  id: "battle-royale-ragdoll-self-collision",
  version: "1.0.1",
  requires: ["battle-royale-ragdoll-stability"],
  capabilities: ["services.consume", "events.emit"],
};

export async function setup(ctx) {
  const stability = ctx.services.get("ragdoll-stability");
  stability.setSelfCollisionEnabled(true);
  ctx.events.emit("ragdoll:self-collision-enabled", { enabled: true });
}
