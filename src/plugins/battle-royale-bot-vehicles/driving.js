export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const CONSERVATIVE_BRAKE_DECELERATION = 3.2;
export const STOPPING_BUFFER = 5;

export function safeSpeedForDistance(distanceMeters, buffer = STOPPING_BUFFER) {
  const usable = Math.max(0, Number(distanceMeters) - Math.max(0, Number(buffer) || 0));
  return Math.sqrt(2 * CONSERVATIVE_BRAKE_DECELERATION * usable);
}
export function angleDelta(angle) { return Math.atan2(Math.sin(angle), Math.cos(angle)); }
export const headingTo = (from, to) => Math.atan2(to.x - from.x, -(to.z - from.z));

export function brakeInput(vehicle) {
  const speed = vehicle.forwardSpeed ?? vehicle.speed;
  return { forward: Math.abs(speed) > 0.4 ? -Math.sign(speed) : 0, strafe: 0, sprint: Math.abs(speed) < 1, fireHeld: false };
}

// Commands go through the same wheel controller as a human's keys. Steering
// changes smoothly, and braking starts before the corner or stopping point.
export function drivingInput(vehicle, point, {
  dt = .05, previousSteering = 0, remaining = Infinity, nextPoint = null,
  obstacleDistance = Infinity, ram = false, allowNitro = true, speedLimit = Infinity,
} = {}) {
  const speed = Math.abs(vehicle.forwardSpeed ?? vehicle.speed ?? 0);
  const error = angleDelta(headingTo(vehicle, point) - vehicle.angle);
  const bend = nextPoint ? Math.abs(angleDelta(headingTo(point, nextPoint) - headingTo(vehicle, point))) : 0;
  const rawSteering = Math.abs(error) < 0.015 ? 0 : clamp(error * 1.45 + (vehicle.angvel?.y ?? 0) * .25, -1, 1);
  const maxSteerStep = Math.max(0.08, dt * 2.8);
  const strafe = clamp(rawSteering, previousSteering - maxSteerStep, previousSteering + maxSteerStep);
  let wantedSpeed = ram ? 32 : 24;
  wantedSpeed = Math.min(wantedSpeed, 6 + 22 * Math.max(0, Math.cos(error)) ** 2.4);
  wantedSpeed = Math.min(wantedSpeed, speedLimit);
  if (bend > .25) wantedSpeed = Math.min(wantedSpeed, safeSpeedForDistance(distance(vehicle, point), 6) + 3.5);
  if (Number.isFinite(remaining)) wantedSpeed = Math.min(wantedSpeed, safeSpeedForDistance(remaining, STOPPING_BUFFER));
  if (Number.isFinite(obstacleDistance)) wantedSpeed = Math.min(wantedSpeed, safeSpeedForDistance(obstacleDistance, 6));
  const speedDelta = wantedSpeed - speed;
  let forward;
  if (obstacleDistance <= 7) {
    forward = speed > 1 ? -1 : 0;
  } else if (speedDelta >= -1.8) {
    forward = clamp(0.28 + speedDelta * 0.22, 0.16, 1);
  } else if (speedDelta >= -4.2 && obstacleDistance > 16 && remaining > 14) {
    forward = clamp(0.12 + (speedDelta + 1.8) * 0.05, 0, 0.12);
  } else {
    forward = clamp((speedDelta + 1.8) * 0.24, -1, -0.15);
  }
  if ((vehicle.forwardSpeed ?? 0) < -1) forward = 1;
  if (wantedSpeed < .3 && speed < .5) forward = 0;
  const pointDistance = distance(vehicle, point);
  const nitroClearance = ram ? Math.max(48, speed * speed / 7 + 18) : Math.max(110, speed * speed / 7 + 30);
  const fireHeld = Boolean(allowNitro && forward > .8 && Math.abs(error) < .075
    && bend < .12 && speed > 7 && speed < (ram ? 34 : 29)
    && obstacleDistance > nitroClearance
    && (ram ? pointDistance > 30 : (remaining > 130 && pointDistance > 140))
    && (vehicle.groundedWheels ?? 4) >= 3);
  return { forward, strafe, sprint: wantedSpeed < .3 && speed < 1, fireHeld, wantedSpeed, headingError: error };
}
