export const SIMULATION_TICK_MS = 50;
export const MAX_CATCH_UP_MS = 1000;

export function advanceSimulation(game, previousTimeMs, nowMs, {
  tickMs = SIMULATION_TICK_MS,
  maxCatchUpMs = MAX_CATCH_UP_MS,
} = {}) {
  const now = Number(nowMs);
  const previous = Number(previousTimeMs);
  if (!game?.api?.step || !Number.isFinite(now) || !Number.isFinite(previous)) {
    return {
      lastStepAt: Number.isFinite(now) ? now : previousTimeMs,
      simulatedMs: 0,
      droppedMs: 0,
      steps: 0,
    };
  }

  const elapsedMs = Math.max(0, now - previous);
  if (elapsedMs <= 0) {
    return { lastStepAt: now, simulatedMs: 0, droppedMs: 0, steps: 0 };
  }

  const safeTickMs = Math.max(1, Number(tickMs) || SIMULATION_TICK_MS);
  const safeCatchUpMs = Math.max(safeTickMs, Number(maxCatchUpMs) || MAX_CATCH_UP_MS);
  const simulatedMs = Math.min(elapsedMs, safeCatchUpMs);
  const droppedMs = elapsedMs - simulatedMs;
  let remainingMs = simulatedMs;
  let simulationTimeMs = now - simulatedMs;
  let steps = 0;

  while (remainingMs > 0.001) {
    const sliceMs = Math.min(safeTickMs, remainingMs);
    simulationTimeMs += sliceMs;
    game.api.step(sliceMs / 1000, simulationTimeMs);
    remainingMs -= sliceMs;
    steps += 1;
  }

  return {
    lastStepAt: now,
    simulatedMs,
    droppedMs,
    steps,
  };
}
