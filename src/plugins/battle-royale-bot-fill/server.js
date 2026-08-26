export const TARGET_PLAYERS = 96;
export const HUMAN_START_CLEARANCE = 75;
export const BOT_MAX_START_RADIUS = 325;

const SAFE_REPLACEMENT_RADIUS = BOT_MAX_START_RADIUS;
const SAFE_REPLACEMENT_ATTEMPTS = 512;
const SOURCE_START_RADII = Object.freeze([125, 190, 255, 320, 385]);
const COMPACT_START_RADII = Object.freeze([125, 175, 225, 275, 325]);

export const manifest = {
  id: "bot-fill",
  version: "2.4.1",
  requires: [
    "bot-controller", "bot-loadouts", "entities", "teams", "rapier-physics", "map-test-arena",
  ],
  capabilities: ["services.consume", "services.provide"],
};

function distance2(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

function compactInitialSpawn(spawn) {
  if (!spawn) return spawn;
  const radius = Math.hypot(Number(spawn.x) || 0, Number(spawn.z) || 0);
  if (radius < 0.001) return { ...spawn };

  let ring = 0;
  let error = Infinity;
  for (let i = 0; i < SOURCE_START_RADII.length; i += 1) {
    const candidateError = Math.abs(radius - SOURCE_START_RADII[i]);
    if (candidateError >= error) continue;
    error = candidateError;
    ring = i;
  }

  const targetRadius = COMPACT_START_RADII[ring];
  const scale = targetRadius / radius;
  return {
    ...spawn,
    x: (Number(spawn.x) || 0) * scale,
    y: Number(spawn.y) || 0,
    z: (Number(spawn.z) || 0) * scale,
  };
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const bots = ctx.services.get("bots");
  const loadouts = ctx.services.get("bot-loadouts");
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  let serial = 0;
  let replacementCursor = 0;

  function spawnBot(position = null) {
    serial += 1;
    const team = serial;
    const spec = loadouts.create(serial, team);
    const spawn = position ?? compactInitialSpawn(map.nextSpawn());
    entities.spawn({ ...spec, position: spawn });
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
    maxStartRadius: BOT_MAX_START_RADIUS,
    ensure,
    makeRoomForHuman,
  });
}
