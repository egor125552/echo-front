import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ENGINE_CONTROL } from "../src/config/engine-control.js";
import { ENGINE_COMMAND_REQUEST } from "../src/config/engine-command-request.js";
import { createEchoFrontGame } from "../src/server/game.js";

test("engine control configuration and request slot are valid", () => {
  assert.equal(typeof ENGINE_CONTROL.enabled, "boolean");
  assert.ok(Number.isInteger(ENGINE_CONTROL.revision));
  assert.ok(ENGINE_CONTROL.revision >= 1);
  assert.ok(Number.isInteger(ENGINE_COMMAND_REQUEST.id));
  assert.ok(ENGINE_COMMAND_REQUEST.id >= 0);
  assert.equal(typeof ENGINE_COMMAND_REQUEST.command, "string");
  assert.ok(ENGINE_COMMAND_REQUEST.command.length > 0);
});

test("engine console exposes real plugins, services and components", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const response = await game.command({ command: "engine.status", args: {} });
    assert.equal(response.ok, true);
    assert.equal(response.result.mode, "battle-royale");
    assert.ok(response.result.services.includes("physics"));
    assert.ok(response.result.services.includes("bot-brain"));
    assert.ok(response.result.componentTypes.includes("Transform"));
    assert.ok(response.result.commands.includes("service.call"));
    assert.ok(response.result.commands.includes("engine.batch"));
  } finally {
    await game.host.stop();
  }
});

test("service.call invokes a public engine service method", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const response = await game.command({
      command: "service.call",
      args: { service: "entities", method: "all", arguments: [] },
    });
    assert.equal(response.ok, true);
    assert.ok(Array.isArray(response.result));
  } finally {
    await game.host.stop();
  }
});

test("engine.batch can run a multi-step inspection atomically", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const response = await game.command({
      command: "engine.batch",
      args: {
        commands: [
          { command: "service.methods", args: { service: "physics" } },
          { command: "match.info", args: {} },
          { command: "game.step", args: { steps: 2, dt: 0.05 } },
        ],
      },
    });
    assert.equal(response.ok, true);
    assert.equal(response.result.length, 3);
    assert.ok(response.result.every((entry) => entry.ok));
    assert.ok(response.result[0].result.methods.includes("raycast"));
    assert.equal(response.result[2].result.steps, 2);
  } finally {
    await game.host.stop();
  }
});

test("worker exposes only the compiled one-time engine request", () => {
  const source = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /ENGINE_CONTROL\.enabled/);
  assert.match(source, /ENGINE_COMMAND_REQUEST\.id/);
  assert.match(source, /\/api\/engine-command/);
  assert.doesNotMatch(source, /body\?\.command/);
});

test("GitHub Action waits for live compiled request and stores result artifact", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/engine-command.yml", import.meta.url), "utf8");
  assert.match(workflow, /engineCommandRequestId/);
  assert.match(workflow, /engineControlEnabled/);
  assert.match(workflow, /Invoke compiled engine command/);
  assert.match(workflow, /upload-artifact@v4/);
});
