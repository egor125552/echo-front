export const manifest = {
  id: "battle-royale-navigation-menu",
  version: "1.0.0",
  requires: ["battle-royale-navigation", "match-api"],
  capabilities: ["services.consume"],
};

function publicTarget(target) {
  return {
    id: target.id,
    name: target.name,
    kind: target.kind,
    distance: Number(target.distance) || 0,
    outsideSafeZone: Boolean(target.outsideSafeZone),
  };
}

export async function setup(ctx) {
  const navigation = ctx.services.get("navigation");
  const matchApi = ctx.services.get("match-api");
  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    const requested = String(input.navigationSelectTargetId ?? "").trim();
    if (requested) navigation.selectTarget(playerId, requested, now);
    return originalHandleInput(playerId, input, now);
  };

  matchApi.snapshotFor = (playerId, now = Date.now()) => {
    const snapshot = originalSnapshotFor(playerId, now);
    const items = navigation.availableTargets(playerId).map(publicTarget);
    return {
      ...snapshot,
      navigation: {
        ...(snapshot.navigation ?? {}),
        menuTitle: "Карта",
        items,
      },
    };
  };
}
