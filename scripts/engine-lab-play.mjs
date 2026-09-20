/**
 * A client of the real Engine Lab endpoint, not a parallel gameplay test.
 * Run a private Wrangler dev server with ENGINE_LAB_TOKEN bound locally,
 * then: node scripts/engine-lab-play.mjs <base-url> <token-file> [game-seconds]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const base = process.argv[2] ?? "http://127.0.0.1:8789";
const tokenFile = process.argv[3];
const seconds = Math.max(5, Math.min(600, Math.floor(Number(process.argv[4]) || 300)));
if (!tokenFile) throw new Error("Token file path is required");
const token = fs.readFileSync(tokenFile, "utf8").trim();
if (token.length < 32) throw new Error("Invalid private Engine Lab token");
const room = "autoplay-" + randomUUID().slice(0, 12);
const endpoint = new URL("/api/engine-lab?mode=tdm&room=" + room, base);
const playerId = "lab-player";
const wallStart = Date.now();
const log = { room, mode: "tdm", targetSimulatedSeconds: seconds, actions: [], observations: [], discovered: [] };

async function action(name, extra = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Engine-Lab-Token": token },
    body: JSON.stringify({ action: name, ...extra }),
    signal: AbortSignal.timeout(90000),
  });
  const json = await response.json();
  if (!json.ok || !response.ok) throw new Error(name + " HTTP " + response.status + ": " + json.error);
  return json.result ?? json;
}

const created = await action("scenario.create", {
  watch: [playerId, "bot-1", "bot-2", "bot-3", "bot-4"],
  objectives: [{ type: "event-count", event: "weapon:fired", entityId: playerId, minimumCount: 5 }],
});
log.actions.push({ action: "scenario.create", result: created });
const preparation = await action("scenario.prepare", {
  commands: [{
    command: "service.call",
    args: { service: "match-api", method: "connectHuman", arguments: [playerId] },
  }],
});
if (!preparation.results.every(result => result.ok)) throw new Error("Player setup failed");
log.actions.push({ action: "scenario.prepare", result: preparation });
const start = await action("scenario.start");
log.actions.push({ action: "scenario.start", result: start });
const phases = [
  { forward: 1, strafe: 0, turn: 0.16, sprint: true, fireHeld: true },
  { forward: 1, strafe: -0.35, turn: -0.12, sprint: false, fireHeld: false },
  { forward: 1, strafe: 0.4, turn: 0.27, sprint: true, fireHeld: true },
  { forward: -0.4, strafe: 0.65, turn: -0.33, sprint: false, fireHeld: false },
  { forward: 1, strafe: -0.2, turn: 0.1, sprint: true, fireHeld: true },
  { forward: 0.7, strafe: 0.1, turn: -0.4, sprint: false, fireHeld: false, reload: true },
];
let gameSeconds = 0;
let previousIndex = 0;
let totalRecordedEvents = 0;
while (gameSeconds < seconds) {
  const turn = Math.floor(gameSeconds / 5);
  const input = phases[turn % phases.length];
  await action("scenario.input", { playerId, input });
  const steps = Math.min(100, Math.round((seconds - gameSeconds) * 20));
  const advance = await action("scenario.advance", { steps, sampleEvery: 10 });
  gameSeconds = advance.simulatedMs / 1000;
  totalRecordedEvents += advance.recentEvents.length;
  log.observations.push({
    gameTime: advance.gameTime, gameSeconds,
    player: advance.last.entities.find(entity => entity.entityId === playerId) ?? null,
    anomalies: advance.newAnomalies,
  });
  if (advance.newAnomalies.length) log.discovered.push(...advance.newAnomalies);
  if (gameSeconds % 30 === 0 || gameSeconds >= seconds) {
    console.log(JSON.stringify({
      progress: advance.gameTime, realElapsedSeconds: Math.round((Date.now() - wallStart) / 1000),
      observations: advance.observations, anomalies: advance.anomalies,
      player: log.observations.at(-1).player,
    }));
  }
  // Allow an observer to inspect and influence the next game turn. This is
  // paced real gameplay, not a fast-forward of five simulated minutes.
  const nextWallDeadline = wallStart + gameSeconds * 1000;
  if (Date.now() < nextWallDeadline) {
    await new Promise(resolve => setTimeout(resolve, nextWallDeadline - Date.now()));
  }
}
const report = await action("scenario.finish");
const missing = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Engine-Lab-Token": token },
  body: JSON.stringify({ action: "scenario.prepare", commands: [] }),
});
log.phaseLockHttpStatus = missing.status;
log.final = report;
log.wallElapsedSeconds = (Date.now() - wallStart) / 1000;
const out = path.join(os.homedir(), "Downloads", "Echo Front Engine Lab " + room + ".json");
fs.writeFileSync(out, JSON.stringify(log, null, 2) + "\n");
console.log("FINAL", JSON.stringify({
  reportFile: out, wallElapsedSeconds: log.wallElapsedSeconds,
  gameTime: report.gameTime, steps: report.steps,
  objectives: report.objectives, verdict: report.verdict,
  totalAnomalies: report.anomalies.length, events: report.eventCounts,
  phaseLockHttpStatus: log.phaseLockHttpStatus,
}));
