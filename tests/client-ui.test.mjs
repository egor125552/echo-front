import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("client preset includes speech settings plugin", async () => {
  const preset = await readFile(new URL("../client/presets/echo-front.js", import.meta.url), "utf8");
  assert.match(preset, /speech-settings/);
});

test("public game exposes speech controls", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="speech-enabled"/);
  assert.match(html, /id="speech-rate"/);
  assert.match(html, /id="speech-test"/);
});
