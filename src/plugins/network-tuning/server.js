export const SNAPSHOT_INTERVAL_MS = 50;

export const manifest = {
  id: "network-tuning",
  version: "1.0.0",
  requires: ["match-api"],
  capabilities: ["services.consume", "services.provide"],
};

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  matchApi.snapshotIntervalMs = SNAPSHOT_INTERVAL_MS;

  ctx.services.provide("network-tuning", {
    snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
  });
}
