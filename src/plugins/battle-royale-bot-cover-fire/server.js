export const BOT_RETREAT_COVER_FIRE_DISTANCE = 16;

export const manifest = {
  id: "battle-royale-bot-cover-fire",
  version: "1.0.0",
  requires: ["bot-brain"],
  capabilities: ["services.consume", "services.provide"],
};

export function shouldCoverRetreat(decision) {
  if (decision?.goal !== "evade" || !decision?.target) return false;
  const distance = Number(decision.target.distance);
  return Number.isFinite(distance) && distance <= BOT_RETREAT_COVER_FIRE_DISTANCE;
}

export async function setup(ctx) {
  const brain = ctx.services.get("bot-brain");
  const originalDecide = brain.decide.bind(brain);

  brain.decide = function decideWithCoverFire(botId, context = {}, now = Date.now()) {
    const decision = originalDecide(botId, context, now);
    if (!decision || decision.returnFire || !shouldCoverRetreat(decision)) return decision;
    return {
      ...decision,
      returnFire: true,
      coverFire: true,
    };
  };

  ctx.services.provide("bot-cover-fire", {
    maxDistance: BOT_RETREAT_COVER_FIRE_DISTANCE,
    shouldCoverRetreat,
  });
}
