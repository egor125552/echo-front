import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  advanceSimulation,
  MAX_CATCH_UP_MS,
  SIMULATION_TICK_MS,
} from "../src/server/game-clock.js";

function fakeGame() {
  const calls = [];
  return {
    calls,
    api: {
      step(dt, now) {
        calls.push({ dt, now });
      },
    },
  };
}

test("a one second scheduling gap is fully simulated in safe substeps", () => {
  const game = fakeGame();
  const result = advanceSimulation(game, 1000, 2000);

  assert.equal(SIMULATION_TICK_MS, 50);
  assert.equal(result.simulatedMs, 1000);
  assert.equal(result.droppedMs, 0);
  assert.equal(result.steps, 20);
  assert.equal(result.lastStepAt, 2000);
  assert.ok(game.calls.every(({ dt }) => dt > 0 && dt <= 0.05));
  const totalSeconds = game.calls.reduce((sum, { dt }) => sum + dt, 0);
  assert.ok(Math.abs(totalSeconds - 1) < 0.000001);
  assert.equal(game.calls.at(-1).now, 2000);
});

test("irregular timer delay preserves elapsed simulation time instead of clamping it to 100 ms", () => {
  const game = fakeGame();
  const result = advanceSimulation(game, 5000, 5275);

  assert.equal(result.simulatedMs, 275);
  assert.equal(result.droppedMs, 0);
  assert.equal(result.steps, 6);
  const totalMilliseconds = game.calls.reduce((sum, { dt }) => sum + dt * 1000, 0);
  assert.ok(Math.abs(totalMilliseconds - 275) < 0.000001);
});

test("extreme stalls are bounded so catch-up cannot spiral indefinitely", () => {
  const game = fakeGame();
  const result = advanceSimulation(game, 0, 10000);

  assert.equal(result.simulatedMs, MAX_CATCH_UP_MS);
  assert.equal(result.droppedMs, 10000 - MAX_CATCH_UP_MS);
  assert.equal(result.steps, MAX_CATCH_UP_MS / SIMULATION_TICK_MS);
});

test("MatchRoom owns the simulation interval and websocket messages no longer advance physics", async () => {
  const source = await readFile(new URL("../src/server/match-room.js", import.meta.url), "utf8");
  assert.match(source, /setInterval\(\(\) => this\.runGameLoopTick\(\), SIMULATION_TICK_MS\)/);
  assert.match(source, /advanceSimulation\(this\.game, this\.lastStepAt, now\)/);

  const messageHandler = source.match(/async webSocketMessage\([\s\S]*?\n  }\n\n  async webSocketClose/);
  assert.ok(messageHandler);
  assert.doesNotMatch(messageHandler[0], /game\.api\.step/);
});
