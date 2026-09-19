export function summarizePerformanceSamples(samples = [], now = Date.now(), windowMs = 3000) {
  const recent = samples.filter((sample) => sample.at >= now - windowMs && sample.at <= now);
  const total = (field) => recent.reduce((sum, sample) => sum + (Number(sample[field]) || 0), 0);
  const max = (field) => recent.reduce((high, sample) => Math.max(high, Number(sample[field]) || 0), 0);
  return {
    windowMs,
    expectedTickMs: 50,
    tickCount: recent.length,
    // Scheduling gaps are measured between timer events. Cloudflare freezes
    // Date.now/performance.now during synchronous JS, so do not expose fake
    // per-function CPU/wall-clock durations from inside a deployed Worker.
    maxTickGapMs: max("gapMs"),
    delayedTicks: recent.filter((sample) => (sample.gapMs || 0) > 80).length,
    catchUpTicks: recent.filter((sample) => (sample.simulatedMs || 0) > 75).length,
    maxSimulationSteps: max("steps"),
    droppedSimulationMs: Math.round(total("droppedMs")),
    snapshotsSent: total("snapshotsSent"),
    snapshotCharacters: total("snapshotCharacters"),
    eventsSent: total("eventsSent"),
    eventCharacters: total("eventCharacters"),
  };
}
