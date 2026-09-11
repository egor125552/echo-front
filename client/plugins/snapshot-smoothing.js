export const manifest = { id: "snapshot-smoothing", requires: ["cloudflare-session"] };

export const SNAPSHOT_SMOOTHING_MIN_MS = 45;
export const SNAPSHOT_SMOOTHING_MAX_MS = 140;
export const SNAPSHOT_SMOOTHING_DEFAULT_MS = 85;
export const LOCAL_TURN_SPEED = 1.65;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}
function lerp(a, b, t) { return a + (b - a) * t; }
function wrapAngle(value) { return Math.atan2(Math.sin(value), Math.cos(value)); }
function angleDelta(from, to) { return wrapAngle(to - from); }
function lerpAngle(a, b, t) { return a + angleDelta(a, b) * t; }
function ease(t) { return t * t * (3 - 2 * t); }

export function adaptiveSmoothingMs(intervalMs, jitterMs = 0) {
  const interval = Math.max(1, Number(intervalMs) || SNAPSHOT_SMOOTHING_DEFAULT_MS);
  const jitter = Math.max(0, Number(jitterMs) || 0);
  return clamp(
    interval * 1.08 + jitter * 1.8,
    SNAPSHOT_SMOOTHING_MIN_MS,
    SNAPSHOT_SMOOTHING_MAX_MS,
  );
}

export function interpolateSnapshot(from, to, t, { instantAngleId = null } = {}) {
  if (!from) return to;
  const amount = ease(clamp(t, 0, 1));
  const previous = new Map((from.entities ?? []).map((entity) => [entity.id, entity]));
  return {
    ...to,
    entities: (to.entities ?? []).map((entity) => {
      const before = previous.get(entity.id);
      if (!before) return entity;
      const jump = Math.hypot(
        (Number(entity.x) || 0) - (Number(before.x) || 0),
        (Number(entity.y) || 0) - (Number(before.y) || 0),
        (Number(entity.z) || 0) - (Number(before.z) || 0),
      );
      if (jump > 7) return entity;
      return {
        ...entity,
        x: lerp(Number(before.x) || 0, Number(entity.x) || 0, amount),
        y: lerp(Number(before.y) || 0, Number(entity.y) || 0, amount),
        z: lerp(Number(before.z) || 0, Number(entity.z) || 0, amount),
        // The local camera must never wait for network interpolation. Its angle is
        // replaced by the locally predicted value below. Other entities stay smooth.
        angle: entity.id === instantAngleId
          ? Number(entity.angle) || 0
          : lerpAngle(Number(before.angle) || 0, Number(entity.angle) || 0, amount),
      };
    }),
  };
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  let current = null;
  let from = null;
  let target = null;
  let startedAt = 0;
  let raf = 0;
  let lastFrameAt = 0;
  let lastRawAt = 0;
  let averageIntervalMs = 50;
  let averageJitterMs = 0;
  let smoothingMs = SNAPSHOT_SMOOTHING_DEFAULT_MS;
  let localAngle = null;
  let localTurn = 0;

  function selfFrom(snapshot) {
    if (!snapshot || snapshot?.spectator?.active) return null;
    return snapshot.entities?.find((entity) => entity.id === network.playerId) ?? null;
  }

  function applyLocalAngle(snapshot) {
    if (!snapshot || localAngle == null || snapshot?.spectator?.active) return snapshot;
    let replaced = false;
    const entities = (snapshot.entities ?? []).map((entity) => {
      if (entity.id !== network.playerId) return entity;
      replaced = true;
      return { ...entity, angle: localAngle };
    });
    return replaced ? { ...snapshot, entities } : snapshot;
  }

  function scheduleFrame() {
    if (!raf) raf = window.requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    const dt = lastFrameAt > 0 ? clamp((now - lastFrameAt) / 1000, 0, 0.05) : 0;
    lastFrameAt = now;

    if (localAngle != null && Math.abs(localTurn) > 0.0005 && dt > 0) {
      localAngle = wrapAngle(localAngle + localTurn * LOCAL_TURN_SPEED * dt);
    }

    if (target) {
      const t = Math.min(1, Math.max(0, (now - startedAt) / Math.max(1, smoothingMs)));
      const interpolated = interpolateSnapshot(from, target, t, {
        instantAngleId: network.playerId,
      });
      current = applyLocalAngle(interpolated);
      ctx.events.emit("game:snapshot", current);

      if (t < 1 || Math.abs(localTurn) > 0.0005) {
        scheduleFrame();
      }
      return;
    }

    if (current && Math.abs(localTurn) > 0.0005) {
      current = applyLocalAngle(current);
      ctx.events.emit("game:snapshot", current);
      scheduleFrame();
    }
  }

  ctx.events.on("input:gamepad-turn", ({ turn } = {}) => {
    const next = clamp(turn, -1, 1);
    if (localAngle == null) {
      const self = selfFrom(current) ?? selfFrom(target);
      if (self) localAngle = Number(self.angle) || 0;
    }
    localTurn = next;
    lastFrameAt = performance.now();
    scheduleFrame();
  });

  ctx.events.on("game:snapshot:raw", (snapshot) => {
    if (!snapshot) return;
    const now = performance.now();

    if (lastRawAt > 0) {
      const interval = clamp(now - lastRawAt, 8, 500);
      averageIntervalMs += (interval - averageIntervalMs) * 0.18;
      const instantJitter = Math.abs(interval - averageIntervalMs);
      averageJitterMs += (instantJitter - averageJitterMs) * 0.2;
      smoothingMs = adaptiveSmoothingMs(averageIntervalMs, averageJitterMs);
    }
    lastRawAt = now;

    const rawSelf = selfFrom(snapshot);
    if (rawSelf) {
      const serverAngle = Number(rawSelf.angle) || 0;
      if (localAngle == null || Math.abs(localTurn) < 0.0005) {
        localAngle = serverAngle;
      } else {
        // Prediction and the server use the same turn speed. Only a large divergence
        // is corrected while the stick is held, avoiding tiny network camera snaps.
        const error = angleDelta(localAngle, serverAngle);
        if (Math.abs(error) > 0.55) localAngle = wrapAngle(localAngle + error * 0.35);
      }
    }

    if (!current) {
      target = snapshot;
      current = applyLocalAngle(snapshot);
      ctx.events.emit("game:snapshot", current);
      return;
    }

    from = current;
    target = snapshot;
    startedAt = now;
    lastFrameAt = now;
    scheduleFrame();
  });

  ctx.events.on("network:disconnected", () => {
    localTurn = 0;
    localAngle = null;
    lastRawAt = 0;
    averageIntervalMs = 50;
    averageJitterMs = 0;
    smoothingMs = SNAPSHOT_SMOOTHING_DEFAULT_MS;
  });

  ctx.services.provide("snapshot-smoothing", {
    get current() { return current; },
    get smoothingMs() { return smoothingMs; },
    get averageIntervalMs() { return averageIntervalMs; },
    get averageJitterMs() { return averageJitterMs; },
    get localAngle() { return localAngle; },
  });
}
