export const DOWNED_HEALTH = 100;
export const BLEED_OUT_MS = 60_000;
export const CRAWL_SPEED = 0.85;
export const TEAM_REVIVE_DURATION_MS = 3_500;
export const TEAM_REVIVE_RANGE = 2.8;
export const TEAM_AUTO_REVIVE_RANGE = 2.1;

export const manifest = {
  id: "battle-royale-injury",
  requires: ["health", "armor", "movement", "rapier-physics", "entities", "teams", "match-api", "battle-royale-ragdoll"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on", "events.emit"],
};

function distance3(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.y) || 0) - (Number(b?.y) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

export async function setup(ctx) {
  const health = ctx.services.get("health");
  const armor = ctx.services.get("armor");
  const movement = ctx.services.get("movement");
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const match = ctx.services.get("match-api");
  const physics = ctx.services.get("physics");
  const ragdoll = ctx.services.get("ragdoll");
  const states = new Map();
  const isDowned = id => Boolean(states.get(id)?.downed);
  const stateFor = id => states.get(id) ?? null;
  const emit = (name, entityId, extra = {}) => ctx.events.emit(`injury:${name}`, { entityId, ...extra });

  function isBotEntity(entity) {
    if (!entity) return false;
    return Boolean(entity.bot || ctx.components.get(entity.id, "Bot"));
  }

  function sameTeam(aId, bId) {
    if (!aId || !bId || aId === bId) return false;
    const teamA = Number(teams.teamOf(aId)) || 0;
    const teamB = Number(teams.teamOf(bId)) || 0;
    return teamA > 0 && teamA === teamB;
  }

  function hasStandingTeammate(entityId) {
    const ownTeam = Number(teams.teamOf(entityId)) || 0;
    if (ownTeam <= 0) return false;
    for (const other of entities.all()) {
      if (!other?.alive || other.id === entityId) continue;
      if ((Number(teams.teamOf(other.id)) || 0) !== ownTeam) continue;
      if (!isDowned(other.id)) return true;
    }
    return false;
  }

  function wipeOrphanedDownedBots(teamId, killerId = null, now = Date.now()) {
    const team = Number(teamId) || 0;
    if (team <= 0) return;
    const teamMembers = entities.all().filter(e => e?.alive && (Number(teams.teamOf(e.id)) || 0) === team);
    if (!teamMembers.length) return;
    const anyHumanAlive = teamMembers.some(e => !isBotEntity(e));
    const anyStanding = teamMembers.some(e => !isDowned(e.id));
    if (anyHumanAlive || anyStanding) return;
    for (const member of teamMembers) {
      if (!member.alive || !isBotEntity(member) || !isDowned(member.id)) continue;
      const st = states.get(member.id);
      if (st) st.wiping = true;
      health.applyDamage(member.id, DOWNED_HEALTH * 2, {
        attackerId: killerId ?? st?.attackerId ?? null,
        weaponId: "bleed-out",
        now,
      });
    }
  }

  function downedTeammates(entityId, maxDistance = Infinity) {
    const self = entities.get(entityId);
    const selfTransform = ctx.components.get(entityId, "Transform");
    const ownTeam = Number(teams.teamOf(entityId)) || 0;
    if (!self?.alive || !selfTransform || ownTeam <= 0) return [];
    const results = [];
    for (const candidate of entities.all()) {
      if (!candidate?.alive || candidate.id === entityId) continue;
      if ((Number(teams.teamOf(candidate.id)) || 0) !== ownTeam) continue;
      if (!isDowned(candidate.id)) continue;
      const transform = ctx.components.get(candidate.id, "Transform");
      if (!transform) continue;
      const distance = distance3(selfTransform, transform);
      if (distance > maxDistance) continue;
      const st = states.get(candidate.id);
      results.push({
        entityId: candidate.id,
        entity: candidate,
        transform,
        distance,
        reviveProgressMs: st?.reviveProgressMs ?? 0,
        reviveProgressRatio: Math.min(1, (st?.reviveProgressMs ?? 0) / TEAM_REVIVE_DURATION_MS),
        reviverId: st?.reviverId ?? null,
      });
    }
    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  function nearestDownedTeammate(entityId, maxDistance = TEAM_REVIVE_RANGE) {
    return downedTeammates(entityId, maxDistance)[0] ?? null;
  }

  function activeReviveTargetFor(reviverId) {
    if (!reviverId) return null;
    for (const [id, st] of states) {
      if (st?.downed && st.reviverId === reviverId && entities.get(id)?.alive) {
        return { entityId: id, state: st };
      }
    }
    return null;
  }

  function isRevivingTeammate(reviverId) {
    return Boolean(activeReviveTargetFor(reviverId));
  }

  function canReviveNow(reviverId, targetId) {
    const reviver = entities.get(reviverId);
    const target = entities.get(targetId);
    if (!reviver?.alive || !target?.alive) return false;
    if (isDowned(reviverId) || !isDowned(targetId)) return false;
    if (!sameTeam(reviverId, targetId)) return false;
    if (ctx.components.get(reviverId, "Parachute")?.airborne) return false;
    const reviverTransform = ctx.components.get(reviverId, "Transform");
    const targetTransform = ctx.components.get(targetId, "Transform");
    if (!reviverTransform || !targetTransform) return false;
    return distance3(reviverTransform, targetTransform) <= TEAM_REVIVE_RANGE;
  }

  function pauseTeamRevive(reviverId, reason = "interrupted", now = Date.now()) {
    const active = activeReviveTargetFor(reviverId);
    if (!active) return false;
    const { entityId, state } = active;
    if (state.reviveUpdatedAt != null && now > state.reviveUpdatedAt) {
      state.reviveProgressMs = Math.min(
        TEAM_REVIVE_DURATION_MS,
        (state.reviveProgressMs ?? 0) + Math.max(0, now - state.reviveUpdatedAt),
      );
    }
    state.reviverId = null;
    state.reviveUpdatedAt = null;
    state.lastBleedAt = Math.max(state.lastBleedAt ?? now, now);
    emit("team-revive-paused", entityId, {
      reviverId,
      progressMs: Math.round(state.reviveProgressMs ?? 0),
      durationMs: TEAM_REVIVE_DURATION_MS,
      reason,
      now,
    });
    return true;
  }

  function startTeamRevive(reviverId, targetId = null, now = Date.now()) {
    const resolvedTargetId = targetId ?? nearestDownedTeammate(reviverId, TEAM_REVIVE_RANGE)?.entityId ?? null;
    if (!resolvedTargetId || !canReviveNow(reviverId, resolvedTargetId)) return false;
    const state = stateFor(resolvedTargetId);
    if (!state?.downed) return false;
    if (state.reviverId === reviverId) return true;
    const existingForReviver = activeReviveTargetFor(reviverId);
    if (existingForReviver && existingForReviver.entityId !== resolvedTargetId) {
      pauseTeamRevive(reviverId, "switch-target", now);
    }
    state.reviverId = reviverId;
    state.reviveUpdatedAt = now;
    state.lastBleedAt = Math.max(state.lastBleedAt ?? now, now);
    emit("team-revive-started", resolvedTargetId, {
      reviverId,
      progressMs: Math.round(state.reviveProgressMs ?? 0),
      durationMs: TEAM_REVIVE_DURATION_MS,
      now,
    });
    return true;
  }

  ctx.events.on("health:depleted", packet => {
    const entity = entities.get(packet.entityId);
    if (!entity?.alive) return;
    if (isDowned(entity.id)) {
      if (stateFor(entity.id)?.reviverId) {
        pauseTeamRevive(stateFor(entity.id).reviverId, "target-died", packet.now);
      }
      return;
    }
    const bot = isBotEntity(entity);
    const airborne = Boolean(ctx.components.get(entity.id, "Parachute")?.airborne);
    const weaponId = packet.source?.weaponId ?? null;
    const inTutorial = ctx.services.has("battle-royale-tutorial");
    const canDownHuman = !bot && entity.kind === "human";
    const canDownSquadBot = bot
      && !inTutorial
      && !airborne
      && weaponId !== "fall-impact"
      && weaponId !== "zone"
      && hasStandingTeammate(entity.id);

    if (!canDownHuman && !canDownSquadBot) return;

    pauseTeamRevive(entity.id, "reviver-downed", packet.now);
    const hp = ctx.components.get(entity.id, "Health");
    const transform = ctx.components.get(entity.id, "Transform");
    const state = {
      downed: true,
      normalMaximum: hp.maximum,
      lastBleedAt: packet.now,
      attackerId: packet.source?.attackerId ?? null,
      weaponId,
      reviveProgressMs: 0,
      reviverId: null,
      reviveUpdatedAt: null,
    };
    states.set(entity.id, state);
    hp.maximum = DOWNED_HEALTH;
    hp.current = DOWNED_HEALTH;
    packet.downed = true;
    transform.downed = true;
    transform.movementSpeed = CRAWL_SPEED;
    physics.setCharacterDowned(entity.id, true);
    armor.cancelPlating(entity.id, "downed");
    const plates = ctx.components.get(entity.id, "Armor");
    if (plates) plates.current = 0;
    movement.setInput(entity.id, {});
    emit("downed", entity.id, {
      health: DOWNED_HEALTH,
      maximum: DOWNED_HEALTH,
      attackerId: packet.source?.attackerId ?? null,
      weaponId,
      now: packet.now,
    });
    if (transform && !ragdoll.isActive(entity.id)) {
      ctx.events.emit("sound:spatial", {
        entityId: entity.id,
        key: "ragdoll.impact.body",
        ragdollPart: "torso",
        collapse: "downed",
        intensity: 0.95,
        x: Number(transform.x) || 0,
        y: Number(transform.y) || 0,
        z: Number(transform.z) || 0,
        radius: 46,
      });
    }
    wipeOrphanedDownedBots(teams.teamOf(entity.id), packet.source?.attackerId ?? null, packet.now);
  });

  ctx.events.on("entity:died", ({ entityId, killerId, weaponId, now = Date.now() }) => {
    pauseTeamRevive(entityId, "reviver-died", now);
    const st = states.get(entityId);
    const wasDowned = Boolean(st?.downed);
    if (st) st.downed = false;
    const transform = ctx.components.get(entityId, "Transform");
    const airborne = Boolean(ctx.components.get(entityId, "Parachute")?.airborne);
    if (transform && !airborne && !ragdoll.isActive(entityId) && (!wasDowned || (!st?.wiping && weaponId !== "bleed-out"))) {
      ctx.events.emit("sound:spatial", {
        entityId,
        key: wasDowned ? "ragdoll.impact.1" : "ragdoll.impact.body",
        ragdollPart: wasDowned ? "pelvis" : "torso",
        collapse: wasDowned ? "death-slump" : "death",
        intensity: wasDowned ? 0.78 : 1.0,
        x: Number(transform.x) || 0,
        y: Number(transform.y) || 0,
        z: Number(transform.z) || 0,
        radius: wasDowned ? 38 : 46,
      });
    }
    if (st?.wiping) return;
    wipeOrphanedDownedBots(teams.teamOf(entityId), killerId ?? null, now);
  });

  const originalHeal = health.heal.bind(health);
  health.heal = (id, amount) => isDowned(id) ? 0 : originalHeal(id, amount);

  function revive(id, now = Date.now(), reviverId = null) {
    const state = stateFor(id);
    if (!state?.downed || !entities.get(id)?.alive) return false;
    if (!physics.setCharacterDowned(id, false)) return false;
    const resolvedReviverId = reviverId ?? state.reviverId ?? null;
    const hp = ctx.components.get(id, "Health");
    hp.maximum = state.normalMaximum;
    hp.current = Math.min(hp.maximum, 100);
    state.downed = false;
    state.reviveProgressMs = 0;
    state.reviverId = null;
    state.reviveUpdatedAt = null;
    const transform = ctx.components.get(id, "Transform");
    transform.downed = false;
    delete transform.movementSpeed;
    const feet = physics.position(id);
    Object.assign(transform, feet, { verticalVelocity: 0, grounded: false });
    ctx.events.emit("health:changed", { entityId: id, health: hp.current, maximum: hp.maximum });
    emit("revived", id, { health: hp.current, reviverId: resolvedReviverId, now });
    if (resolvedReviverId) {
      emit("team-revive-completed", id, {
        reviverId: resolvedReviverId,
        health: hp.current,
        now,
      });
    }
    return true;
  }

  function tick(now) {
    for (const [id, state] of states) {
      if (!state.downed || !entities.get(id)?.alive) continue;
      if (state.reviverId) {
        if (!canReviveNow(state.reviverId, id)) {
          pauseTeamRevive(state.reviverId, "out-of-range", now);
        } else {
          const reviverId = state.reviverId;
          const elapsed = Math.max(0, now - (state.reviveUpdatedAt ?? now));
          state.reviveUpdatedAt = Math.max(state.reviveUpdatedAt ?? now, now);
          state.lastBleedAt = Math.max(state.lastBleedAt ?? now, now);
          state.reviveProgressMs = Math.min(
            TEAM_REVIVE_DURATION_MS,
            (state.reviveProgressMs ?? 0) + elapsed,
          );
          if (state.reviveProgressMs >= TEAM_REVIVE_DURATION_MS) {
            revive(id, now, reviverId);
          }
          continue;
        }
      }
      const elapsed = Math.max(0, now - state.lastBleedAt);
      state.lastBleedAt = Math.max(state.lastBleedAt, now);
      health.applyDamage(id, DOWNED_HEALTH * elapsed / BLEED_OUT_MS, {
        attackerId: state.attackerId, weaponId: "bleed-out", now,
      });
    }
  }

  function describe(id) {
    const state = stateFor(id);
    const hp = ctx.components.get(id, "Health");
    const activeDowned = Boolean(state?.downed && entities.get(id)?.alive);
    return {
      downed: activeDowned,
      bleedOutSeconds: activeDowned ? Math.ceil((hp?.current ?? 0) / DOWNED_HEALTH * BLEED_OUT_MS / 1000) : 0,
      normalHealthMax: activeDowned ? state.normalMaximum : null,
      reviveProgressMs: activeDowned ? Math.round(state.reviveProgressMs ?? 0) : 0,
      reviveProgressRatio: activeDowned
        ? Math.min(1, (state.reviveProgressMs ?? 0) / TEAM_REVIVE_DURATION_MS)
        : 0,
      beingRevivedBy: activeDowned ? (state.reviverId ?? null) : null,
    };
  }

  for (const method of ["snapshot", "snapshotFor"]) {
    const original = match[method].bind(match);
    match[method] = (...args) => {
      const snapshot = original(...args);
      return { ...snapshot, entities: snapshot.entities.map(entity => ({ ...entity, ...describe(entity.id) })) };
    };
  }
  ctx.events.on("entity:removed", ({ entityId }) => {
    pauseTeamRevive(entityId, "removed");
    states.delete(entityId);
  });
  ctx.services.provide("injury", {
    isDowned,
    stateFor,
    describe,
    tick,
    revive,
    emit,
    downedTeammates,
    nearestDownedTeammate,
    startTeamRevive,
    pauseTeamRevive,
    isRevivingTeammate,
  });
}
