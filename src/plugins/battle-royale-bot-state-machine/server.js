import { assign, createActor, createMachine } from "xstate";
import { usesXStateBotBrain } from "../../config/bot-ai-rollout.js";

export const BOT_BEHAVIOR_STATES = Object.freeze([
  "roam",
  "investigate",
  "search",
  "hunt",
  "zone",
  "engage",
  "evade",
  "traverse",
]);

export const manifest = {
  id: "bot-state-machine",
  version: "1.0.0",
  requires: ["bot-controller"],
  capabilities: ["services.provide", "events.on"],
};

const storeDecision = assign({
  decision: ({ event }) => event.decision ?? null,
  holdUntil: ({ event }) => Number(event.decision?.holdUntil) || Number(event.now) || 0,
  targetEntityId: ({ event }) => event.decision?.targetEntityId ?? null,
  heardAt: ({ event }) => event.decision?.heardAt ?? null,
  lastChangedAt: ({ event }) => Number(event.now) || 0,
});

function canSwitch({ context, event }) {
  return Boolean(event.force) || Number(event.now) >= Number(context.holdUntil ?? 0);
}

function eventType(goal) {
  return `SELECT_${String(goal ?? "roam").toUpperCase()}`;
}

function transitionsFor(from) {
  const transitions = {};
  for (const goal of BOT_BEHAVIOR_STATES) {
    const type = eventType(goal);
    transitions[type] = goal === from
      ? { actions: storeDecision }
      : {
          target: `#botBehavior.${goal}`,
          guard: canSwitch,
          actions: storeDecision,
        };
  }
  return transitions;
}

export const botBehaviorMachine = createMachine({
  id: "botBehavior",
  initial: "roam",
  context: {
    decision: null,
    holdUntil: 0,
    targetEntityId: null,
    heardAt: null,
    lastChangedAt: 0,
  },
  states: Object.fromEntries(
    BOT_BEHAVIOR_STATES.map((state) => [state, { on: transitionsFor(state) }]),
  ),
});

export async function setup(ctx) {
  const actors = new Map();

  function actorFor(botId) {
    let actor = actors.get(botId);
    if (actor) return actor;
    actor = createActor(botBehaviorMachine);
    actor.start();
    actors.set(botId, actor);
    return actor;
  }

  function stopActor(botId) {
    const actor = actors.get(botId);
    actor?.stop?.();
    actors.delete(botId);
  }

  function resetAll() {
    for (const actor of actors.values()) actor.stop?.();
    actors.clear();
  }

  function resolve(botId, candidate, meta = {}) {
    if (!candidate) return null;
    if (!usesXStateBotBrain(botId)) {
      return { ...candidate, machineState: candidate.goal, orchestration: "legacy" };
    }

    const actor = actorFor(botId);
    const before = actor.getSnapshot();
    const goal = BOT_BEHAVIOR_STATES.includes(candidate.goal) ? candidate.goal : "roam";
    const force = Boolean(
      meta.force
      || meta.underFire
      || meta.visibleThreat
      || meta.freshSound
      || meta.traversalActive
      || meta.investigationReached
      || (before.value === "traverse" && goal !== "traverse"),
    );

    actor.send({
      type: eventType(goal),
      decision: { ...candidate, goal },
      now: Number(meta.now) || Date.now(),
      force,
    });

    const after = actor.getSnapshot();
    const accepted = after.context.decision ?? candidate;
    return {
      ...accepted,
      goal: String(after.value),
      machineState: String(after.value),
      orchestration: "xstate",
    };
  }

  ctx.events.on("entity:died", ({ entityId }) => stopActor(entityId));
  ctx.events.on("entity:removed", ({ entityId }) => stopActor(entityId));
  ctx.events.on("entity:respawned", ({ entityId }) => stopActor(entityId));
  ctx.events.on("battle-royale:started", resetAll);

  ctx.services.provide("bot-state-machine", {
    resolve,
    stateFor(botId) {
      if (!usesXStateBotBrain(botId)) {
        return { botId, orchestration: "legacy", machineState: null, decision: null };
      }
      const actor = actors.get(botId);
      if (!actor) {
        return { botId, orchestration: "xstate", machineState: "uninitialized", decision: null };
      }
      const snapshot = actor.getSnapshot();
      return {
        botId,
        orchestration: "xstate",
        machineState: String(snapshot.value),
        decision: snapshot.context.decision ?? null,
        holdUntil: snapshot.context.holdUntil ?? 0,
        targetEntityId: snapshot.context.targetEntityId ?? null,
        heardAt: snapshot.context.heardAt ?? null,
      };
    },
    reset(botId) { stopActor(botId); },
    resetAll,
  });
}
