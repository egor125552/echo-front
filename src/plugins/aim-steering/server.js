function wrapAngle(value) {
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export const NORMAL_STEERING = {
  outerAngleRadians: 0.65,
  innerAngleRadians: 0.10,
  minimumTurnScale: 0.28,
};

export function steeredTurn(inputTurn, error, tuning = NORMAL_STEERING) {
  const turn = Math.max(-1, Math.min(1, Number(inputTurn) || 0));
  if (!turn) return 0;

  const signedError = wrapAngle(Number(error) || 0);
  const absoluteError = Math.abs(signedError);
  const turnDirection = Math.sign(turn);
  const errorDirection = Math.sign(signedError);

  if (absoluteError > 0.0001 && errorDirection !== turnDirection) return turn;

  const outer = Math.max(0.05, Number(tuning.outerAngleRadians) || NORMAL_STEERING.outerAngleRadians);
  const inner = Math.max(0.01, Math.min(outer - 0.01, Number(tuning.innerAngleRadians) || NORMAL_STEERING.innerAngleRadians));
  const minimum = Math.max(0.05, Math.min(0.8, Number(tuning.minimumTurnScale) || NORMAL_STEERING.minimumTurnScale));

  if (absoluteError >= outer) return turn;
  if (absoluteError <= inner) {
    return turnDirection * minimum * (absoluteError / inner);
  }

  const progress = smoothstep01((absoluteError - inner) / (outer - inner));
  const scale = minimum + (1 - minimum) * progress;
  return turnDirection * scale;
}

export const manifest = {
  id: "aim-steering",
  version: "1.0.0",
  requires: ["entities", "teams", "rapier-physics", "weapons"],
  optional: ["opening-round"],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const physics = ctx.services.get("physics");
  const weapons = ctx.services.get("weapons");
  const opening = ctx.services.has("opening-round") ? ctx.services.get("opening-round") : null;

  function selectedRange(entityId) {
    const inventory = ctx.components.get(entityId, "Weapons");
    const selected = inventory?.items?.[inventory.selected] ?? null;
    return Number(weapons.definitions[selected?.id]?.range) || 0;
  }

  function bestVisibleTarget(entityId, inputTurn, tuning) {
    const shooter = entities.get(entityId);
    if (!shooter?.alive || shooter.bot || !inputTurn) return null;
    const origin = ctx.components.get(entityId, "Transform");
    if (!origin) return null;

    const maxDistance = selectedRange(entityId);
    if (!maxDistance) return null;

    let best = null;
    for (const enemy of teams.enemiesOf(entityId)) {
      if (!enemy?.alive) continue;
      const target = ctx.components.get(enemy.id, "Transform");
      if (!target) continue;

      const dx = target.x - origin.x;
      const dz = target.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 0.001 || distance > maxDistance) continue;
      if (!physics.lineOfSight(origin, target, entityId, enemy.id)) continue;

      const desired = Math.atan2(dx, -dz);
      const error = wrapAngle(desired - origin.angle);
      const absoluteError = Math.abs(error);
      if (absoluteError > tuning.outerAngleRadians) continue;
      if (absoluteError > 0.0001 && Math.sign(error) !== Math.sign(inputTurn)) continue;
      if (!best || absoluteError < best.absoluteError) {
        best = { targetId: enemy.id, error, absoluteError, distance };
      }
    }
    return best;
  }

  function adjustInput(entityId, input = {}, now = Date.now()) {
    const turn = Math.max(-1, Math.min(1, Number(input.turn) || 0));
    if (!turn) return input;

    const tuning = opening?.steeringTuning?.(now) ?? NORMAL_STEERING;
    const target = bestVisibleTarget(entityId, turn, tuning);
    if (!target) return input;

    return {
      ...input,
      turn: steeredTurn(turn, target.error, tuning),
    };
  }

  ctx.services.provide("aim-steering", {
    adjustInput,
    bestVisibleTarget,
    normalTuning: { ...NORMAL_STEERING },
  });
}
