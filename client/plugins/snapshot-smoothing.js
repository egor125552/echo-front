export const manifest = { id: "snapshot-smoothing", requires: ["cloudflare-session"] };
export const SNAPSHOT_SMOOTHING_MS = 190;

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}
function ease(t) { return t * t * (3 - 2 * t); }

export function interpolateSnapshot(from, to, t) {
  if (!from) return to;
  const amount = ease(Math.max(0, Math.min(1, t)));
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
        angle: lerpAngle(Number(before.angle) || 0, Number(entity.angle) || 0, amount),
      };
    }),
  };
}

export async function setup(ctx) {
  let current = null;
  let from = null;
  let target = null;
  let startedAt = 0;
  let raf = 0;

  function frame(now) {
    raf = 0;
    if (!target) return;
    const t = Math.min(1, Math.max(0, (now - startedAt) / SNAPSHOT_SMOOTHING_MS));
    current = interpolateSnapshot(from, target, t);
    ctx.events.emit("game:snapshot", current);
    if (t < 1) raf = window.requestAnimationFrame(frame);
  }

  ctx.events.on("game:snapshot:raw", (snapshot) => {
    if (!snapshot) return;
    if (!current) {
      current = snapshot;
      target = snapshot;
      ctx.events.emit("game:snapshot", snapshot);
      return;
    }
    from = current;
    target = snapshot;
    startedAt = performance.now();
    if (!raf) raf = window.requestAnimationFrame(frame);
  });

  ctx.services.provide("snapshot-smoothing", {
    get current() { return current; },
    smoothingMs: SNAPSHOT_SMOOTHING_MS,
  });
}
