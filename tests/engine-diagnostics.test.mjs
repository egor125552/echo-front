import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ENGINE_DIAGNOSTICS_CONTROL } from "../src/config/engine-diagnostics.js";
import { createEchoFrontGame } from "../src/server/game.js";

test("engine diagnostics are disabled by default", () => {
  assert.equal(ENGINE_DIAGNOSTICS_CONTROL.enabled, false);
  assert.ok(Number.isInteger(ENGINE_DIAGNOSTICS_CONTROL.revision));
  assert.ok(ENGINE_DIAGNOSTICS_CONTROL.revision >= 1);
});

test("battle royale exposes a direct runtime diagnostics snapshot", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const diagnostics = game.diagnostics();
    assert.equal(diagnostics.active, true);
    assert.equal(diagnostics.mode, "battle-royale");
    assert.ok(diagnostics.plugins.some((plugin) => plugin.id === "bot-brain"));
    assert.ok(diagnostics.services.some((service) => service.name === "entities"));
    assert.ok(diagnostics.components.some((component) => component.name === "Transform"));
    assert.equal(typeof diagnostics.eventQueueDepth, "number");
  } finally {
    await game.host.stop();
  }
});

test("worker source gates the live diagnostics route behind the repository switch", () => {
  const source = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/diagnostics/);
  assert.match(source, /ENGINE_DIAGNOSTICS_CONTROL\.enabled/);
  assert.match(source, /Cache-Control/);
});

test("diagnostics control workflow can switch on, off and report status", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/engine-diagnostics.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /- on/);
  assert.match(workflow, /- off/);
  assert.match(workflow, /- status/);
  assert.match(workflow, /Wait for Cloudflare control state/);
});
