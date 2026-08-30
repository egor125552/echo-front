export const manifest = {
  id: "battle-royale-shared-human-spawn",
  version: "1.0.1",
  requires: ["entities", "map-test-arena"],
  capabilities: ["services.consume", "services.provide"],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const map = ctx.services.get("map");
  const originalSpawn = entities.spawn.bind(entities);
  let shared = null;

  entities.spawn = (spec = {}) => {
    if (spec?.kind === "human" && !spec?.bot) {
      if (!shared) {
        const initial = spec.position ?? map.nextSpawn(spec.team ?? 1);
        shared = {
          x: Number(initial?.x) || 0,
          y: Number(initial?.y) || 0,
          z: Number(initial?.z) || 0,
          angle: Number(initial?.angle) || 0,
        };
      }
      return originalSpawn({
        ...spec,
        position: { ...shared },
      });
    }
    return originalSpawn(spec);
  };

  ctx.services.provide("shared-human-spawn", {
    get position() { return shared ? { ...shared } : null; },
  });
}
