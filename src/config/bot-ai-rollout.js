export const BOT_AI_ROLLOUT = Object.freeze({
  mode: "canary",
  canaryBotId: "br-bot-94",
});

export function usesXStateBotBrain(botId) {
  if (BOT_AI_ROLLOUT.mode === "all") return true;
  if (BOT_AI_ROLLOUT.mode === "off") return false;
  return botId === BOT_AI_ROLLOUT.canaryBotId;
}
