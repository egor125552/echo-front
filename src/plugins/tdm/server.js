export const manifest = {
  id: "team-deathmatch",
  version: "1.0.0",
  requires: ["teams", "entities"],
  capabilities: ["services.consume", "services.provide", "events.on", "events.emit"],
};

export async function setup(ctx) {
  const teams = ctx.services.get("teams");
  const score = { 1: 0, 2: 0 };
  const roundDurationMs = 5 * 60_000;
  const targetScore = 10;
  const intermissionMs = 5000;
  let roundStartedAt = Date.now();
  let endedUntil = 0;
  let winner = 0;

  function endRound(now, winningTeam) {
    if (endedUntil) return;
    winner = winningTeam;
    endedUntil = now + intermissionMs;
    ctx.events.emit("match:ended", {
      winner,
      score: { ...score },
      restartAt: endedUntil,
    });
  }

  function reset(now = Date.now()) {
    score[1] = 0;
    score[2] = 0;
    winner = 0;
    endedUntil = 0;
    roundStartedAt = now;
    ctx.events.emit("match:started", { startedAt: roundStartedAt });
  }

  ctx.events.on("entity:died", ({ entityId, killerId }) => {
    if (endedUntil || !killerId || killerId === entityId) return;
    const killerTeam = teams.teamOf(killerId);
    const victimTeam = teams.teamOf(entityId);
    if (!killerTeam || killerTeam === victimTeam) return;
    score[killerTeam] += 1;
    ctx.events.emit("match:score", { score: { ...score } });
    if (score[killerTeam] >= targetScore) endRound(Date.now(), killerTeam);
  });

  ctx.services.provide("tdm", {
    score,
    tick(now = Date.now()) {
      if (endedUntil) {
        if (now >= endedUntil) reset(now);
        return;
      }
      if (now - roundStartedAt >= roundDurationMs) {
        const winningTeam = score[1] === score[2] ? 0 : score[1] > score[2] ? 1 : 2;
        endRound(now, winningTeam);
      }
    },
    status(now = Date.now()) {
      const elapsedMs = endedUntil ? Math.min(roundDurationMs, now - roundStartedAt) : now - roundStartedAt;
      return {
        score: { ...score },
        elapsedMs,
        remainingMs: endedUntil ? 0 : Math.max(0, roundDurationMs - elapsedMs),
        targetScore,
        ended: Boolean(endedUntil),
        winner,
        restartAt: endedUntil || null,
      };
    },
    reset,
  });
}
