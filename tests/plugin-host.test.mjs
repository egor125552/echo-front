import test from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/core/plugin-host.js";

const noCaps = [];

test("empty preset starts and stops", async () => {
  const host = await new PluginHost({ plugins: [] }).start();
  assert.equal(host.plugins.length, 0);
  await host.stop();
});

test("dependencies are started before dependents", async () => {
  const order = [];
  const a = {
    manifest: { id: "a", requires: [], capabilities: noCaps },
    setup() { order.push("a"); },
  };
  const b = {
    manifest: { id: "b", requires: ["a"], capabilities: noCaps },
    setup() { order.push("b"); },
  };
  await new PluginHost({ plugins: [b, a] }).start();
  assert.deepEqual(order, ["a", "b"]);
});

test("missing dependencies are rejected", () => {
  const broken = { manifest: { id: "broken", requires: ["missing"], capabilities: noCaps } };
  assert.throws(() => new PluginHost({ plugins: [broken] }), /requires missing plugin/);
});

test("dependency cycles are rejected", () => {
  const a = { manifest: { id: "a", requires: ["b"], capabilities: noCaps } };
  const b = { manifest: { id: "b", requires: ["a"], capabilities: noCaps } };
  assert.throws(() => new PluginHost({ plugins: [a, b] }), /dependency cycle/);
});

test("capabilities are enforced", async () => {
  const plugin = {
    manifest: { id: "restricted", requires: [], capabilities: [] },
    setup(ctx) { ctx.services.provide("forbidden", {}); },
  };
  await assert.rejects(() => new PluginHost({ plugins: [plugin] }).start(), /lacks capability/);
});
