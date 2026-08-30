export const manifest = {
  id: "social",
  version: "1.2.0",
  requires: ["entities"],
  capabilities: ["services.consume", "services.provide", "events.on", "events.emit"],
};

const MAX_NAME_LENGTH = 24;
const MAX_FRIENDS = 128;
const DEFAULT_RULES = Object.freeze({
  friendFireProtection: true,
  friendRamProtection: true,
});

function normalizeName(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH) || "Игрок";
}

function normalizeFriendIds(value, selfId) {
  const source = Array.isArray(value) ? value : [];
  const unique = new Set();
  for (const raw of source) {
    const id = String(raw ?? "").trim();
    if (!id || id === selfId || id.length > 80) continue;
    unique.add(id);
    if (unique.size >= MAX_FRIENDS) break;
  }
  return unique;
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const profiles = new Map();
  const rules = { ...DEFAULT_RULES };
  let hostId = null;

  function humanIds() {
    return entities.all()
      .filter((entity) => entity?.kind === "human" && !entity.bot)
      .map((entity) => entity.id);
  }

  function ensureHost(preferredId = null) {
    if (hostId && entities.get(hostId)) return hostId;
    const preferred = preferredId ? entities.get(preferredId) : null;
    if (preferred?.kind === "human" && !preferred.bot) hostId = preferred.id;
    else hostId = humanIds()[0] ?? null;
    return hostId;
  }

  function setProfile(playerId, profile = {}) {
    const entity = entities.get(playerId);
    if (!entity || entity.bot || entity.kind !== "human") return null;
    ensureHost(playerId);

    const name = normalizeName(profile.name);
    const friends = normalizeFriendIds(profile.friendIds, playerId);
    entity.name = name;
    profiles.set(playerId, { name, friends, updatedAt: Date.now() });

    ctx.events.emit("social:profile-updated", {
      entityId: playerId,
      name,
      friendCount: friends.size,
    });
    return describe(playerId);
  }

  function describe(playerId) {
    const profile = profiles.get(playerId);
    if (!profile) return {
      name: entities.get(playerId)?.name ?? "Игрок",
      friendIds: [],
    };
    return {
      name: profile.name,
      friendIds: [...profile.friends],
    };
  }

  function isFriend(ownerId, otherId) {
    if (!ownerId || !otherId || ownerId === otherId) return false;
    return Boolean(profiles.get(ownerId)?.friends?.has(otherId));
  }

  function eitherFriend(a, b) {
    return isFriend(a, b) || isFriend(b, a);
  }

  function setRoomRule(requesterId, key, value) {
    ensureHost();
    if (!requesterId || requesterId !== hostId) return false;
    if (!(key in rules)) return false;
    const next = Boolean(value);
    if (rules[key] === next) return true;
    rules[key] = next;
    ctx.events.emit("social:room-rule", {
      entityId: requesterId,
      key,
      value: next,
      now: Date.now(),
    });
    return true;
  }

  function roomState() {
    ensureHost();
    return {
      hostId,
      rules: { ...rules },
    };
  }

  ctx.events.on("entity:spawned", ({ entityId }) => {
    const entity = entities.get(entityId);
    if (entity?.kind === "human" && !entity.bot) ensureHost(entityId);
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    profiles.delete(entityId);
    if (entityId === hostId) {
      hostId = null;
      ensureHost();
      ctx.events.emit("social:host-changed", { entityId: hostId, now: Date.now() });
    }
  });

  ctx.services.provide("social", {
    setProfile,
    describe,
    isFriend,
    eitherFriend,
    normalizeName,
    setRoomRule,
    roomState,
    roomRules() { return { ...rules }; },
    isHost(playerId) { return ensureHost() === playerId; },
    protectsFriendlyFire(attackerId, targetId) {
      return rules.friendFireProtection !== false && isFriend(attackerId, targetId);
    },
    protectsFriendlyRam(driverId, targetId) {
      return rules.friendRamProtection !== false && isFriend(driverId, targetId);
    },
  });
}
