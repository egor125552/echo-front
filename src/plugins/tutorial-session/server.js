export const TUTORIAL_PHASES = [
  "move-forward",
  "strafe",
  "sprint",
  "fire",
  "hit-enemy",
  "eliminate-enemy",
  "reload",
  "receive-hit",
  "team-complete",
];

export const manifest = {
  id: "tutorial-session",
  version: "1.1.0",
  requires: ["entities", "teams"],
  optional: ["spawn-protection"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on"],
};

export async function setup(ctx) {
  const enabled = ctx.hasPlugin("opening-round") || ctx.config?.enabled === true;
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const spawnProtection = ctx.services.has("spawn-protection")
    ? ctx.services.get("spawn-protection")
    : null;
  const states = new Map();

  function phaseIndex(phase) {
    return Math.max(0, TUTORIAL_PHASES.indexOf(phase));
  }
  function ensure(playerId) {
    if (!enabled) return null;
    const entity = entities.get(playerId);
    if (!entity || entity.bot) return null;
    if (!states.has(playerId)) {
      const enemyBots = teams.enemiesOf(playerId).filter((enemy) => enemy.bot);
      const transform = ctx.components.get(playerId, "Transform");
      states.set(playerId, {
        phase: TUTORIAL_PHASES[0],
        changedAt: Date.now(),
        phaseOrigin: transform ? { x: transform.x, z: transform.z } : null,
        movementReady: false,
        killBotId: enemyBots[0]?.id ?? null,
        demoBotId: enemyBots[1]?.id ?? enemyBots[0]?.id ?? null,
      });
    }
    return states.get(playerId);
  }

  function advance(playerId, phase, now = Date.now()) {
    const state = ensure(playerId);
    if (!state || state.phase === phase) return false;
    const current = phaseIndex(state.phase);
    const next = phaseIndex(phase);
    if (next <= current) return false;
    state.phase = phase;
    state.changedAt = now;
    const transform = ctx.components.get(playerId, "Transform");
    state.phaseOrigin = transform ? { x: transform.x, z: transform.z } : null;
    state.movementReady = false;
    return true;
  }

  function handleInput(playerId, input = {}, now = Date.now()) {
    const state = ensure(playerId);
    if (!state) return;
    if (state.phase === "move-forward") {
      state.movementReady = Number(input.forward) > 0.35 && !input.sprint;
    } else if (state.phase === "strafe") {
      state.movementReady = Math.abs(Number(input.strafe) || 0) > 0.35;
    } else if (state.phase === "sprint") {
      state.movementReady = Boolean(input.sprint) && Number(input.forward) > 0.35;
    } else if (state.phase === "fire" && (input.firePressed || input.fireHeld)) {
      advance(playerId, "hit-enemy", now);
    } else if (state.phase === "reload" && input.reload) {
      if (advance(playerId, "receive-hit", now)) spawnProtection?.clear?.(playerId);
    }
  }

  function tick(playerId, now = Date.now()) {
    const state = ensure(playerId);
    if (!state?.movementReady || !state.phaseOrigin) return;
    const transform = ctx.components.get(playerId, "Transform");
    if (!transform) return;
    const distance = Math.hypot(
      transform.x - state.phaseOrigin.x,
      transform.z - state.phaseOrigin.z,
    );
    if (state.phase === "move-forward" && distance >= 5) advance(playerId, "strafe", now);
    else if (state.phase === "strafe" && distance >= 3) advance(playerId, "sprint", now);
    else if (state.phase === "sprint" && distance >= 10) advance(playerId, "fire", now);
  }

  ctx.events.on("combat:damage", (payload = {}) => {
    const applied = (Number(payload.healthApplied) || 0) + (Number(payload.armorAbsorbed) || 0);
    if (!enabled || applied <= 0) return;
    const attacker = entities.get(payload.attackerId);
    const target = entities.get(payload.targetId);

    if (attacker && !attacker.bot && target?.bot) {
      const state = ensure(attacker.id);
      if (state?.phase === "hit-enemy") advance(attacker.id, "eliminate-enemy", payload.now);
    }
    if (target && !target.bot && attacker?.bot) {
      const state = ensure(target.id);
      if (state?.phase === "receive-hit") advance(target.id, "team-complete", payload.now);
    }
  });

  ctx.events.on("entity:died", ({ entityId, killerId, now } = {}) => {
    const killer = entities.get(killerId);
    const dead = entities.get(entityId);
    if (!killer || killer.bot || !dead?.bot) return;
    const state = ensure(killer.id);
    if (!state || state.phase !== "eliminate-enemy") return;

    if (state.demoBotId === entityId) {
      const replacement = teams.enemiesOf(killer.id)
        .find((enemy) => enemy.bot && enemy.alive && enemy.id !== entityId);
      state.demoBotId = replacement?.id ?? state.demoBotId;
    }
    advance(killer.id, "reload", now);
  });

  function humanState() {
    if (!enabled) return null;
    for (const entity of entities.all()) {
      if (entity.bot) continue;
      const state = ensure(entity.id);
      if (state) return { entity, state };
    }
    return null;
  }

  ctx.services.provide("tutorial-session", {
    enabled,
    start(playerId) {
      return ensure(playerId);
    },
    handleInput,
    tick,
    describe(playerId) {
      const state = ensure(playerId);
      if (!state) return null;
      return {
        enabled: true,
        phase: state.phase,
        step: phaseIndex(state.phase) + 1,
        totalSteps: TUTORIAL_PHASES.length,
        changedAt: state.changedAt,
        teamSectionComplete: state.phase === "team-complete",
      };
    },
    botDirective(botId) {
      const current = humanState();
      if (!current) return "normal";
      const bot = entities.get(botId);
      if (!bot?.bot) return "passive";
      if (teams.teamOf(bot.id) === teams.teamOf(current.entity.id)) return "passive";
      if (current.state.phase !== "receive-hit") return "passive";
      return bot.id === current.state.demoBotId ? "demonstrate-hit" : "passive";
    },
  });
}
