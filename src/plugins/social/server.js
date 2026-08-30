export const manifest = {
  id: "social",
  version: "1.1.0",
  requires: ["entities"],
  capabilities: ["services.consume", "services.provide", "events.on", "events.emit"],
};

const MAX_NAME_LENGTH = 24;
const MAX_FRIENDS = 128;

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
  const rules = {
    friendFireProtection: true,
    friendVehicleProtection: true,
  };

  function setProfile(playerId, profile = {}) {
    const entity = entities.get(playerId);
    if (!entity || entity.bot || entity.kind !== "human") return null;

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

  function setRule(key, enabled) {
    if (!(key in rules)) return false;
    const next = Boolean(enabled);
    if (rules[key] === next) return true;
    rules[key] = next;
    ctx.events.emit("social:rule-changed", { key, enabled: next, now: Date.now() });
    return true;
  }

  function ruleState() {
    return { ...rules };
  }

  ctx.events.on("entity:removed", ({ entityId }) => {
    profiles.delete(entityId);
  });

  ctx.services.provide("social", {
    setProfile,
    describe,
    isFriend,
    eitherFriend,
    normalizeName,
    setRule,
    ruleState,
    protectFromFriendlyFire(attackerId, targetId) {
      return rules.friendFireProtection && isFriend(attackerId, targetId);
    },
    protectFromFriendlyVehicle(driverId, targetId) {
      return rules.friendVehicleProtection && isFriend(driverId, targetId);
    },
  });
}
