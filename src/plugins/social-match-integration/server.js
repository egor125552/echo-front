export const manifest = {
  id: "social-match-integration",
  version: "1.2.0",
  requires: ["social", "match-api"],
  capabilities: ["services.consume"],
};

export async function setup(ctx) {
  const social = ctx.services.get("social");
  const matchApi = ctx.services.get("match-api");

  matchApi.setSocialProfile = (playerId, profile = {}) => social.setProfile(playerId, profile);
  matchApi.socialRules = () => social.ruleState();
  matchApi.setSocialRule = (key, enabled) => social.setRule(key, enabled);

  if (typeof matchApi.snapshotFor === "function") {
    const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
    matchApi.snapshotFor = (playerId, now = Date.now()) => ({
      ...originalSnapshotFor(playerId, now),
      socialRules: social.ruleState(),
    });
  } else if (typeof matchApi.snapshot === "function") {
    const originalSnapshot = matchApi.snapshot.bind(matchApi);
    matchApi.snapshot = (now = Date.now()) => ({
      ...originalSnapshot(now),
      socialRules: social.ruleState(),
    });
  }
}
