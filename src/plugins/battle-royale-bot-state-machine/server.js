import { assign, createActor, createMachine } from "xstate";

export const BOT_BEHAVIOR_STATES = Object.freeze([
  "roam",
  "investigate",
  "search",
  "hunt",
  "zone",
  "engage",
  "defend",
  "evade",
  "traverse",
]);

export const manifest = {
  id: "bot-state-machine",
  version: "1.4.0",
  requires: ["bot-controller", "bot-ai-rollout"],
  capabilities: ["services.consume", "services.provide", "events.on"],
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

function soundInvestigation(decision) {
  return decision?.goal === "investigate" && decision?.target?.kind === "sound-interest";
}

function soundSearch(decision) {
  return decision?.goal === "search" && decision?.searchOrigin?.kind === "sound-interest";
}

function traversingToSoundInvestigation(decision) {
  return decision?.goal === "traverse"
    && decision?.resumeGoal === "investigate"
    && decision?.resumeTarget?.kind === "sound-interest";
}

function sameSound(a, b) {
  if (a?.kind !== "sound-interest" || b?.kind !== "sound-interest") return false;
  if (a.sourceId && b.sourceId && a.sourceId !== b.sourceId) return false;
  if (Number.isFinite(Number(a.heardAt)) && Number.isFinite(Number(b.heardAt))) {
    return Number(a.heardAt) === Number(b.heardAt);
  }
  return Math.hypot(
    (Number(a.x) || 0) - (Number(b.x) || 0),
    (Number(a.y) || 0) - (Number(b.y) || 0),
    (Number(a.z) || 0) - (Number(b.z) || 0),
  ) < 0.25;
}

function traversalContinuesInvestigation(currentDecision, candidate) {
  return traversingToSoundInvestigation(candidate)
    && sameSound(currentDecision?.target, candidate.resumeTarget);
}

export function preserveCommittedSoundWork(machineState, currentDecision, candidate, meta = {}, now = Date.now()) {
  if (!candidate) return candidate;
  const urgent = Boolean(meta.underFire || meta.visibleThreat || meta.freshSound);
  if (urgent || candidate.goal !== "traverse") return candidate;

  if (machineState === "search" && soundSearch(currentDecision)) {
    return { ...currentDecision };
  }

  if (machineState === "investigate" && soundInvestigation(currentDecision)) {
    if (traversalContinuesInvestigation(currentDecision, candidate)) return candidate;
    return { ...currentDecision };
  }

  if (machineState === "traverse" && traversingToSoundInvestigation(currentDecision)) {
    return {
      goal: "investigate",
      score: 1,
      target: currentDecision.resumeTarget,
      targetEntityId: currentDecision.targetEntityId ?? null,
      heardAt: currentDecision.resumeHeardAt ?? currentDecision.resumeTarget.heardAt ?? null,
      investigateUntil: currentDecision.resumeInvestigateUntil ?? null,
      holdUntil: Number(now) + 900,
      profile: currentDecision.profile,
    };
  }

  return candidate;
}

export async function setup(ctx) {
  const rollout = ctx.services.get("bot-ai-rollout");
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
    if (!rollout.usesXState(botId)) {
      return { ...candidate, machineState: candidate.goal, orchestration: "legacy" };
    }

    const actor = actorFor(botId);
    const before = actor.getSnapshot();
    const now = Number(meta.now) || Date.now();
    const protectedCandidate = preserveCommittedSoundWork(
      String(before.value),
      before.context.decision,
      candidate,
      meta,
      now,
    );
    const goal = BOT_BEHAVIOR_STATES.includes(protectedCandidate.goal)
      ? protectedCandidate.goal
      : "roam";
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
      decision: { ...protectedCandidate, goal },
      now,
      force,
    });

    const after = actor.getSnapshot();
    const accepted = after.context.decision ?? protectedCandidate;
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
      if (!rollout.usesXState(botId)) {
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