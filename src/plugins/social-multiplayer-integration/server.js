export const manifest = {
  id: "social-multiplayer-integration",
  version: "1.0.0",
  requires: ["match-api", "social", "entities", "health"],
  optional: ["battle-royale-navigation", "battle-royale-parachute"],
  capabilities: ["services.consume", "events.on"],
};

const FRIEND_VEHICLE_DAMAGE_WINDOW_MS = 1800;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const social = ctx.services.get("social");
  const entities = ctx.services.get("entities");
  const health = ctx.services.get("health");
  const navigation = ctx.services.has("navigation") ? ctx.services.get("navigation") : null;
  const parachute = ctx.services.has("parachute") ? ctx.services.get("parachute") : null;

  const recentVehicleDrivers = new Map();
  let sharedDeployment = null;

  function profileFromInput(input) {
    const profile = input?.socialProfile;
    if (!profile || typeof profile !== "object") return null;
    return {
      name: profile.name,
      friendIds: Array.isArray(profile.friendIds) ? profile.friendIds : [],
    };
  }

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    const profile = profileFromInput(input);
    if (profile) social.setProfile(playerId, profile);

    if (navigation && input.navigationSelectTargetId) {
      const targetId = String(input.navigationSelectTargetId).slice(0, 160);
      const selected = navigation.selectTarget(playerId, targetId, now);
      if (selected && input.navigationActivatePressed) {
        const state = navigation.stateFor(playerId, now);
        if (state?.activeTargetId !== selected.id) navigation.toggle(playerId, now);
      }
    }

    return originalHandleInput(playerId, input, now);
  };

  if (navigation && typeof matchApi.snapshotFor === "function") {
    const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
    matchApi.snapshotFor = (playerId, now = Date.now()) => {
      const snapshot = originalSnapshotFor(playerId, now);
      const targets = navigation.availableTargets(playerId).map((target) => ({
        id: target.id,
        name: target.name,
        kind: target.kind,
        distance: finite(target.distance, null),
        outsideSafeZone: Boolean(target.outsideSafeZone),
      }));
      return {
        ...snapshot,
        mapMenu: {
          title: "Карта",
          targets,
          selectedTargetId: navigation.stateFor(playerId, now)?.selectedTargetId ?? null,
        },
      };
    };
  }

  if (parachute?.launch) {
    const originalLaunch = parachute.launch.bind(parachute);
    parachute.launch = (entityId, options = {}, now = Date.now()) => {
      const entity = entities.get(entityId);
      if (!entity || entity.bot || entity.kind !== "human") {
        return originalLaunch(entityId, options, now);
      }

      const transform = ctx.components.get(entityId, "Transform");
      if (!sharedDeployment) {
        sharedDeployment = {
          x: Number.isFinite(Number(options.x)) ? Number(options.x) : finite(transform?.x),
          z: Number.isFinite(Number(options.z)) ? Number(options.z) : finite(transform?.z),
          angle: Number.isFinite(Number(options.angle)) ? Number(options.angle) : finite(transform?.angle),
        };
      }

      return originalLaunch(entityId, {
        ...options,
        x: sharedDeployment.x,
        z: sharedDeployment.z,
        angle: sharedDeployment.angle,
      }, now);
    };
  }

  ctx.events.on("ragdoll:fleet-vehicle-hit", (payload = {}) => {
    const targetId = String(payload.entityId ?? "");
    const driverId = String(payload.driverId ?? "");
    if (!targetId || !driverId) return;
    recentVehicleDrivers.set(targetId, {
      driverId,
      at: Number(payload.now) || Date.now(),
    });
  });

  ctx.events.on("ragdoll:ended", ({ entityId } = {}) => {
    recentVehicleDrivers.delete(entityId);
  });
  ctx.events.on("entity:removed", ({ entityId } = {}) => {
    recentVehicleDrivers.delete(entityId);
  });

  const originalApplyDamage = health.applyDamage.bind(health);
  health.applyDamage = (targetId, amount, source = {}) => {
    if (source?.weaponId === "ragdoll-impact") {
      const recent = recentVehicleDrivers.get(targetId);
      const now = Number(source.now) || Date.now();
      if (recent && now - recent.at <= FRIEND_VEHICLE_DAMAGE_WINDOW_MS) {
        if (social.isFriend(recent.driverId, targetId)) {
          return { applied: 0, killed: false, friendProtected: true };
        }
      }
    }
    return originalApplyDamage(targetId, amount, source);
  };
}
