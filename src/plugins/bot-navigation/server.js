export const BOT_OBSTACLE_PROBE_DISTANCE = 1.45;
export const BOT_DOOR_PROBE_DISTANCE = 2.1;
export const BOT_STUCK_SAMPLE_MS = 300;
export const BOT_STUCK_DISTANCE = 0.055;

export const manifest = {
  id: "bot-navigation",
  version: "1.1.0",
  requires: ["rapier-physics", "map-test-arena"],
  capabilities: ["services.consume", "services.provide"],
};

const BOT_ACTUAL_TURN_SPEED = 2.6;

function wrapAngle(value) {
  let angle = Number(value) || 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
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

  if (movementMagnitude < 0.25 || moved >= BOT_STUCK_DISTANCE) {
    botState.stuckSamples = 0;
    return false;
  }

  botState.stuckSamples = (botState.stuckSamples ?? 0) + 1;
  if (botState.stuckSamples < 2) return false;
  botState.stuckSamples = 0;
  return true;
}

export function applyBotObstacleAvoidance(physics, botId, transform, botState, input, now = Date.now()) {
  const movementMagnitude = Math.hypot(input.forward ?? 0, input.strafe ?? 0);
  if (movementMagnitude < 0.05) {
    sampleStuck(botState, transform, now, movementMagnitude);
    return input;
  }

  const desiredDirection = localToWorld(transform.angle, input.forward ?? 0, input.strafe ?? 0);
  const forwardClearance = probeClearance(physics, botId, transform, desiredDirection);
  const blocked = forwardClearance < 0.95;
  const stuck = sampleStuck(botState, transform, now, movementMagnitude);
  const currentlyAvoiding = (botState.avoidUntil ?? 0) > now;

  if ((blocked && !currentlyAvoiding) || stuck) {
    const rightDirection = rotateDirection(desiredDirection, 0.85);
    const leftDirection = rotateDirection(desiredDirection, -0.85);
    const rightClearance = probeClearance(physics, botId, transform, rightDirection);
    const leftClearance = probeClearance(physics, botId, transform, leftDirection);
    const previous = botState.avoidDirection || botState.strafeDirection || 1;
    if ((botState.avoidFlipLockUntil ?? 0) <= now) {
      botState.avoidDirection = Math.abs(rightClearance - leftClearance) < 0.14
        ? previous
        : (rightClearance > leftClearance ? 1 : -1);
    }
    botState.avoidUntil = now + (stuck ? 950 : 750);
  } else if (blocked && currentlyAvoiding) {
    botState.avoidUntil = Math.max(botState.avoidUntil, now + 350);
  }

  if ((botState.avoidUntil ?? 0) <= now) return input;

  const side = botState.avoidDirection || 1;
  let detour = rotateDirection(desiredDirection, side * 0.82);
  let detourClearance = probeClearance(physics, botId, transform, detour);
  if (detourClearance < 0.72) {
    const wider = rotateDirection(desiredDirection, side * 1.2);
    const widerClearance = probeClearance(physics, botId, transform, wider);
    if (widerClearance > detourClearance) {
      detour = wider;
      detourClearance = widerClearance;
    }
  }
  if (detourClearance < 0.42 && (botState.avoidFlipLockUntil ?? 0) <= now) {
    botState.avoidDirection = -side;
    botState.avoidFlipLockUntil = now + 550;
    detour = rotateDirection(desiredDirection, botState.avoidDirection * 1.25);
  }

  const preserveAim = Boolean(input.fireHeld || input.aimLock || Math.abs(input.strafe ?? 0) >= 0.25);
  if (!preserveAim) {
    const detourHeading = Math.atan2(detour.x, -detour.z);
    const delta = wrapAngle(detourHeading - (Number(transform.angle) || 0));
    const deadzone = 0.03;
    let calmTurn = 0;
    if (Math.abs(delta) > deadzone) {
      const deadbeat = (Math.abs(delta) * 0.88) / (BOT_ACTUAL_TURN_SPEED * 0.12);
      calmTurn = Math.sign(delta) * Math.min(0.75, (Math.abs(delta) * 1.55) / BOT_ACTUAL_TURN_SPEED, deadbeat);
    }
    const local = worldToLocal(transform.angle, detour);
    return {
      ...input,
      forward: Math.abs(delta) > 1.1 ? 0.15 : Math.max(0.25, Math.min(0.78, Math.hypot(local.forward, local.strafe) * 0.78)),
      strafe: Math.max(-0.35, Math.min(0.35, local.strafe * 0.4)),
      turn: calmTurn,
      targetAngle: detourHeading,
      sprint: false,
    };
  }

  const local = worldToLocal(transform.angle, detour);
  return {
    ...input,
    forward: Math.max(-0.7, Math.min(0.65, local.forward)),
    strafe: Math.max(-1, Math.min(1, local.strafe)),
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
