export const WAREHOUSE_DOOR_COMBAT_RADIUS = 7.5;
export const WAREHOUSE_WALL_FLOW_MARGIN = 4;
export const WAREHOUSE_DOOR_CROSS_FORWARD = 0.34;

export const manifest = {
  id: "battle-royale-bot-warehouse-combat-flow",
  version: "1.0.0",
  requires: [
    "bot-controller", "bot-combat", "bot-brain", "bot-perception",
    "movement", "battle-royale", "map-test-arena",
  ],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
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
  };

  function nearEastWall(transform) {
    if (!building) return false;
    return Number(transform.x) >= Number(building.maxX) - 1.25
      && Number(transform.x) <= Number(building.maxX) + WAREHOUSE_WALL_FLOW_MARGIN
      && Number(transform.z) >= Number(building.minZ) - 2
      && Number(transform.z) <= Number(building.maxZ) + 2;
  }

  function stabilizeBot(bot, transform, now) {
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
      let forward;
      if (evading) {
        forward = clamp(input.forward, -0.5, 0.12);
        counters.evadeFrames += 1;
      } else {
        const targetTransform = target?.transform ?? null;
        const oppositeSides = targetTransform
          ? insideBuilding(transform, building) !== insideBuilding(targetTransform, building)
          : false;
        forward = oppositeSides
          ? Math.max(WAREHOUSE_DOOR_CROSS_FORWARD, Number(input.forward) || 0)
          : clamp(input.forward, 0, 0.16);
        if (oppositeSides) counters.crossDoorFrames += 1;
      }
      movement.setInput(bot.id, {
        forward,
        strafe: 0,
        turn: input.turn,
        sprint: false,
        fireHeld: input.fireHeld,
      });
      return;
    }

    // Along the east warehouse wall, generic flank/spacing behavior can turn
    // into audible left-right scraping when the wall prevents that movement.
    // Keep the bot's aim and firing decision, but stop lateral/backwards motion
    // until it has a clean route or the fight moves away from the wall.
    if (atWall && (Math.abs(Number(input.strafe) || 0) > 0.12 || Number(input.forward) < -0.05)) {
      counters.wallStabilizations += 1;
      movement.setInput(bot.id, {
        forward: evading ? clamp(input.forward, -0.42, 0) : clamp(input.forward, 0, 0.18),
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
    for (const bot of bots.all()) {
      if (!bot.alive) continue;
      const transform = ctx.components.get(bot.id, "Transform");
      if (transform) stabilizeBot(bot, transform, now);
    }
    return result;
  };

  ctx.services.provide("warehouse-combat-flow", {
    summary() { return { ...counters }; },
  });
}
