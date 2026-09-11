export const TARGET_PLAYERS = 96;
export const HUMAN_START_CLEARANCE = 75;
export const BOT_MAX_START_RADIUS = 1300;
export const BOT_START_GRID_MARGIN = 90;

const SAFE_REPLACEMENT_ATTEMPTS = 512;
const BOT_START_COLUMNS = 12;
const BOT_START_ROWS = 8;

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

function buildWorldWideSpawns(halfSize) {
  const limit = Math.max(120, (Number(halfSize) || 1000) - BOT_START_GRID_MARGIN);
  const points = [];
  for (let row = 0; row < BOT_START_ROWS; row += 1) {
    const z = -limit + (2 * limit * row) / (BOT_START_ROWS - 1);
    for (let column = 0; column < BOT_START_COLUMNS; column += 1) {
      const x = -limit + (2 * limit * column) / (BOT_START_COLUMNS - 1);
      points.push(Object.freeze({ x, y: 0, z, angle: Math.atan2(-x, z) }));
    }
  }
  return Object.freeze(points);
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const bots = ctx.services.get("bots");
  const loadouts = ctx.services.get("bot-loadouts");
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  let serial = 0;
  let replacementCursor = 0;
  let worldSpawnCursor = 0;
  const worldWideSpawns = buildWorldWideSpawns(map.halfSize);

  function spawnBot(position = null) {
    serial += 1;
    const team = serial;
    const spec = loadouts.create(serial, team);
    const spawn = position ?? { ...worldWideSpawns[worldSpawnCursor++ % worldWideSpawns.length] };
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
    let best = null;
    let bestClearance = -Infinity;
    for (let attempt = 0; attempt < SAFE_REPLACEMENT_ATTEMPTS; attempt += 1) {
      const source = worldWideSpawns[replacementCursor++ % worldWideSpawns.length];
      const candidate = { ...source };
      const clearance = candidateClearance(candidate, reservedHumanSpawn);
      if (clearance > bestClearance) {
        best = candidate;
        bestClearance = clearance;
      }
      if (clearance >= HUMAN_START_CLEARANCE) return candidate;
    }
    return best;
  }

  function distribution() {
    const half = Math.max(1, Number(map.halfSize) || 1000);
    const positions = bots.all().filter(bot => bot.alive).map(bot => physics.position(bot.id)).filter(Boolean);
    const sectors = Array.from({ length: 4 }, () => Array(4).fill(0));
    for (const p of positions) {
      const column = Math.max(0, Math.min(3, Math.floor(((p.x + half) / (half * 2)) * 4)));
      const row = Math.max(0, Math.min(3, Math.floor(((p.z + half) / (half * 2)) * 4)));
      sectors[row][column] += 1;
    }
    const xs = positions.map(p => p.x), zs = positions.map(p => p.z);
    return {
      liveBots: positions.length,
      minX: xs.length ? Math.min(...xs) : null, maxX: xs.length ? Math.max(...xs) : null,
      minZ: zs.length ? Math.min(...zs) : null, maxZ: zs.length ? Math.max(...zs) : null,
      sectors, worldHalfSize: half, spawnSlots: worldWideSpawns.length,
    };
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
    distribution,
    spawnPoints: worldWideSpawns,
  });
}
