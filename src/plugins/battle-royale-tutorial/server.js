export const TUTORIAL_PHASES = [
  "waiting",
  "deploy-parachute",
  "steer-parachute",
  "land",
  "ground-run",
  "automatic-parachute",
  "automatic-parachute-land",
  "select-navigation",
  "follow-navigation",
  "select-crate",
  "follow-crate",
  "interact-first-crate",
  "select-second-crate",
  "follow-second-crate",
  "interact-second-crate",
  "select-rifle",
  "armor-break",
  "apply-armor",
  "injury-demo",
  "use-stimulant",
  "complete",
];

export const manifest = {
  id: "battle-royale-tutorial",
  version: "1.3.0",
  requires: ["entities", "battle-royale", "battle-royale-parachute", "movement"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on"],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const parachute = ctx.services.get("parachute");
  const movement = ctx.services.get("movement");
  const states = new Map();

  function phaseIndex(phase) {
    return Math.max(0, TUTORIAL_PHASES.indexOf(phase));
  }

  function ensure(playerId) {
    const entity = entities.get(playerId);
    if (!entity || entity.bot) return null;
    if (!states.has(playerId)) {
      states.set(playerId, {
        phase: "waiting",
        changedAt: Date.now(),
        routeTargetKind: null,
        routeTargetLoot: null,
        rifleCollected: false,
        armorCollected: false,
        neededLoot: null,
        groundRunSteps: 0,
        demoBotId: entities.all().find((candidate) => candidate.bot)?.id ?? null,
      });
    }
    return states.get(playerId);
  }

  function advance(playerId, phase, now = Date.now()) {
    const state = ensure(playerId);
    if (!state || state.phase === phase) return false;
    if (phaseIndex(phase) <= phaseIndex(state.phase)) return false;
    state.phase = phase;
    state.changedAt = Number(now) || Date.now();
    return true;
  }

  function prepareDemoBot(playerId) {
    const state = ensure(playerId);
    const player = entities.get(playerId);
    const bot = entities.get(state?.demoBotId);
    const playerTransform = ctx.components.get(playerId, "Transform");
    if (!state || !player?.alive || !bot?.alive || !playerTransform) return false;
    const direction = playerTransform.x >= 60 ? -1 : 1;
    const x = playerTransform.x + direction * 8;
    const z = playerTransform.z;
    const angle = Math.atan2(playerTransform.x - x, -(playerTransform.z - z));
    movement.teleport(bot.id, { x, y: playerTransform.y ?? 0, z, angle });
    movement.setInput(bot.id, {});
    return true;
  }

  function rememberRoute(state, targetKind, targetLoot) {
    state.routeTargetKind = targetKind ?? null;
    state.routeTargetLoot = targetLoot ?? null;
  }

  function missingLoot(state) {
    if (!state.rifleCollected) return "rifle";
    if (!state.armorCollected) return "armor";
    return null;
  }

  function recordLoot(state, loot) {
    if (loot === "rifle") state.rifleCollected = true;
    if (loot === "armor") state.armorCollected = true;
    state.neededLoot = missingLoot(state);
  }

  ctx.events.on("parachute:launched", ({ entityId, now } = {}) => {
    const state = ensure(entityId);
    if (state?.phase === "waiting") advance(entityId, "deploy-parachute", now);
  });

  ctx.events.on("parachute:deployed", ({ entityId, automatic, now } = {}) => {
    const state = ensure(entityId);
    if (!state) return;
    if (state.phase === "deploy-parachute" && !automatic) {
      advance(entityId, "steer-parachute", now);
      return;
    }
    if (state.phase === "automatic-parachute" && automatic) {
      advance(entityId, "automatic-parachute-land", now);
    }
  });

  ctx.events.on("parachute:landed", ({ entityId, now } = {}) => {
    const state = ensure(entityId);
    if (!state) return;
    if (state.phase === "land") advance(entityId, "ground-run", now);
    else if (state.phase === "automatic-parachute-land") advance(entityId, "select-navigation", now);
  });

  ctx.events.on("sound:spatial", ({ entityId, gait, now } = {}) => {
    const state = ensure(entityId);
    if (state?.phase !== "ground-run" || gait !== "run") return;
    state.groundRunSteps += 1;
    if (state.groundRunSteps < 6) return;
    const transform = ctx.components.get(entityId, "Transform");
    if (!transform) return;
    if (advance(entityId, "automatic-parachute", now)) {
      parachute.launch(entityId, {
        altitude: 90,
        x: transform.x,
        z: transform.z,
        angle: transform.angle,
      }, (Number(now) || Date.now()) + 1);
    }
  });

  ctx.events.on("navigation:started", ({
    entityId,
    targetKind,
    targetLoot,
    now,
  } = {}) => {
    const state = ensure(entityId);
    if (!state) return;
    rememberRoute(state, targetKind, targetLoot);

    if (state.phase === "select-navigation") {
      advance(entityId, "follow-navigation", now);
      return;
    }
    if (state.phase === "select-crate" && targetKind === "crate") {
      advance(entityId, "follow-crate", now);
      return;
    }
    if (
      state.phase === "select-second-crate"
      && targetKind === "crate"
      && targetLoot === state.neededLoot
    ) {
      advance(entityId, "follow-second-crate", now);
    }
  });

  ctx.events.on("navigation:reached", ({
    entityId,
    targetKind,
    targetLoot,
    now,
  } = {}) => {
    const state = ensure(entityId);
    if (!state) return;
    const resolvedKind = targetKind ?? state.routeTargetKind;
    const resolvedLoot = targetLoot ?? state.routeTargetLoot;

    if (state.phase === "follow-navigation") {
      if (resolvedKind === "crate") {
        state.routeTargetLoot = resolvedLoot;
        advance(entityId, "interact-first-crate", now);
      } else {
        advance(entityId, "select-crate", now);
      }
      return;
    }
    if (state.phase === "follow-crate" && resolvedKind === "crate") {
      state.routeTargetLoot = resolvedLoot;
      advance(entityId, "interact-first-crate", now);
      return;
    }
    if (
      state.phase === "follow-second-crate"
      && resolvedKind === "crate"
      && resolvedLoot === state.neededLoot
    ) {
      advance(entityId, "interact-second-crate", now);
    }
  });

  ctx.events.on("loot:picked", ({
    entityId,
    loot,
    applied,
    quantity,
    now,
  } = {}) => {
    const state = ensure(entityId);
    if (!state) return;
    const acquired = Boolean(applied) || (Number(quantity) || 0) > 0;
    if (!acquired) return;

    recordLoot(state, loot);

    if (state.phase === "interact-first-crate") {
      if (state.rifleCollected && state.armorCollected) {
        advance(entityId, "select-rifle", now);
      } else {
        advance(entityId, "select-second-crate", now);
      }
      return;
    }

    if (state.phase === "interact-second-crate") {
      if (state.rifleCollected && state.armorCollected) {
        advance(entityId, "select-rifle", now);
      } else {
        advance(entityId, "select-second-crate", now);
      }
    }
  });

  ctx.events.on("weapon:selected", ({ entityId, weaponId, now } = {}) => {
    const state = ensure(entityId);
    if (state?.phase === "select-rifle" && weaponId === "rifle") {
      if (advance(entityId, "armor-break", now)) prepareDemoBot(entityId);
    }
  });

  ctx.events.on("combat:damage", (payload = {}) => {
    const state = ensure(payload.targetId);
    if (!state) return;
    if (state.phase === "armor-break" && payload.armorBroke) {
      advance(payload.targetId, "apply-armor", payload.now);
    }
  });

  ctx.events.on("armor:plating-completed", ({ entityId, now, armor, maximum, reservePlates } = {}) => {
    const state = ensure(entityId);
    // Let the entire one-press sequence finish before the demo bot attacks.
    if (state?.phase === "apply-armor" && (armor >= maximum || reservePlates <= 0)) {
      if (advance(entityId, "injury-demo", now)) prepareDemoBot(entityId);
    }
  });

  ctx.events.on("injury:downed", ({ entityId, now } = {}) => {
    const state = ensure(entityId);
    if (state?.phase === "injury-demo") advance(entityId, "use-stimulant", now);
  });

  ctx.events.on("injury:stim-completed", ({ entityId, revived, now } = {}) => {
    const state = ensure(entityId);
    if (state?.phase === "use-stimulant" && revived) advance(entityId, "complete", now);
  });

  ctx.services.provide("battle-royale-tutorial", {
    start(playerId) {
      return ensure(playerId);
    },
    handleInput(playerId, input = {}, now = Date.now()) {
      const state = ensure(playerId);
      if (!state) return;
      if (state.phase === "steer-parachute") {
        const parachuteState = parachute.stateFor(playerId);
        if (parachuteState?.phase === "deployed" && Math.abs(Number(input.strafe) || 0) > 0.35) {
          advance(playerId, "land", now);
        }
      }
    },
    describe(playerId) {
      const state = ensure(playerId);
      if (!state) return null;
      return {
        enabled: true,
        mode: "battle-royale",
        phase: state.phase,
        step: phaseIndex(state.phase) + 1,
        totalSteps: TUTORIAL_PHASES.length,
        changedAt: state.changedAt,
        complete: state.phase === "complete",
        neededLoot: state.neededLoot,
        rifleCollected: state.rifleCollected,
        armorCollected: state.armorCollected,
      };
    },
    blocksParachuteInput(playerId) {
      return ensure(playerId)?.phase === "automatic-parachute";
    },
    botDirective(botId) {
      for (const [playerId, state] of states) {
        if (state.demoBotId !== botId) continue;
        if (state.phase === "armor-break") return { mode: "break-armor", targetId: playerId };
        if (state.phase === "injury-demo") return { mode: "down-player", targetId: playerId };
      }
      return { mode: "passive", targetId: null };
    },
    botsPassive() {
      return true;
    },
  });
}
