export const BOT_OBSTACLE_PROBE_DISTANCE = 1.45;
export const BOT_STUCK_SAMPLE_MS = 300;
export const BOT_STUCK_DISTANCE = 0.055;

export const manifest = {
  id: "bot-navigation",
  version: "1.0.0",
  requires: ["rapier-physics"],
  capabilities: ["services.consume", "services.provide"],
};

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

  if (blocked || stuck) {
    const rightDirection = rotateDirection(desiredDirection, 0.9);
    const leftDirection = rotateDirection(desiredDirection, -0.9);
    const rightClearance = probeClearance(physics, botId, transform, rightDirection);
    const leftClearance = probeClearance(physics, botId, transform, leftDirection);
    const previous = botState.avoidDirection || botState.strafeDirection || 1;
    botState.avoidDirection = Math.abs(rightClearance - leftClearance) < 0.08
      ? previous
      : (rightClearance > leftClearance ? 1 : -1);
    botState.avoidUntil = now + (stuck ? 900 : 650);
  }

  if ((botState.avoidUntil ?? 0) <= now) return input;

  let detour = rotateDirection(desiredDirection, (botState.avoidDirection || 1) * 1.15);
  if (probeClearance(physics, botId, transform, detour) < 0.42) {
    botState.avoidDirection *= -1;
    detour = rotateDirection(desiredDirection, botState.avoidDirection * 1.35);
  }
  const local = worldToLocal(transform.angle, detour);
  return {
    ...input,
    forward: Math.max(-0.7, Math.min(0.65, local.forward)),
    strafe: Math.max(-1, Math.min(1, local.strafe)),
    sprint: false,
  };
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  ctx.services.provide("bot-navigation", {
    avoid(botId, transform, botState, input, now = Date.now()) {
      return applyBotObstacleAvoidance(physics, botId, transform, botState, input, now);
    },
  });
}
