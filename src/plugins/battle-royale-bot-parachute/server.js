export const manifest = {
  id: "battle-royale-bot-parachute",
  version: "1.0.0",
  requires: [
    "entities", "movement", "battle-royale-parachute", "match-api", "battle-royale", "map-test-arena",
  ],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

const DEFAULT_ALTITUDE = 500;
const MAP_MARGIN = 42;
const MIN_LAUNCH_OFFSET = 145;
const LAUNCH_OFFSET_SPREAD = 115;
const MIN_DEPLOY_ALTITUDE = 205;
const DEPLOY_ALTITUDE_SPREAD = 145;
const WAREHOUSE_DROP_PERCENT = 18;
const UPPER_WAREHOUSE_PERCENT = 42;
const MAX_TURN_COMMAND = 1;

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

function angleTo(from, to) {
  return Math.atan2((Number(to?.x) || 0) - (Number(from?.x) || 0), -((Number(to?.z) || 0) - (Number(from?.z) || 0)));
}

function distance2(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function isBot(entity) {
  return Boolean(entity?.alive && entity.bot);
}

function warehouseTarget(seed, map) {
  const building = map?.building;
  if (!building) return null;
  const upperY = Number(building.upperY) || 3.2;
  const upper = ((seed >>> 8) % 100) < UPPER_WAREHOUSE_PERCENT;
  if (!upper) {
    const side = (seed >>> 16) % 4;
    const padding = 5.5 + ((seed >>> 20) % 35) / 10;
    const along = (((seed >>> 4) % 1000) / 1000 - 0.5) * 14;
    if (side === 0) return { x: building.minX - padding, y: 0, z: along, kind: "warehouse-outside" };
    if (side === 1) return { x: building.maxX + padding, y: 0, z: along, kind: "warehouse-outside" };
    if (side === 2) return { x: (building.minX + building.maxX) / 2 + along, y: 0, z: building.minZ - padding, kind: "warehouse-outside" };
    return { x: (building.minX + building.maxX) / 2 + along, y: 0, z: building.maxZ + padding, kind: "warehouse-outside" };
  }

  const points = [
    { x: building.minX + 5.5, y: upperY, z: -7.5 },
    { x: building.minX + 5.5, y: upperY, z: 7.5 },
    { x: (building.minX + building.maxX) / 2 - 3.5, y: upperY, z: -7.0 },
    { x: (building.minX + building.maxX) / 2 - 3.5, y: upperY, z: 7.0 },
    { x: building.maxX - 4.5, y: upperY, z: -7.0 },
    { x: building.maxX - 4.5, y: upperY, z: 7.0 },
  ];
  const point = points[(seed >>> 14) % points.length];
  return { ...point, kind: "warehouse-upper" };
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const movement = ctx.services.get("movement");
  const parachute = ctx.services.get("parachute");
  const matchApi = ctx.services.get("match-api");
  const battleRoyale = ctx.services.get("battle-royale");
  const map = ctx.services.get("map");

  const originalStep = matchApi.step.bind(matchApi);
  const assignments = new Map();
  let generation = 0;

  function mapLimit() {
    return Math.max(80, Number(map?.halfSize) || 400) - MAP_MARGIN;
  }

  function clampToMap(point) {
    const limit = mapLimit();
    return {
      ...point,
      x: clamp(point.x, -limit, limit),
      z: clamp(point.z, -limit, limit),
    };
  }

  function chooseTarget(bot, transform) {
    const seed = stableHash(`${bot.id}:drop:${generation}`);
    if ((seed % 100) < WAREHOUSE_DROP_PERCENT) {
      const hot = warehouseTarget(seed, map);
      if (hot) return clampToMap(hot);
    }

    const jitterAngle = ((seed >>> 6) % 65536) / 65536 * Math.PI * 2;
    const jitterDistance = 8 + ((seed >>> 18) % 23);
    return clampToMap({
      x: (Number(transform?.x) || 0) + Math.cos(jitterAngle) * jitterDistance,
      y: 0,
      z: (Number(transform?.z) || 0) + Math.sin(jitterAngle) * jitterDistance,
      kind: "field",
    });
  }

  function chooseLaunch(bot, target) {
    const seed = stableHash(`${bot.id}:launch:${generation}`);
    const direction = ((seed >>> 4) % 65536) / 65536 * Math.PI * 2;
    const offset = MIN_LAUNCH_OFFSET + (seed % (LAUNCH_OFFSET_SPREAD + 1));
    const point = clampToMap({
      x: target.x - Math.cos(direction) * offset,
      y: DEFAULT_ALTITUDE,
      z: target.z - Math.sin(direction) * offset,
    });
    return {
      ...point,
      y: DEFAULT_ALTITUDE,
      angle: angleTo(point, target),
    };
  }

  function chooseDeployAltitude(bot, launch, target) {
    const seed = stableHash(`${bot.id}:deploy:${generation}`);
    const base = MIN_DEPLOY_ALTITUDE + (seed % (DEPLOY_ALTITUDE_SPREAD + 1));
    const distance = distance2(launch, target);
    const reachFloor = distance / 1.38 + 85;
    const risk = (seed >>> 9) % 100;
    const riskOffset = risk >= 94 ? -55 : risk >= 78 ? -25 : 0;
    return clamp(Math.max(base + riskOffset, reachFloor), 175, 390);
  }

  function withBotAsParachutist(bot, callback) {
    if (!bot) return null;
    const savedBot = bot.bot;
    const savedKind = bot.kind;
    bot.bot = false;
    bot.kind = "human";
    try {
      return callback();
    } finally {
      bot.bot = savedBot;
      bot.kind = savedKind;
    }
  }

  function assignAndLaunch(bot, now) {
    const transform = ctx.components.get(bot.id, "Transform");
    if (!transform) return null;
    const target = chooseTarget(bot, transform);
    const launch = chooseLaunch(bot, target);
    const deployAltitude = chooseDeployAltitude(bot, launch, target);
    const seed = stableHash(`${bot.id}:pilot:${generation}`);
    const skill = 0.68 + ((seed >>> 11) % 300) / 1000;
    const assignment = {
      entityId: bot.id,
      generation,
      target,
      launch,
      deployAltitude,
      skill,
      status: "freefall",
      assignedAt: now,
      deployedAt: null,
      landedAt: null,
      impactSpeed: null,
      damage: 0,
      killed: false,
      landingError: null,
    };
    assignments.set(bot.id, assignment);
    const state = withBotAsParachutist(bot, () => parachute.launch(bot.id, launch, now));
    if (!state) {
      assignment.status = "launch-failed";
      return assignment;
    }
    ctx.events.emit("bot-parachute:assigned", {
      entityId: bot.id,
      target: { ...target },
      launch: { ...launch },
      deployAltitude,
      now,
    });
    return assignment;
  }

  function setFreefallInput(bot, transform, assignment) {
    const desired = angleTo(transform, assignment.target);
    const error = wrapAngle(desired - (Number(transform.angle) || 0));
    const aligned = Math.abs(error) < 0.3;
    movement.setInput(bot.id, {
      forward: aligned ? 1 : 0.35,
      strafe: 0,
      turn: clamp(error * 1.35, -MAX_TURN_COMMAND, MAX_TURN_COMMAND),
      sprint: true,
      fireHeld: false,
    });
  }

  function setCanopyInput(bot, transform, state, assignment) {
    const desired = angleTo(transform, assignment.target);
    const error = wrapAngle(desired - (Number(transform.angle) || 0));
    const distance = distance2(transform, assignment.target);
    const clearance = Number.isFinite(Number(state.groundDistance))
      ? Math.max(0, Number(state.groundDistance))
      : Math.max(0, Number(transform.y) || 0);

    let forward = 1;
    if (clearance < 60) {
      if (distance <= 4.5) forward = -0.58;
      else if (distance <= 9) forward = -0.28;
      else if (distance <= 16) forward = 0.35;
    } else if (distance <= 10) {
      forward = 0.05;
    } else if (distance <= 22) {
      forward = 0.52;
    }

    if (state.landingApproach) {
      if (distance <= 5) forward = -0.5;
      else if (distance <= 11) forward = -0.16;
      else if (distance <= 20) forward = 0.42;
    }

    const turnGain = 1.35 + assignment.skill * 0.8;
    const strafe = clamp(error * turnGain, -1, 1);
    movement.setInput(bot.id, {
      forward,
      strafe,
      turn: 0,
      sprint: false,
      fireHeld: false,
    });
  }

  function pilot(bot, now) {
    const assignment = assignments.get(bot.id);
    const state = ctx.components.get(bot.id, "Parachute");
    const transform = ctx.components.get(bot.id, "Transform");
    if (!assignment || !state || !transform || !bot.alive) return;
    if (!state.airborne) {
      movement.setInput(bot.id, {});
      return;
    }

    if (state.phase === "freefall") {
      assignment.status = "freefall";
      setFreefallInput(bot, transform, assignment);
      const clearance = Number.isFinite(Number(state.groundDistance))
        ? Number(state.groundDistance)
        : Number(transform.y) || 0;
      const distance = distance2(transform, assignment.target);
      const reachPressure = distance > Math.max(45, clearance * 1.28);
      if (clearance <= assignment.deployAltitude || reachPressure) {
        if (parachute.deploy(bot.id, now)) {
          assignment.status = "deployed";
          assignment.deployedAt = now;
        }
      }
      return;
    }

    if (state.phase === "deployed") {
      assignment.status = "deployed";
      setCanopyInput(bot, transform, state, assignment);
      return;
    }

    movement.setInput(bot.id, {});
  }

  function deploymentBots() {
    return entities.all().filter((entity) => entity.alive && entity.bot);
  }

  ctx.events.on("battle-royale:started", ({ startedAt }) => {
    generation += 1;
    assignments.clear();
    const now = Number(startedAt) || Date.now();
    for (const bot of deploymentBots()) assignAndLaunch(bot, now);
  });

  ctx.events.on("parachute:deployed", ({ entityId, now }) => {
    const assignment = assignments.get(entityId);
    if (!assignment) return;
    assignment.status = "deployed";
    assignment.deployedAt = Number(now) || Date.now();
  });

  ctx.events.on("parachute:landed", ({ entityId, impactSpeed, damage, killed, now }) => {
    const assignment = assignments.get(entityId);
    if (!assignment) return;
    const transform = ctx.components.get(entityId, "Transform");
    assignment.status = killed ? "dead" : "landed";
    assignment.landedAt = Number(now) || Date.now();
    assignment.impactSpeed = Math.max(0, Number(impactSpeed) || 0);
    assignment.damage = Math.max(0, Number(damage) || 0);
    assignment.killed = Boolean(killed);
    assignment.landingError = transform ? distance2(transform, assignment.target) : null;
    movement.setInput(entityId, {});
    ctx.events.emit("bot-parachute:landed", {
      entityId,
      targetKind: assignment.target.kind,
      landingError: assignment.landingError,
      impactSpeed: assignment.impactSpeed,
      damage: assignment.damage,
      killed: assignment.killed,
      now: assignment.landedAt,
    });
  });

  ctx.events.on("entity:died", ({ entityId }) => {
    const assignment = assignments.get(entityId);
    if (!assignment) return;
    if (assignment.status !== "landed") assignment.status = "dead";
    assignment.killed = true;
    movement.setInput(entityId, {});
  });

  matchApi.step = (dt, now = Date.now()) => {
    const deploymentActive = Boolean(battleRoyale.status(now)?.deployment?.active);
    if (!deploymentActive) return originalStep(dt, now);

    const bots = deploymentBots();
    const saved = [];
    for (const bot of bots) {
      saved.push({ bot, botFlag: bot.bot, kind: bot.kind });
      bot.bot = false;
      bot.kind = "human";
    }

    try {
      for (const { bot } of saved) pilot(bot, now);
      return originalStep(dt, now);
    } finally {
      for (const entry of saved) {
        const current = entities.get(entry.bot.id);
        if (!current) continue;
        current.bot = entry.botFlag;
        current.kind = entry.kind;
      }
    }
  };

  ctx.services.provide("bot-parachutes", {
    assignmentFor(entityId) {
      const value = assignments.get(entityId);
      return value ? structuredClone(value) : null;
    },
    summary() {
      const values = [...assignments.values()];
      const landed = values.filter((value) => value.landedAt != null);
      const errors = landed.map((value) => Number(value.landingError)).filter(Number.isFinite);
      const impacts = landed.map((value) => Number(value.impactSpeed)).filter(Number.isFinite);
      return {
        generation,
        assigned: values.length,
        freefall: values.filter((value) => value.status === "freefall").length,
        deployed: values.filter((value) => value.status === "deployed").length,
        landed: values.filter((value) => value.status === "landed").length,
        dead: values.filter((value) => value.status === "dead").length,
        launchFailed: values.filter((value) => value.status === "launch-failed").length,
        warehouseTargets: values.filter((value) => String(value.target?.kind).startsWith("warehouse")).length,
        upperWarehouseTargets: values.filter((value) => value.target?.kind === "warehouse-upper").length,
        hardLandings: landed.filter((value) => Number(value.impactSpeed) > 8).length,
        fatalLandings: landed.filter((value) => value.killed).length,
        averageLandingError: errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null,
        maxLandingError: errors.length ? Math.max(...errors) : null,
        averageImpactSpeed: impacts.length ? impacts.reduce((sum, value) => sum + value, 0) / impacts.length : null,
        maxImpactSpeed: impacts.length ? Math.max(...impacts) : null,
      };
    },
  });
}
