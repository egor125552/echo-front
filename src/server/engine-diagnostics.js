import { ENGINE_DIAGNOSTICS_CONTROL } from "../config/engine-diagnostics.js";

function safe(value) {
  try { return structuredClone(value); } catch { return null; }
}

export function collectGameDiagnostics(game, { entityId = null } = {}) {
  if (!game?.host) return { active: false, reason: "game-not-created" };
  const host = game.host;
  const entitiesService = host.services.has("entities") ? host.services.get("entities") : null;
  const battleRoyale = host.services.has("battle-royale") ? host.services.get("battle-royale") : null;
  const botBrain = host.services.has("bot-brain") ? host.services.get("bot-brain") : null;
  const physics = host.services.has("physics") ? host.services.get("physics") : null;
  const allEntities = entitiesService?.all ? entitiesService.all() : [];
  const selected = entityId ? allEntities.filter((entity) => entity.id === entityId) : allEntities;

  return {
    active: true,
    generatedAt: Date.now(),
    mode: game.mode,
    controlRevision: ENGINE_DIAGNOSTICS_CONTROL.revision,
    plugins: host.plugins.map((plugin) => ({ id: plugin.manifest.id, version: plugin.manifest.version ?? null })),
    services: [...host.services.services.keys()].map((name) => ({ name, owner: host.services.owners.get(name) ?? null })),
    components: [...host.components.types].map(([name, type]) => ({ name, owner: type.owner ?? null, count: type.values.size })),
    eventQueueDepth: typeof game.pendingEventCount === "function" ? game.pendingEventCount() : null,
    physics: physics?.stats ? safe(physics.stats()) : null,
    match: battleRoyale?.status ? safe(battleRoyale.status(Date.now())) : null,
    entities: selected.slice(0, ENGINE_DIAGNOSTICS_CONTROL.maxEntities).map((entity) => ({
      ...entity,
      components: host.components.snapshot(entity.id),
      botDecision: entity.bot && botBrain?.commitmentFor ? safe(botBrain.commitmentFor(entity.id)) : null,
    })),
  };
}
