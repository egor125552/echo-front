export const manifest = {
  id: "battle-royale-ragdoll-observer-events",
  version: "1.1.0",
  requires: ["match-api"],
  capabilities: ["services.consume", "components.read", "events.on", "events.emit"],
};

const RAGDOLL_EVENT_RADIUS = Object.freeze({
  "ragdoll:started": 90,
  "ragdoll:impact": 90,
  "ragdoll:ended": 90,
});
const RAGDOLL_SOUND_RADIUS = 58;
const HEAVY_IMPACT_THRESHOLD = 8.0;
const CATASTROPHIC_IMPACT_THRESHOLD = 14.0;
const HEAVY_SOUND_COOLDOWN_MS = 170;

function finitePosition(payload = {}) {
  const x = Number(payload.x);
  const y = Number(payload.y);
  const z = Number(payload.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, y: Number.isFinite(y) ? y : 0, z };
}

function distance3(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.y) || 0) - (Number(b?.y) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function sameSpatialSound(a, b) {
  if (a?.event !== "sound:spatial" || b?.event !== "sound:spatial") return false;
  const ap = a.payload ?? {};
  const bp = b.payload ?? {};
  return ap.entityId === bp.entityId
    && ap.key === bp.key
    && Number(ap.x) === Number(bp.x)
    && Number(ap.y ?? 0) === Number(bp.y ?? 0)
    && Number(ap.z) === Number(bp.z);
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);
  const lastHeavySoundAt = new Map();

  ctx.events.on("ragdoll:impact", (payload = {}) => {
    const entityId = String(payload.entityId ?? "");
    const severity = Math.max(0, Number(payload.severity) || 0);
    if (!entityId || severity < HEAVY_IMPACT_THRESHOLD) return;

    const now = Number(payload.now) || Date.now();
    const previous = Number(lastHeavySoundAt.get(entityId)) || 0;
    if (now - previous < HEAVY_SOUND_COOLDOWN_MS) return;
    lastHeavySoundAt.set(entityId, now);

    const catastrophic = severity >= CATASTROPHIC_IMPACT_THRESHOLD;
    ctx.events.emit("sound:spatial", {
      entityId,
      key: "ragdoll.impact.heavy",
      ragdollPart: payload.part ?? null,
      intensity: Math.min(1.8, 0.9 + severity / 18),
      severity,
      deltaVelocity: Number(payload.deltaVelocity) || 0,
      impactClass: catastrophic ? "catastrophic" : "heavy",
      x: Number(payload.x) || 0,
      y: Number(payload.y) || 0,
      z: Number(payload.z) || 0,
      radius: catastrophic ? 78 : 62,
    });
  });

  ctx.events.on("entity:removed", ({ entityId } = {}) => {
    lastHeavySoundAt.delete(String(entityId ?? ""));
  });

  matchApi.eventsForPlayer = (playerId, packets = []) => {
    const selected = originalEventsForPlayer(playerId, packets);
    const listener = ctx.components.get(playerId, "Transform");
    if (!listener) return selected;

    const result = [...selected];

    for (const packet of packets) {
      const payload = packet?.payload ?? {};
      const position = finitePosition(payload);
      if (!position || payload.entityId === playerId) continue;

      const ragdollRadius = RAGDOLL_EVENT_RADIUS[packet.event];
      if (ragdollRadius && distance3(listener, position) <= ragdollRadius) {
        if (!result.includes(packet)) {
          result.push({
            ...packet,
            payload: {
              ...payload,
              observedRagdoll: true,
              observerDistance: distance3(listener, position),
            },
          });
        }
        continue;
      }

      if (
        packet.event === "sound:spatial"
        && String(payload.key ?? "").startsWith("ragdoll.impact")
        && distance3(listener, position) <= Math.max(RAGDOLL_SOUND_RADIUS, Number(payload.radius) || 0)
      ) {
        const alreadySelected = result.some((existing) => sameSpatialSound(existing, packet));
        if (!alreadySelected) {
          result.push({
            ...packet,
            payload: {
              ...payload,
              radius: Math.max(RAGDOLL_SOUND_RADIUS, Number(payload.radius) || 0),
              observerRagdoll: true,
            },
          });
        }
      }
    }

    return result;
  };
}
