import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("client preset includes speech settings and play journal plugins", async () => {
  const preset = await readFile(new URL("../client/presets/echo-front.js", import.meta.url), "utf8");
  assert.match(preset, /speech-settings/);
  assert.match(preset, /play-journal/);
});

test("public game exposes speech controls", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="speech-enabled"/);
  assert.match(html, /id="speech-rate"/);
  assert.match(html, /id="speech-test"/);
});

test("public game exposes accessible play journal controls", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="journal-enabled"/);
  assert.match(html, /id="journal-download"/);
  assert.match(html, /id="journal-clear"/);
  assert.match(html, /id="journal-status"[^>]*role="status"/);
});
