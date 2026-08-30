export const manifest = {
  id: "social-match-integration",
  version: "1.0.0",
  requires: ["social", "match-api"],
  capabilities: ["services.consume"],
};

export async function setup(ctx) {
  const social = ctx.services.get("social");
  const matchApi = ctx.services.get("match-api");
  const originalHandleInput = matchApi.handleInput.bind(matchApi);

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (input?.socialProfile) social.setProfile(playerId, input.socialProfile);
    return originalHandleInput(playerId, input, now);
  };
}
