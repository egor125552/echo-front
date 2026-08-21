export const manifest = {
  id: "team-deathmatch",
  version: "1.0.0",
  requires: ["teams", "entities"],
  capabilities: ["services.consume", "services.provide", "events.on", "events.emit"],
};

export async function setup(ctx) {
  const teams = ctx.services.get("teams");
  const score = { 1: 0, 2: 0 };
  let roundStartedAt = Date.now();

  ctx.events.on("entity:died", ({ entityId, killerId }) => {
    if (!killerId || killerId === entityId) return;
    const killerTeam = teams.teamOf(killerId);
    const victimTeam = teams.teamOf(entityId);
    if (!killerTeam || killerTeam === victimTeam) return;
    score[killerTeam] += 1;
    ctx.events.emit("match:score", { score: { ...score } });
  });

  ctx.services.provide("tdm", {
    score,
    status(now = Date.now()) {
      const elapsedMs = now - roundStartedAt;
      return {
        score: { ...score },
        elapsedMs,
        remainingMs: Math.max(0, 5 * 60_000 - elapsedMs),
        targetScore: 10,
      };
    },
    reset(now = Date.now()) {
      score[1] = 0;
      score[2] = 0;
      roundStartedAt = now;
    },
  });
}
