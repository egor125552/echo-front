// Clean human-like obstacle sliding & automatic door opening for bots.
// Replaces the old Roomba-style 50-degree camera-spinning obstacle avoider:
// when a bot brushes a wall corner, stair railing, or teammate, it smoothly
// sidesteps (strafes) around the obstacle while keeping its camera steady!

export const BOT_OBSTACLE_PROBE_DISTANCE = 1.48;
export const BOT_DOOR_PROBE_DISTANCE = 2.2;
export const BOT_STUCK_SAMPLE_MS = 320;
export const BOT_STUCK_DISTANCE = 0.045;

export const manifest = {
  id: "bot-navigation",
  version: "2.1.0",
  requires: ["rapier-physics", "map-test-arena"],
  capabilities: ["services.consume", "services.provide"],
};

function wrapAngle(value) {
  let angle = Number(value) || 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeDirection(direction) {
  const length = Math.hypot(direction.x, direction.z) || 1;
  return { x: direction.x / length, z: direction.z / length };
}

function localToWorld(angle, forward, strafe) {
  return normalizeDirection({
    x: Math.sin(angle) * forward + Math.cos(angle) * strafe,
    z: -Math.cos(angle) * forward + Math.sin(angle) * strafe,
  });
}

function worldToLocal(angle, direction) {
  return {
    forward: Math.sin(angle) * direction.x - Math.cos(angle) * direction.z,
    strafe: Math.cos(angle) * direction.x + Math.sin(angle) * direction.z,
  };
}

function rotateDirection(direction, radians) {
  const heading = Math.atan2(direction.x, -direction.z) + radians;
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

function probeClearance(physics, botId, transform, direction) {
  const hit = physics.raycast(
    { x: transform.x, y: (transform.y ?? 0) + 1, z: transform.z },
    { x: direction.x, y: 0, z: direction.z },
    BOT_OBSTACLE_PROBE_DISTANCE,
    botId,
  );
  return hit?.distance ?? BOT_OBSTACLE_PROBE_DISTANCE;
}

function sampleStuck(botState, transform, now, movementMagnitude) {
  if (!Number.isFinite(botState.navSampleX) || !Number.isFinite(botState.navSampleZ)) {
    botState.navSampleX = transform.x;
    botState.navSampleZ = transform.z;
    botState.navSampleAt = now;
    botState.stuckSamples = 0;
    return false;
  }
  if (now - botState.navSampleAt < BOT_STUCK_SAMPLE_MS) return false;

  const moved = Math.hypot(
    transform.x - botState.navSampleX,
    transform.z - botState.navSampleZ,
  );
  botState.navSampleX = transform.x;
  botState.navSampleZ = transform.z;
  botState.navSampleAt = now;

  if (movementMagnitude < 0.22 || moved >= BOT_STUCK_DISTANCE) {
    botState.stuckSamples = 0;
    return false;
  }

  botState.stuckSamples = (botState.stuckSamples ?? 0) + 1;
  if (botState.stuckSamples < 2) return false;
  botState.stuckSamples = 0;
  return true;
}

/**
 * Human-like obstacle sliding:
 * Never hijacks and violently spins the bot's camera on a timer.
 * Instead, keeps the camera looking naturally toward the path/target and applies
 * a smooth lateral sidestep (strafe) around corners, doorframes, trees, or teammates
 * even slightly before contact so bots curve smoothly instead of scraping walls.
 */
export function applyBotObstacleAvoidance(physics, botId, transform, botState, input, now = Date.now()) {
  const movementMagnitude = Math.hypot(input.forward ?? 0, input.strafe ?? 0);
  if (movementMagnitude < 0.05) {
    sampleStuck(botState, transform, now, movementMagnitude);
    return input;
  }

  const desiredDirection = localToWorld(transform.angle, input.forward ?? 0, input.strafe ?? 0);
  const forwardClearance = probeClearance(physics, botId, transform, desiredDirection);
  const blocked = forwardClearance < 0.88;
  const approachingObstacle = !blocked && forwardClearance < 1.38;
  const stuck = sampleStuck(botState, transform, now, movementMagnitude);
  const currentlySliding = (botState.avoidUntil ?? 0) > now;

  if ((blocked && !currentlySliding) || stuck) {
    const rightDir = rotateDirection(desiredDirection, 0.72);
    const leftDir = rotateDirection(desiredDirection, -0.72);
    const rightClear = probeClearance(physics, botId, transform, rightDir);
    const leftClear = probeClearance(physics, botId, transform, leftDir);
    const prevSide = botState.avoidDirection || botState.strafeDirection || 1;
    if ((botState.avoidFlipLockUntil ?? 0) <= now) {
      botState.avoidDirection = Math.abs(rightClear - leftClear) < 0.14
        ? prevSide
        : (rightClear > leftClear ? 1 : -1);
      botState.avoidFlipLockUntil = now + 480;
    }
    botState.avoidUntil = now + (stuck ? 520 : 340);
  } else if (blocked && currentlySliding) {
    botState.avoidUntil = Math.max(botState.avoidUntil, now + 220);
  } else if (approachingObstacle && !currentlySliding) {
    // Gentle pre-contact curve around an obstacle ahead without slowing down or spinning camera
    const rightClear = probeClearance(physics, botId, transform, rotateDirection(desiredDirection, 0.55));
    const leftClear = probeClearance(physics, botId, transform, rotateDirection(desiredDirection, -0.55));
    if (Math.abs(rightClear - leftClear) >= 0.16) {
      const gentleSide = rightClear > leftClear ? 1 : -1;
      botState.avoidDirection = gentleSide;
      const curveDir = rotateDirection(desiredDirection, gentleSide * 0.42);
      const localCurve = worldToLocal(transform.angle, curveDir);
      return {
        ...input,
        forward: clamp(localCurve.forward * 0.92, -0.4, 0.96),
        strafe: clamp(localCurve.strafe * 0.65, -0.65, 0.65),
        turn: input.turn ?? 0,
        targetAngle: input.targetAngle ?? null,
      };
    }
  }

  if ((botState.avoidUntil ?? 0) <= now) return input;

  const side = botState.avoidDirection || 1;
  let slideDir = rotateDirection(desiredDirection, side * 0.78);
  let slideClear = probeClearance(physics, botId, transform, slideDir);

  if (slideClear < 0.55) {
    const widerDir = rotateDirection(desiredDirection, side * 1.25);
    const widerClear = probeClearance(physics, botId, transform, widerDir);
    if (widerClear > slideClear) {
      slideDir = widerDir;
      slideClear = widerClear;
    } else if ((botState.avoidFlipLockUntil ?? 0) <= now) {
      botState.avoidDirection = -side;
      botState.avoidFlipLockUntil = now + 520;
      slideDir = rotateDirection(desiredDirection, botState.avoidDirection * 1.15);
    }
  }

  const local = worldToLocal(transform.angle, slideDir);
  // Keep the bot's camera steady (preserve input.turn & input.targetAngle) and slide smoothly with WASD!
  return {
    ...input,
    forward: clamp(local.forward * 0.78, -0.55, 0.78),
    strafe: clamp(local.strafe * 0.85, -0.85, 0.85),
    turn: input.turn ?? 0,
    targetAngle: input.targetAngle ?? null,
    sprint: false,
  };
}

function openDoorInMovementPath(map, physics, botId, transform, input, now) {
  if (typeof map?.setDoorOpen !== "function") return false;
  const movementMagnitude = Math.hypot(input.forward ?? 0, input.strafe ?? 0);
  if (movementMagnitude < 0.05) return false;

  const direction = localToWorld(transform.angle, input.forward ?? 0, input.strafe ?? 0);
  const hit = physics.raycast(
    { x: transform.x, y: (transform.y ?? 0) + 1, z: transform.z },
    { x: direction.x, y: 0, z: direction.z },
    BOT_DOOR_PROBE_DISTANCE,
    botId,
  );
  const doorId = hit?.worldObject?.kind === "building-door"
    ? hit.worldObject.doorId
    : null;
  if (!doorId) return false;

  const door = map.doors?.find((entry) => entry.id === doorId);
  if (!door || door.open) return false;
  return Boolean(map.setDoorOpen(doorId, true, botId, now));
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  ctx.services.provide("bot-navigation", {
    avoid(botId, transform, botState, input, now = Date.now()) {
      openDoorInMovementPath(map, physics, botId, transform, input, now);
      return applyBotObstacleAvoidance(physics, botId, transform, botState, input, now);
    },
  });
}
