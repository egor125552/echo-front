export const manifest = {
  id: "social-match-integration",
  version: "1.1.0",
  requires: ["social", "match-api"],
  capabilities: ["services.consume"],
};

export async function setup(ctx) {
  const social = ctx.services.get("social");
  const matchApi = ctx.services.get("match-api");
  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalSnapshot = matchApi.snapshot?.bind(matchApi) ?? null;
  const originalSnapshotFor = matchApi.snapshotFor?.bind(matchApi) ?? null;

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (input?.socialProfile) social.setProfile(playerId, input.socialProfile);
    const roomRule = input?.socialRoomRule;
    if (roomRule?.key) social.setRoomRule(playerId, roomRule.key, roomRule.value);
    return originalHandleInput(playerId, input, now);
  };

  if (originalSnapshot) {
    matchApi.snapshot = (now = Date.now()) => ({
      ...originalSnapshot(now),
      social: social.roomState(),
    });
  }

  if (originalSnapshotFor) {
    matchApi.snapshotFor = (playerId, now = Date.now()) => ({
      ...originalSnapshotFor(playerId, now),
      social: {
        ...social.roomState(),
        isHost: social.isHost(playerId),
      },
    });
  }
}
