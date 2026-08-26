export const manifest = {
  id: "battle-royale-observer",
  version: "1.0.1",
  requires: [
    "bot-controller", "entities", "battle-royale", "bot-brain",
    "bot-state-machine", "bot-perception",
    "battle-royale-bot-interest", "map-test-arena",
  ],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "events.on",
  ],
};

function distance2(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function insideBuilding(position, building) {
  return Boolean(position && building)
    && Number(position.x) >= building.minX
    && Number(position.x) <= building.maxX
    && Number(position.z) >= building.minZ
    && Number(position.z) <= building.maxZ;
}

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const entities = ctx.services.get("entities");
  const battleRoyale = ctx.services.get("battle-royale");
  const brain = ctx.services.get("bot-brain");
  const stateMachine = ctx.services.get("bot-state-machine");
  const perception = ctx.services.get("bot-perception");
  const interest = ctx.services.get("bot-interest");
  const map = ctx.services.get("map");

  let interval = {
    fired: 0,
    hits: 0,
    kills: 0,
    sounds: 0,
    doors: 0,
  };
  const lastPositions = new Map();

  ctx.events.on("weapon:fired", () => { interval.fired += 1; });
  ctx.events.on("combat:damage", (packet) => {
    if ((Number(packet?.healthApplied) || 0) > 0 || (Number(packet?.armorAbsorbed) || 0) > 0) interval.hits += 1;
    if (packet?.killed) interval.kills += 1;
  });
  ctx.events.on("sound:spatial", () => { interval.sounds += 1; });
  ctx.events.on("world:door", () => { interval.doors += 1; });

  function snapshot({ resetInterval = true, sampleLimit = 24 } = {}) {
    const stateCounts = {};
    const aliveBots = [];
    const suspicious = [];
    const building = map?.building ?? null;
    const upperY = Math.max(1, Number(building?.upperY) || 3.2);
    let visibleBots = 0;
    let firingBots = 0;
    let warehouseBots = 0;
    let warehouseGround = 0;
    let warehouseUpper = 0;
    let botsWithHeardSound = 0;
    let botsWithPoi = 0;
    let barelyMoved = 0;

    for (const bot of bots.all()) {
      if (!bot?.alive) continue;
      const transform = ctx.components.get(bot.id, "Transform");
      const input = ctx.components.get(bot.id, "Input");
      const botState = ctx.components.get(bot.id, "Bot");
      if (!transform) continue;

      const brainState = brain.stateFor?.(bot.id) ?? stateMachine.stateFor?.(bot.id) ?? null;
      const goal = brainState?.machineState || brainState?.decision?.goal || "unknown";
      stateCounts[goal] = (stateCounts[goal] ?? 0) + 1;

      const visible = perception.visibleEnemies?.(bot.id, 28, { limit: 4 }) ?? [];
      if (visible.length) visibleBots += 1;
      if (input?.fireHeld) firingBots += 1;

      const heard = interest.heardFor?.(bot.id) ?? null;
      const assignment = interest.assignmentFor?.(bot.id) ?? null;
      if (heard) botsWithHeardSound += 1;
      if (assignment) botsWithPoi += 1;

      const inside = insideBuilding(transform, building);
      if (inside) {
        warehouseBots += 1;
        if (Number(transform.y) > upperY / 2) warehouseUpper += 1;
        else warehouseGround += 1;
      }

      const previous = lastPositions.get(bot.id);
      const movedSinceLast = previous ? distance2(previous, transform) : null;
      if (previous && movedSinceLast < 1.0) barelyMoved += 1;
      lastPositions.set(bot.id, { x: transform.x, y: transform.y, z: transform.z });

      const decision = brainState?.decision ?? null;
      const item = {
        id: bot.id,
        goal,
        x: Number(transform.x) || 0,
        y: Number(transform.y) || 0,
        z: Number(transform.z) || 0,
        location: map.locationAt?.(transform) ?? null,
        visible: visible.map((enemy) => enemy.entityId),
        fireHeld: Boolean(input?.fireHeld),
        forward: Number(input?.forward) || 0,
        turn: Number(input?.turn) || 0,
        stuckSamples: Number(botState?.stuckSamples) || 0,
        movedSinceLast,
        targetEntityId: decision?.targetEntityId ?? null,
        targetKind: decision?.target?.kind ?? null,
        targetPoint: decision?.target && Number.isFinite(Number(decision.target.x))
          ? { x: decision.target.x, y: decision.target.y ?? 0, z: decision.target.z }
          : null,
        heard: heard ? {
          sourceId: heard.sourceId ?? null,
          key: heard.key ?? null,
          confidence: heard.confidence ?? null,
          x: heard.x,
          y: heard.y,
          z: heard.z,
        } : null,
        poi: assignment ? {
          pointId: assignment.pointId ?? null,
          group: assignment.group ?? null,
        } : null,
      };

      aliveBots.push(item);
      if (
        item.stuckSamples >= 2
        || (previous && movedSinceLast < 0.6 && Math.abs(item.forward) > 0.5)
        || (item.fireHeld && item.visible.length === 0)
        || (item.goal === "traverse" && !inside)
      ) suspicious.push(item);
    }

    const events = { ...interval };
    if (resetInterval) interval = { fired: 0, hits: 0, kills: 0, sounds: 0, doors: 0 };
    const limit = Math.max(1, Math.min(64, Number(sampleLimit) || 24));

    return {
      match: battleRoyale.status?.() ?? null,
      aliveEntities: entities.all().filter((entity) => entity.alive).length,
      aliveBots: aliveBots.length,
      stateCounts,
      activity: {
        visibleBots,
        firingBots,
        botsWithHeardSound,
        botsWithPoi,
        warehouseBots,
        warehouseGround,
        warehouseUpper,
        barelyMoved,
      },
      intervalEvents: events,
      suspicious: suspicious.slice(0, limit),
      sample: aliveBots.slice(0, limit),
    };
  }

  ctx.services.provide("br-observer", {
    snapshot,
  });
}
