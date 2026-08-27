export const WAREHOUSE_DOOR_COMBAT_RADIUS = 8.5;
export const WAREHOUSE_WALL_FLOW_MARGIN = 4;
export const WAREHOUSE_COMBAT_LANES = Object.freeze([-0.7, 0, 0.7]);
export const WAREHOUSE_QUEUE_FORWARD_GAP = 0.86;
export const WAREHOUSE_QUEUE_LATERAL_GAP = 0.5;

export const manifest = {
  id: "battle-royale-bot-warehouse-combat-flow",
  version: "1.1.0",
  requires: [
    "bot-controller", "bot-combat", "bot-brain", "bot-perception",
    "movement", "battle-royale", "map-test-arena",
  ],
  capabilities: ["services.consume", "services.provide", "components.read"],
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

function distance2(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function insideBuilding(position, building, padding = -0.05) {
  if (!position || !building) return false;
  return Number(position.x) >= Number(building.minX) - padding
    && Number(position.x) <= Number(building.maxX) + padding
    && Number(position.z) >= Number(building.minZ) - padding
    && Number(position.z) <= Number(building.maxZ) + padding;
}

function laneFor(botId) {
  return WAREHOUSE_COMBAT_LANES[
    stableHash(`${botId}:warehouse-combat-lane`) % WAREHOUSE_COMBAT_LANES.length
  ];
}

function worldMovementToLocal(angle, dx, dz) {
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return { forward: 0, strafe: 0 };
  const x = dx / length;
  const z = dz / length;
  return {
    forward: Math.sin(angle) * x - Math.cos(angle) * z,
    strafe: Math.cos(angle) * x + Math.sin(angle) * z,
  };
}

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const botCombat = ctx.services.get("bot-combat");
  const brain = ctx.services.get("bot-brain");
  const perception = ctx.services.get("bot-perception");
  const movement = ctx.services.get("movement");
  const battleRoyale = ctx.services.get("battle-royale");
  const map = ctx.services.get("map");
  const building = map.building;
  const door = map.doors?.find((entry) => entry.id === "warehouse-front-door") ?? {
    x: Number(building?.maxX) || 75,
    y: 0,
    z: 0,
  };
  const originalTick = botCombat.tick.bind(botCombat);
  const counters = {
    doorCombatFrames: 0,
    crossDoorFrames: 0,
    wallStabilizations: 0,
    evadeFrames: 0,
    independentLegFrames: 0,
    queueYields: 0,
  };

  function nearEastWall(transform) {
    if (!building) return false;
    return Number(transform.x) >= Number(building.maxX) - 1.25
      && Number(transform.x) <= Number(building.maxX) + WAREHOUSE_WALL_FLOW_MARGIN
      && Number(transform.z) >= Number(building.minZ) - 2
      && Number(transform.z) <= Number(building.maxZ) + 2;
  }

  function doorWaypoint(botId, transform, entering) {
    const lane = laneFor(botId);
    const laneZ = Number(door.z) + lane;
    if (entering) {
      if (Number(transform.x) > Number(building.maxX) + 1.15 || Math.abs(Number(transform.z) - laneZ) > 0.48) {
        return { x: Number(building.maxX) + 1.45, z: laneZ, lane, stage: "align-outside" };
      }
      return { x: Number(building.maxX) - 2.15, z: laneZ, lane, stage: "cross-in" };
    }
    if (Number(transform.x) < Number(building.maxX) - 1.0 || Math.abs(Number(transform.z) - laneZ) > 0.48) {
      return { x: Number(building.maxX) - 1.45, z: laneZ, lane, stage: "align-inside" };
    }
    return { x: Number(building.maxX) + 2.15, z: laneZ, lane, stage: "cross-out" };
  }

  function queued(botId, transform, waypoint, activeBots) {
    const dx = Number(waypoint.x) - Number(transform.x);
    const dz = Number(waypoint.z) - Number(transform.z);
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return false;
    const ux = dx / length;
    const uz = dz / length;
    for (const other of activeBots) {
      if (other.bot.id === botId || !other.bot.alive) continue;
      if (Math.abs(laneFor(other.bot.id) - waypoint.lane) > 0.12) continue;
      const ox = Number(other.transform.x) - Number(transform.x);
      const oz = Number(other.transform.z) - Number(transform.z);
      const ahead = ox * ux + oz * uz;
      if (ahead <= 0.06 || ahead >= WAREHOUSE_QUEUE_FORWARD_GAP) continue;
      const lateral = Math.abs(ox * -uz + oz * ux);
      if (lateral <= WAREHOUSE_QUEUE_LATERAL_GAP) return true;
    }
    return false;
  }

  function moveLegsToward(bot, transform, input, waypoint, activeBots) {
    if (queued(bot.id, transform, waypoint, activeBots)) {
      counters.queueYields += 1;
      movement.setInput(bot.id, {
        forward: 0,
        strafe: 0,
        turn: input.turn,
        sprint: false,
        fireHeld: input.fireHeld,
      });
      return;
    }

    const local = worldMovementToLocal(
      Number(transform.angle) || 0,
      Number(waypoint.x) - Number(transform.x),
      Number(waypoint.z) - Number(transform.z),
    );
    const speedScale = waypoint.stage.startsWith("cross") ? 0.72 : 0.58;
    movement.setInput(bot.id, {
      forward: clamp(local.forward * speedScale, -0.82, 0.82),
      strafe: clamp(local.strafe * speedScale, -0.82, 0.82),
      // Keep the combat brain's turn and fire decision. Legs navigate independently.
      turn: input.turn,
      sprint: false,
      fireHeld: input.fireHeld,
    });
    counters.independentLegFrames += 1;
  }

  function stabilizeBot(bot, transform, now, activeBots) {
    if (Number(transform.y) > 0.85 || battleRoyale.zoneSteeringTarget?.(bot.id, now)) return;
    const input = ctx.components.get(bot.id, "Input");
    if (!input) return;

    const visible = perception.visibleEnemies?.(bot.id, 28, { now, limit: 1 }) ?? [];
    const target = visible[0] ?? null;
    const threat = brain.threatFor?.(bot.id, now) ?? null;
    if (!target && !threat) return;

    const decision = brain.commitmentFor?.(bot.id) ?? null;
    const doorDistance = distance2(transform, door);
    const atDoor = doorDistance <= WAREHOUSE_DOOR_COMBAT_RADIUS;
    const atWall = nearEastWall(transform);
    if (!atDoor && !atWall) return;

    const evading = decision?.goal === "evade";
    if (atDoor) {
      counters.doorCombatFrames += 1;
      const targetTransform = target?.transform ?? null;
      const selfInside = insideBuilding(transform, building);
      const targetInside = targetTransform ? insideBuilding(targetTransform, building) : selfInside;
      const oppositeSides = Boolean(targetTransform && selfInside !== targetInside);

      if (oppositeSides && !evading) {
        if (!door.open && distance2(transform, door) <= 3.1 && typeof map.setDoorOpen === "function") {
          map.setDoorOpen(door.id, true, bot.id, now);
        }
        const waypoint = doorWaypoint(bot.id, transform, !selfInside);
        moveLegsToward(bot, transform, input, waypoint, activeBots);
        counters.crossDoorFrames += 1;
        return;
      }

      if (evading) {
        counters.evadeFrames += 1;
        movement.setInput(bot.id, {
          forward: clamp(input.forward, -0.42, 0.08),
          strafe: 0,
          turn: input.turn,
          sprint: false,
          fireHeld: input.fireHeld,
        });
        return;
      }

      // Same-side firefight at the doorway: don't pace left/right through the
      // entrance. Hold the opening and keep aiming/firing.
      movement.setInput(bot.id, {
        forward: clamp(input.forward, 0, 0.12),
        strafe: 0,
        turn: input.turn,
        sprint: false,
        fireHeld: input.fireHeld,
      });
      return;
    }

    if (atWall && (Math.abs(Number(input.strafe) || 0) > 0.12 || Number(input.forward) < -0.05)) {
      counters.wallStabilizations += 1;
      movement.setInput(bot.id, {
        forward: evading ? clamp(input.forward, -0.36, 0) : clamp(input.forward, 0, 0.15),
        strafe: 0,
        turn: input.turn,
        sprint: false,
        fireHeld: input.fireHeld,
      });
    }
  }

  botCombat.tick = (dt, now = Date.now()) => {
    const result = originalTick(dt, now);
    if (!battleRoyale.isActive()) return result;
    const activeBots = bots.all()
      .filter((bot) => bot.alive)
      .map((bot) => ({ bot, transform: ctx.components.get(bot.id, "Transform") }))
      .filter((entry) => entry.transform && Number(entry.transform.y) <= 0.85);
    for (const entry of activeBots) stabilizeBot(entry.bot, entry.transform, now, activeBots);
    return result;
  };

  ctx.services.provide("warehouse-combat-flow", {
    summary() { return { ...counters }; },
  });
}
