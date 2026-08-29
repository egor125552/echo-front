export const manifest = {
  id: "battle-royale-acoustic-profile",
  version: "1.0.0",
  requires: ["match-api", "map-test-arena", "battle-royale-building-factory"],
  capabilities: ["services.consume"],
};

function decorateSnapshot(map, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.entities) || typeof map.acousticProfileAt !== "function") {
    return snapshot;
  }
  return {
    ...snapshot,
    entities: snapshot.entities.map((entity) => {
      const profile = map.acousticProfileAt({ x: entity.x, y: entity.y, z: entity.z });
      if (!profile) return entity;
      return {
        ...entity,
        acousticZone: profile.zone ?? entity.acousticZone,
        acousticProfile: {
          zone: profile.zone ?? entity.acousticZone ?? "outdoor",
          reverbMix: Number(profile.reverbMix) || 0,
          wallOcclusion: Number(profile.wallOcclusion) || 0,
          doorOcclusion: Number(profile.doorOcclusion) || 0,
          floorOcclusion: Number(profile.floorOcclusion) || 0,
          stairOcclusion: Number(profile.stairOcclusion) || 0,
        },
      };
    }),
  };
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const map = ctx.services.get("map");
  const originalSnapshot = matchApi.snapshot.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);

  matchApi.snapshot = (now = Date.now()) => decorateSnapshot(map, originalSnapshot(now));
  matchApi.snapshotFor = (playerId, now = Date.now()) => (
    decorateSnapshot(map, originalSnapshotFor(playerId, now))
  );
}
