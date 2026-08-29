export const manifest = {
  id: "battle-royale-navigation-lifecycle",
  version: "1.0.0",
  requires: ["battle-royale-navigation-face"],
  capabilities: ["services.consume", "events.on"],
};

export async function setup(ctx) {
  const guidance = ctx.services.get("navigation-face");

  ctx.events.on("entity:died", ({ entityId, now }) => {
    const state = guidance.stateFor?.(entityId);
    if (!state?.enabled) return;
    guidance.disableGuidance(entityId, Number(now) || Date.now(), "dead");
  });
}
