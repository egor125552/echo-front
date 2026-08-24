export const TARGET_PLAYERS = 96;
export const HUMAN_START_CLEARANCE = 75;

const SAFE_REPLACEMENT_RADIUS = 340;
const SAFE_REPLACEMENT_ATTEMPTS = 512;

export const manifest = {
  id: "bot-fill",
  version: "2.1.0",
  requires: ["bot-controller", "bot-loadouts", "entities", "teams", "rapier-physics"],
  capabilities: ["services.consume", "services.provide"],
};

function distance2(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const bots = ctx.services.get("bots");
  const loadouts = ctx.services.get("bot-loadouts");
  const physics = ctx.services.get("physics");
  let serial = 0;
  let replacementCursor = 0;

  function spawnBot(position = null) {
    serial += 1;
    const team = serial;
    const spec = loadouts.create(serial, team);
    entities.spawn(position ? { ...spec, position } : spec);
    return spec.id;
  }

  function removeOneBot() {
    const all = bots.all();
    const bot = all.find((entry) => entry.alive) ?? all[0];
    if (!bot) return null;
    const position = physics.position(bot.id);
    entities.remove(bot.id);
    return position ? { x: position.x, y: position.y ?? 0, z: position.z } : null;
  }

  function candidateClearance(candidate, reservedHumanSpawn) {
    let clearance = reservedHumanSpawn ? distance2(candidate, reservedHumanSpawn) : Infinity;
    for (const bot of bots.all()) {
      const position = physics.position(bot.id);
      if (!position) continue;
      clearance = Math.min(clearance, distance2(candidate, position));
    }
    return clearance;
  }

  function safeReplacementPosition(reservedHumanSpawn) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    let best = null;
    let bestClearance = -Infinity;

    for (let attempt = 0; attempt < SAFE_REPLACEMENT_ATTEMPTS; attempt += 1) {
      const angle = replacementCursor * golden;
      replacementCursor += 1;
      const candidate = {
        x: Math.cos(angle) * SAFE_REPLACEMENT_RADIUS,
        y: 0,
        z: Math.sin(angle) * SAFE_REPLACEMENT_RADIUS,
      };
      candidate.angle = Math.atan2(-candidate.x, candidate.z);
      const clearance = candidateClearance(candidate, reservedHumanSpawn);
      if (clearance > bestClearance) {
        best = candidate;
        bestClearance = clearance;
      }
      if (clearance >= HUMAN_START_CLEARANCE) return candidate;
    }

    return best;
  }

  function ensure() {
    physics.beginBatch?.();
    try {
      while (entities.all().length < TARGET_PLAYERS) spawnBot();
      while (entities.all().length > TARGET_PLAYERS && bots.all().length) removeOneBot();
    } finally {
      physics.endBatch?.();
    }
  }

  function makeRoomForHuman() {
    if (entities.all().length < TARGET_PLAYERS) return false;

    physics.beginBatch?.();
    try {
      const reservedHumanSpawn = removeOneBot();
      if (!reservedHumanSpawn) return true;

      for (const bot of [...bots.all()]) {
        const position = physics.position(bot.id);
        if (!position) continue;
        if (distance2(position, reservedHumanSpawn) >= HUMAN_START_CLEARANCE) continue;
        entities.remove(bot.id);
      }

      while (entities.all().length < TARGET_PLAYERS - 1) {
        const replacement = safeReplacementPosition(reservedHumanSpawn);
        if (!replacement) break;
        spawnBot(replacement);
      }
      return true;
    } finally {
      physics.endBatch?.();
    }
  }

  ctx.services.provide("bot-fill", {
    targetPlayers: TARGET_PLAYERS,
    ensure,
    makeRoomForHuman,
  });
}
