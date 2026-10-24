import assert from "node:assert/strict";
import { test } from "node:test";
import { echoFrontClientPreset } from "../public/client/presets/echo-front.js";
import { ClientPluginHost } from "../public/client/core/plugin-host.js";

test("every client preset module exports a unique manifest and can sort before page bootstrap", () => {
  const ids = new Set();
  for (const [index, plugin] of echoFrontClientPreset.entries()) {
    assert(plugin, `Client preset module at index ${index} is missing`);
    assert.equal(typeof plugin.manifest?.id, "string",
      `Client preset module at index ${index} has no manifest.id`);
    assert(plugin.manifest.id.length, `Empty manifest.id at index ${index}`);
    assert(!ids.has(plugin.manifest.id), `Duplicate manifest.id: ${plugin.manifest.id}`);
    ids.add(plugin.manifest.id);
  }
  const host = new ClientPluginHost(echoFrontClientPreset);
  assert.equal(host.plugins.length, echoFrontClientPreset.length);
  assert(ids.has("touch-control-settings"));
  assert(host.plugins.findIndex(p => p.manifest.id === "touch-control-settings")
    < host.plugins.findIndex(p => p.manifest.id === "iphone-gestures"));
});

test("missing plugin manifest is reported with a useful preset index", () => {
  assert.throws(() => new ClientPluginHost([{ manifest: { id: "valid" } }, {}]),
    /index 1: missing manifest.id/);
});
