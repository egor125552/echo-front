export const BOT_AI_ROLLOUT = Object.freeze({
  mode: "all",
  canaryBotId: "br-bot-94",
});

export const manifest = {
  id: "bot-ai-rollout",
  version: "1.1.0",
  capabilities: ["services.provide"],
};

export function usesXStateBotBrain(botId) {
  if (BOT_AI_ROLLOUT.mode === "all") return true;
  if (BOT_AI_ROLLOUT.mode === "off") return false;
  return botId === BOT_AI_ROLLOUT.canaryBotId;
}

export async function setup(ctx) {
  ctx.services.provide("bot-ai-rollout", {
    mode: BOT_AI_ROLLOUT.mode,
    canaryBotId: BOT_AI_ROLLOUT.canaryBotId,
    usesXState: usesXStateBotBrain,
  });
}