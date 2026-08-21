export const manifest = {
  id: "entities",
  version: "1.0.0",
  requires: [],
  capabilities: ["services.provide", "events.emit"],
};

export async function setup(ctx) {
  const entities = new Map();

  const api = {
    spawn(spec = {}) {
      const id = spec.id ?? crypto.randomUUID();
      if (entities.has(id)) throw new Error(`Entity already exists: ${id}`);
      const meta = {
        id,
        kind: spec.kind ?? "entity",
        name: spec.name ?? spec.kind ?? "Entity",
        bot: Boolean(spec.bot),
        alive: spec.alive !== false,
      };
      entities.set(id, meta);
      ctx.events.emit("entity:spawned", { entityId: id, spec: { ...spec, id }, meta });
      return id;
    },
    remove(id) {
      const meta = entities.get(id);
      if (!meta) return false;
      entities.delete(id);
      ctx.events.emit("entity:removed", { entityId: id, meta });
      return true;
    },
    get(id) {
      return entities.get(id);
    },
    all() {
      return [...entities.values()];
    },
    setAlive(id, alive) {
      const meta = entities.get(id);
      if (meta) meta.alive = alive;
    },
  };

  ctx.services.provide("entities", api);
}
