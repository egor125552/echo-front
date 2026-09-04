export const BOT_BUILDING_STAIR_APPROACH_OFFSET = 1.15;
export const BOT_BUILDING_STAIR_ALIGN_TOLERANCE = 0.3;
export const BOT_BUILDING_STAIR_CAPTURE_Y = 0.12;

export const manifest = {
  id: "battle-royale-bot-building-stairs",
  version: "1.0.0",
  requires: [
    "bot-controller", "bot-combat", "bot-brain", "movement",
    "battle-royale", "map-test-arena",
  ],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapAngle(value) {
  let angle = finite(value);
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function targetFromDecision(decision) {
  if (!decision) return null;
  return decision.target?.transform
    ?? decision.target
    ?? decision.resumeTarget?.transform
    ?? decision.resumeTarget
    ?? decision.moveTarget
    ?? null;
}

function stairGeometry(stair) {
  if (!stair) return null;
  const run = Math.max(0.8, Math.abs(finite(stair.run, 5)));
  const width = Math.max(0.8, Math.abs(finite(stair.width, 3)));
  const rise = Math.max(0, Math.abs(finite(stair.rise, 3.2)));
  const direction = String(stair.risesToward ?? "west");
  const x = finite(stair.x);
  const z = finite(stair.z);
  const lowY = finite(stair.y);
  const highY = lowY + rise;
  const halfRun = run / 2;
  const halfWidth = width / 2;
  let minX;
  let maxX;
  let minZ;
  let maxZ;
  if (direction === "north" || direction === "south") {
    minX = x - halfWidth;
    maxX = x + halfWidth;
    minZ = z - halfRun;
    maxZ = z + halfRun;
  } else {
    minX = x - halfRun;
    maxX = x + halfRun;
    minZ = z - halfWidth;
    maxZ = z + halfWidth;
  }

  const crossingInset = 0.5;
  const approachOffset = BOT_BUILDING_STAIR_APPROACH_OFFSET;
  let bottom;
  let approach;
  if (direction === "east") {
    bottom = { x: minX - crossingInset, y: lowY, z };
    approach = { x: minX - approachOffset, y: lowY, z };
  } else if (direction === "north") {
    bottom = { x, y: lowY, z: maxZ + crossingInset };
    approach = { x, y: lowY, z: maxZ + approachOffset };
  } else if (direction === "south") {
    bottom = { x, y: lowY, z: minZ - crossingInset };
    approach = { x, y: lowY, z: minZ - approachOffset };
  } else {
    bottom = { x: maxX + crossingInset, y: lowY, z };
    approach = { x: maxX + approachOffset, y: lowY, z };
  }

  return {
    direction,
    lowY,
    highY,
    bounds: { minX, maxX, minZ, maxZ },
    bottom,
    approach,
  };
}

function insideHorizontal(position, bounds, padding = 0) {
  return finite(position?.x) >= finite(bounds?.minX) - padding
    && finite(position?.x) <= finite(bounds?.maxX) + padding
    && finite(position?.z) >= finite(bounds?.minZ) - padding
    && finite(position?.z) <= finite(bounds?.maxZ) + padding;
}

function matchingStair(map, route) {
  const candidates = (map.walls ?? [])
    .filter((entry) => entry?.kind === "building-stair")
    .filter((entry) => String(entry.buildingId ?? "") === String(route?.buildingId ?? ""))
    .map((entry) => ({ entry, geometry: stairGeometry(entry) }))
    .filter((value) => value.geometry);
  if (!candidates.length) return null;
  candidates.sort((a, b) => (
    distance2(a.geometry.bottom, route) - distance2(b.geometry.bottom, route)
  ));
  return candidates[0];
}

function steeringInput(transform, target, previous = {}) {
  const desired = Math.atan2(
    finite(target?.x) - finite(transform?.x),
    -(finite(target?.z) - finite(transform?.z)),
  );
  const delta = wrapAngle(desired - finite(transform?.angle));
  const heading = Math.abs(delta);
  const distance = distance2(transform, target);
  let forward = 0.78;
  if (heading > 0.62) forward = 0;
  else if (heading > 0.28) forward = 0.34;
  if (distance < 0.55) forward = Math.min(forward, 0.42);
  return {
    forward,
    strafe: 0,
    turn: clamp(delta * 1.9, -1, 1),
    sprint: false,
    fireHeld: Boolean(previous.fireHeld),
  };
}

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const botCombat = ctx.services.get("bot-combat");
  const brain = ctx.services.get("bot-brain");
  const movement = ctx.services.get("movement");
  const battleRoyale = ctx.services.get("battle-royale");
  const map = ctx.services.get("map");
  const originalTick = botCombat.tick.bind(botCombat);
  const counters = {
    correctedFrames: 0,
    correctedBots: new Set(),
  };

  function correct(bot, now) {
    const transform = ctx.components.get(bot.id, "Transform");
    const input = ctx.components.get(bot.id, "Input");
    if (!transform || !input) return;

    const decision = brain.commitmentFor?.(bot.id, now) ?? null;
    if (!decision || decision.goal === "engage" || decision.goal === "evade") return;
    const target = targetFromDecision(decision);
    if (!target || typeof map.navigationWaypoint !== "function") return;
    const route = map.navigationWaypoint(transform, target);
    if (route?.kind !== "stair" || !route.buildingId) return;

    const matched = matchingStair(map, route);
    if (!matched) return;
    const { geometry } = matched;

    // This correction is intentionally only for the lower entrance. The old
    // combat controller already handles the ramp traversal and the top landing;
    // its bug was assuming every lower entrance sits east of the ramp, which is
    // only true for the legacy warehouse stair.
    if (finite(route.y) > geometry.lowY + 0.35) return;
    if (finite(transform.y) > geometry.lowY + 0.55) return;
    if (insideHorizontal(transform, geometry.bounds, 0.05)
      && finite(transform.y) > geometry.lowY + BOT_BUILDING_STAIR_CAPTURE_Y) return;

    const direction = geometry.direction;
    const lateralError = direction === "north" || direction === "south"
      ? Math.abs(finite(transform.x) - finite(geometry.approach.x))
      : Math.abs(finite(transform.z) - finite(geometry.approach.z));
    const atApproach = distance2(transform, geometry.approach) <= BOT_BUILDING_STAIR_ALIGN_TOLERANCE;
    const aligned = lateralError <= BOT_BUILDING_STAIR_ALIGN_TOLERANCE;
    const desired = atApproach && aligned ? geometry.bottom : geometry.approach;

    movement.setInput(bot.id, steeringInput(transform, desired, input));
    counters.correctedFrames += 1;
    counters.correctedBots.add(bot.id);
  }

  botCombat.tick = (dt, now = Date.now()) => {
    const result = originalTick(dt, now);
    if (!battleRoyale.isActive()) return result;
    for (const bot of bots.all()) {
      if (!bot?.alive) continue;
      correct(bot, now);
    }
    return result;
  };

  ctx.services.provide("bot-building-stairs", {
    summary() {
      return {
        correctedFrames: counters.correctedFrames,
        correctedBots: counters.correctedBots.size,
      };
    },
  });
}
