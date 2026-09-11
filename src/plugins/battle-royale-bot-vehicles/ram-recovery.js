import { angleDelta, distance, headingTo } from "./driving.js";

const MAX_ATTEMPTS = 2;
const TURN_TIMEOUT_MS = 45_000;

// A miss is its own maneuver: clear the lane, turn in open space, then
// reacquire the opponent. Do not keep steering at a target behind the bumper.
export function createRamRecovery({ routes, targetFor }) {
  function turnPoints(car, side) {
    const forward = { x: Math.sin(car.angle), z: -Math.cos(car.angle) };
    const right = { x: Math.cos(car.angle) * side, z: Math.sin(car.angle) * side };
    const points = [];
    for (let step = 0; step <= 4; step++) {
      const angle = step * Math.PI / 4;
      points.push({
        x: car.x + forward.x * (24 + 18 * Math.sin(angle)) + right.x * 18 * (1 - Math.cos(angle)),
        y: 0,
        z: car.z + forward.z * (24 + 18 * Math.sin(angle)) + right.z * 18 * (1 - Math.cos(angle)),
      });
    }
    let cursor = car;
    for (const point of points) {
      if (!routes.clearPath({ ...car, x: cursor.x, z: cursor.z }, point, 5)) return null;
      cursor = point;
    }
    return points;
  }

  function followTurn(state, car, now) {
    const turn = state.ramTurn;
    if (now - turn.startedAt > TURN_TIMEOUT_MS) return { stopReason: "ram-turn-timeout" };
    const target = targetFor(turn.entityId, turn.vehicleId, car);
    if (!target) return { stopReason: "ram-target-lost" };
    while (turn.index < turn.points.length && distance(car, turn.points[turn.index]) < 5) turn.index++;
    if (turn.index >= turn.points.length) {
      if (Math.abs(angleDelta(headingTo(car, target) - car.angle)) < .65) {
        state.phase = "travel";
        state.ramTargetId = turn.entityId;
        state.ramVehicleId = turn.vehicleId;
        state.ramUntil = now + 5000;
        state.ramCooldownUntil = 0;
        state.ramTurn = null;
        return { reacquired: true };
      }
      return { turnaround: true, point: { ...target }, nextPoint: null };
    }
    return { turnaround: true, point: turn.points[turn.index], nextPoint: turn.points[turn.index + 1] };
  }

  function update(state, car, ram, now) {
    if (state.ramHitPending) {
      state.ramHitPending = false;
      return { stopReason: "ram-hit" };
    }
    if (state.phase === "ram-turnaround") return followTurn(state, car, now);
    if (ram) {
      const key = ram.vehicleId ? `vehicle:${ram.vehicleId}` : `entity:${ram.entityId}`;
      if (!state.ramPass || state.ramPass.key !== key) {
        if (state.ramEncounterKey && state.ramEncounterKey !== key) state.attempts = 0;
        state.ramEncounterKey = key;
        state.attempts = (state.attempts ?? 0) + 1;
        state.ramPass = { key, entityId: ram.entityId, vehicleId: ram.vehicleId ?? null, closest: ram.distance, startedAt: now };
      }
      state.ramPass.closest = Math.min(state.ramPass.closest, ram.distance);
      return {};
    }
    const pass = state.ramPass;
    if (!pass) return {};
    const target = targetFor(pass.entityId, pass.vehicleId, car);
    if (!target) return { stopReason: "ram-target-lost" };
    const gap = distance(car, target);
    const behind = Math.abs(angleDelta(headingTo(car, target) - car.angle)) > 1.3;
    const missed = (pass.closest <= 12 && behind && gap > pass.closest + 3)
      || now - pass.startedAt > 8000;
    if (!missed) return {};
    state.ramPass = null;
    if (state.attempts >= MAX_ATTEMPTS) return { stopReason: "ram-attempts-exhausted" };
    const points = turnPoints(car, 1) ?? turnPoints(car, -1);
    if (!points) return { stopReason: "ram-no-turn-space" };
    state.phase = "ram-turnaround";
    state.ramKey = null;
    state.ram = null;
    state.ramTurn = { points, index: 0, startedAt: now, entityId: pass.entityId, vehicleId: pass.vehicleId };
    return followTurn(state, car, now);
  }

  return { update, markHit(state) { state.ramPass = null; state.ramTurn = null; state.ramHitPending = true; } };
}
