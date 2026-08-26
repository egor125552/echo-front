export const manifest = {
  id: "battle-royale-high-drop",
  version: "1.0.0",
  requires: ["entities", "battle-royale-parachute"],
  capabilities: ["services.consume", "events.on"],
};

export const HIGH_DROP_ALTITUDE = 500;

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const parachute = ctx.services.get("parachute");

  ctx.events.on("battle-royale:started", ({ startedAt }) => {
    const now = Number(startedAt) || Date.now();
    for (const entity of entities.all()) {
      if (!entity.alive || entity.bot || entity.kind !== "human") continue;
      parachute.launch(entity.id, { altitude: HIGH_DROP_ALTITUDE }, now);
    }
  });
}
