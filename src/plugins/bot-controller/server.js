export const manifest = {
  id: "bot-controller",
  version: "1.0.0",
  requires: ["entities"],
  capabilities: [
    "services.consume", "services.provide",
    "components.register", "components.read", "components.write",
    "events.on",
  ],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  ctx.components.register("Bot");

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    if (!spec.bot) return;
    ctx.components.add(entityId, "Bot", {
      reactionUntil: 0,
      wanderTurn: (entityId.charCodeAt(0) % 2 ? 1 : -1) * 0.35,
    });
  });

  ctx.events.on("entity:removed", ({ entityId }) => ctx.components.remove(entityId, "Bot"));

  ctx.services.provide("bots", {
    all() {
      return entities.all().filter((entity) => entity.bot);
    },
    isBot(entityId) {
      return ctx.components.has(entityId, "Bot");
    },
  });
}
