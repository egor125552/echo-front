export const WAREHOUSE_TRAFFIC_SAMPLE_MS = 300;
export const WAREHOUSE_TRAFFIC_WINDOW_MS = 3_200;
export const WAREHOUSE_TRAFFIC_COMMIT_MS = 8_000;
export const WAREHOUSE_TRAFFIC_APPROACH_RADIUS = 42;
export const WAREHOUSE_TRAFFIC_QUEUE_GAP = 0.92;
export const WAREHOUSE_TRAFFIC_LANES = Object.freeze([-0.68, 0, 0.68]);

export const manifest = {
  id: "battle-royale-bot-warehouse-traffic",
  version: "1.0.0",
  requires: [
    "bot-controller", "bot-combat", "bot-brain", "bot-perception",
    "movement", "entities", "battle-royale", "map-test-arena",
  ],
  capabilities: [
    "services.consume", "services.provide",
    "components.read",
  ],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function wrapAngle(value) {
  let angle = Number(value) || 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function distance2(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function insideRect(point, rect, padding = 0) {
  if (!point || !rect) return false;
  return Number(point.x) >= Number(rect.minX) - padding
    && Number(point.x) <= Number(rect.maxX) + padding
    && Number(point.z) >= Number(rect.minZ) - padding
    && Number(point.z) <= Number(rect.maxZ) + padding;
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

function laneFor(botId) {
  return WAREHOUSE_TRAFFIC_LANES[stableHash(`${botId}:warehouse-lane`) % WAREHOUSE_TRAFFIC_LANES.length];
}

function sideFor(botId, transform, building) {
  const z = Number(transform?.z) || 0;
  if (z > Number(building.maxZ) + 0.5) return 1;
  if (z < Number(building.minZ) - 0.5) return -1;
  return stableHash(`${botId}:warehouse-side`) % 2 ? 1 : -1;
}

function steeringInput(transform, target, { sprint = false, slow = false } = {}) {
  const dx = Number(target.x) - Number(transform.x);
  const dz = Number(target.z) - Number(transform.z);
  const desired = Math.atan2(dx, -dz);
  const delta = wrapAngle(desired - (Number(transform.angle) || 0));
  const distance = Math.hypot(dx, dz);
  const heading = Math.abs(delta);
  let forward = slow ? 0.48 : 1;
  if (heading > 1.15) forward = 0.12;
  else if (heading > 0.62) forward = Math.min(forward, 0.34);
  else if (heading > 0.3) forward = Math.min(forward, 0.62);
  return {
    forward,
    strafe: 0,
    turn: clamp(delta * 1.9, -1, 1),
    sprint: Boolean(sprint && distance > 5 && heading < 0.45),
    fireHeld: false,
  };
}

function pathStats(samples) {
  if (!samples?.length) return { duration: 0, path: 0, net: 0, crossings: 0 };
  let path = 0;
  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    path += distance2(samples[index - 1], samples[index]);
    if (samples[index - 1].inside !== samples[index].inside) crossings += 1;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  return {
    duration: Math.max(0, Number(last.t) - Number(first.t)),
    path,
    net: distance2(first, last),
    crossings,
  };
}

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const botCombat = ctx.services.get("bot-combat");
  const brain = ctx.services.get("bot-brain");
  const perception = ctx.services.get("bot-perception");
  const movement = ctx.services.get("movement");
  const entities = ctx.services.get("entities");
  const battleRoyale = ctx.services.get("battle-royale");
  const map = ctx.services.get("map");

  const building = map.building;
  const door = map.doors?.find((entry) => entry.id === "warehouse-front-door") ?? {
    x: Number(building?.maxX) || 75,
    y: 0,
    z: 0,
    open: true,
  };
  const originalTick = botCombat.tick.bind(botCombat);
  const traffic = new Map();
  const counters = {
    commitments: 0,
    completed: 0,
    oscillationRecoveries: 0,
    crowdCommitments: 0,
    yields: 0,
    interruptedByCombat: 0,
    interruptedByZone: 0,
  };

  function stateFor(botId) {
    let state = traffic.get(botId);
    if (state) return state;
    state = {
      botId,
      lane: laneFor(botId),
      side: null,
      intent: null,
      commitUntil: 0,
      reason: null,
      startedAt: 0,
      samples: [],
      lastSampleAt: -Infinity,
      lastStats: { duration: 0, path: 0, net: 0, crossings: 0 },
      lastTarget: null,
      lastWaypoint: null,
      yieldUntil: 0,
    };
    traffic.set(botId, state);
    return state;
  }

  function clearCommit(state, completed = false) {
    if (state.intent && completed) counters.completed += 1;
    state.intent = null;
    state.commitUntil = 0;
    state.reason = null;
    state.startedAt = 0;
    state.lastTarget = null;
    state.lastWaypoint = null;
    state.yieldUntil = 0;
  }

  function sample(state, transform, now) {
    if (now - state.lastSampleAt < WAREHOUSE_TRAFFIC_SAMPLE_MS) return state.lastStats;
    state.lastSampleAt = now;
    state.samples.push({
      t: now,
      x: Number(transform.x) || 0,
      z: Number(transform.z) || 0,
      inside: insideRect(transform, building, -0.05),
    });
    const cutoff = now - WAREHOUSE_TRAFFIC_WINDOW_MS;
    while (state.samples.length > 2 && state.samples[0].t < cutoff) state.samples.shift();
    state.lastStats = pathStats(state.samples);
    return state.lastStats;
  }

  function oscillating(stats) {
    if (stats.duration < 1_800 || stats.path < 3.2) return false;
    if (stats.crossings >= 2) return true;
    return stats.net < 1.35 || stats.path / Math.max(0.45, stats.net) >= 2.75;
  }

  function warehouseTargetIntent(transform, decision) {
    const target = targetFromDecision(decision);
    if (!target || !building) return { target: null, intent: null };
    const currentInside = insideRect(transform, building, -0.05);
    const targetInside = insideRect(target, building, -0.05);
    if (!currentInside && targetInside) return { target, intent: "enter" };
    if (currentInside && !targetInside && Number(transform.y) < 0.75) return { target, intent: "exit" };
    return { target, intent: null };
  }

  function nearWarehouse(transform) {
    if (!building) return false;
    const center = {
      x: (Number(building.minX) + Number(building.maxX)) / 2,
      z: (Number(building.minZ) + Number(building.maxZ)) / 2,
    };
    const halfWidth = (Number(building.maxX) - Number(building.minX)) / 2;
    const halfDepth = (Number(building.maxZ) - Number(building.minZ)) / 2;
    const dx = Math.max(0, Math.abs(Number(transform.x) - center.x) - halfWidth);
    const dz = Math.max(0, Math.abs(Number(transform.z) - center.z) - halfDepth);
    return Math.hypot(dx, dz) <= WAREHOUSE_TRAFFIC_APPROACH_RADIUS;
  }

  function nearbyDoorBots(now) {
    const list = [];
    for (const bot of bots.all()) {
      if (!bot.alive) continue;
      const transform = ctx.components.get(bot.id, "Transform");
      if (!transform || Number(transform.y) > 0.85) continue;
      if (distance2(transform, door) <= 7.5) list.push({ bot, transform, state: stateFor(bot.id) });
    }
    return list;
  }

  function startCommit(state, intent, target, now, reason, transform) {
    if (state.intent === intent && now < state.commitUntil) return;
    state.intent = intent;
    state.commitUntil = now + WAREHOUSE_TRAFFIC_COMMIT_MS;
    state.reason = reason;
    state.startedAt = now;
    state.lastTarget = target ? { x: Number(target.x) || 0, y: Number(target.y) || 0, z: Number(target.z) || 0 } : null;
    state.side = sideFor(state.botId, transform, building);
    state.yieldUntil = 0;
    counters.commitments += 1;
    if (reason === "oscillation") counters.oscillationRecoveries += 1;
    if (reason === "crowd") counters.crowdCommitments += 1;
  }

  function entryWaypoint(state, transform) {
    const westX = Number(building.minX) - 1.6;
    const eastX = Number(building.maxX) + 1.75;
    const sideZ = state.side > 0
      ? Number(building.maxZ) + 1.65
      : Number(building.minZ) - 1.65;
    const laneZ = Number(door.z) + state.lane;

    if (insideRect(transform, building, -0.05)) {
      return { x: Number(building.maxX) - 4.0, y: 0, z: laneZ * 0.35, stage: "clear-inside" };
    }

    if (Number(transform.x) < Number(building.minX) - 0.45) {
      if (Math.abs(Number(transform.z) - sideZ) > 0.72) {
        return { x: westX, y: 0, z: sideZ, stage: "clear-west-side" };
      }
      return { x: eastX, y: 0, z: sideZ, stage: "cross-side" };
    }

    if (
      Number(transform.x) < eastX - 0.65
      && (Number(transform.z) > Number(building.maxZ) + 0.35
        || Number(transform.z) < Number(building.minZ) - 0.35)
    ) {
      return { x: eastX, y: 0, z: sideZ, stage: "cross-side" };
    }

    if (Math.abs(Number(transform.z) - laneZ) > 0.5 || Number(transform.x) > eastX + 0.55) {
      return { x: eastX, y: 0, z: laneZ, stage: "door-lane" };
    }

    return { x: Number(building.maxX) - 1.9, y: 0, z: laneZ, stage: "cross-door" };
  }

  function exitWaypoint(state, transform) {
    const laneZ = Number(door.z) + state.lane;
    if (!insideRect(transform, building, -0.05)) {
      return { x: Number(building.maxX) + 2.1, y: 0, z: laneZ, stage: "clear-outside" };
    }
    if (Math.abs(Number(transform.z) - laneZ) > 0.5) {
      return { x: Number(building.maxX) - 1.8, y: 0, z: laneZ, stage: "door-lane" };
    }
    return { x: Number(building.maxX) + 2.1, y: 0, z: laneZ, stage: "cross-door" };
  }

  function completedCommit(state, transform) {
    if (state.intent === "enter") {
      return insideRect(transform, building, -0.08)
        && Number(transform.x) <= Number(building.maxX) - 2.2;
    }
    if (state.intent === "exit") {
      return !insideRect(transform, building, 0.05)
        && Number(transform.x) >= Number(building.maxX) + 1.6;
    }
    return true;
  }

  function blockedByQueue(botId, transform, waypoint, activeBots) {
    const dx = Number(waypoint.x) - Number(transform.x);
    const dz = Number(waypoint.z) - Number(transform.z);
    const length = Math.hypot(dx, dz);
    if (length < 0.01) return false;
    const ux = dx / length;
    const uz = dz / length;
    for (const other of activeBots) {
      if (other.bot.id === botId || !other.bot.alive) continue;
      const ox = Number(other.transform.x) - Number(transform.x);
      const oz = Number(other.transform.z) - Number(transform.z);
      const forward = ox * ux + oz * uz;
      if (forward <= 0.05 || forward >= WAREHOUSE_TRAFFIC_QUEUE_GAP) continue;
      const lateral = Math.abs(ox * -uz + oz * ux);
      if (lateral <= 0.48) return true;
    }
    return false;
  }

  function coordinate(now) {
    if (!building || !battleRoyale.isActive()) return;
    const doorBots = nearbyDoorBots(now);
    const crowd = doorBots.length >= 3;
    const activeBots = bots.all()
      .filter((bot) => bot.alive)
      .map((bot) => ({ bot, transform: ctx.components.get(bot.id, "Transform") }))
      .filter((entry) => entry.transform);

    for (const bot of bots.all()) {
      if (!bot.alive) continue;
      const transform = ctx.components.get(bot.id, "Transform");
      const input = ctx.components.get(bot.id, "Input");
      if (!transform || !input || Number(transform.y) > 0.85 || !nearWarehouse(transform)) continue;
      const state = stateFor(bot.id);
      const stats = sample(state, transform, now);

      const visible = perception.visibleEnemies?.(bot.id, 28, { now, limit: 1 }) ?? [];
      const threat = brain.threatFor?.(bot.id, now) ?? null;
      if (visible.length || threat) {
        if (state.intent) counters.interruptedByCombat += 1;
        clearCommit(state, false);
        continue;
      }

      if (battleRoyale.zoneSteeringTarget?.(bot.id, now)) {
        if (state.intent) counters.interruptedByZone += 1;
        clearCommit(state, false);
        continue;
      }

      const decision = brain.commitmentFor?.(bot.id) ?? null;
      const desired = warehouseTargetIntent(transform, decision);
      const doorDistance = distance2(transform, door);
      const isOscillating = oscillating(stats);
      const crowdCandidate = crowd && doorDistance <= 8.5 && desired.intent;

      if (!state.intent && desired.intent) {
        const proactive = desired.intent === "enter" && doorDistance <= 22;
        if (isOscillating) startCommit(state, desired.intent, desired.target, now, "oscillation", transform);
        else if (crowdCandidate) startCommit(state, desired.intent, desired.target, now, "crowd", transform);
        else if (proactive) startCommit(state, desired.intent, desired.target, now, "approach", transform);
      }

      if (!state.intent) continue;
      if (now >= state.commitUntil) {
        clearCommit(state, false);
        continue;
      }
      if (completedCommit(state, transform)) {
        clearCommit(state, true);
        continue;
      }

      if (!door.open && distance2(transform, door) <= 3.1 && typeof map.setDoorOpen === "function") {
        map.setDoorOpen(door.id, true, bot.id, now);
      }

      const waypoint = state.intent === "enter"
        ? entryWaypoint(state, transform)
        : exitWaypoint(state, transform);
      state.lastWaypoint = waypoint;

      if (blockedByQueue(bot.id, transform, waypoint, activeBots)) {
        if (now >= state.yieldUntil) {
          state.yieldUntil = now + 180 + (stableHash(`${bot.id}:${Math.floor(now / 350)}:yield`) % 220);
          counters.yields += 1;
        }
        movement.setInput(bot.id, {
          forward: now < state.yieldUntil ? 0 : 0.18,
          strafe: 0,
          turn: steeringInput(transform, waypoint).turn,
          sprint: false,
          fireHeld: false,
        });
        continue;
      }

      state.yieldUntil = 0;
      const slow = waypoint.stage === "door-lane" || waypoint.stage === "cross-door";
      movement.setInput(bot.id, steeringInput(transform, waypoint, {
        sprint: !slow,
        slow,
      }));
    }
  }

  botCombat.tick = (dt, now = Date.now()) => {
    const result = originalTick(dt, now);
    coordinate(now);
    return result;
  };

  function clearBot(entityId) {
    traffic.delete(entityId);
  }
  ctx.events?.on?.("entity:died", ({ entityId }) => clearBot(entityId));
  ctx.events?.on?.("entity:removed", ({ entityId }) => clearBot(entityId));
  ctx.events?.on?.("entity:respawned", ({ entityId }) => clearBot(entityId));

  ctx.services.provide("warehouse-traffic", {
    stateFor(botId) {
      const state = traffic.get(botId);
      if (!state) return null;
      return {
        botId,
        lane: state.lane,
        side: state.side,
        intent: state.intent,
        reason: state.reason,
        commitUntil: state.commitUntil,
        lastStats: { ...state.lastStats },
        lastWaypoint: state.lastWaypoint ? { ...state.lastWaypoint } : null,
      };
    },
    summary() {
      let active = 0;
      let oscillatingBots = 0;
      for (const state of traffic.values()) {
        if (state.intent) active += 1;
        if (oscillating(state.lastStats)) oscillatingBots += 1;
      }
      return {
        active,
        tracked: traffic.size,
        oscillatingBots,
        ...counters,
      };
    },
  });
}
