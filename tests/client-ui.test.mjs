import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ClientPluginHost } from "../client/core/plugin-host.js";
import { echoFrontClientPreset } from "../client/presets/echo-front.js";

test("client plugin dependency graph can be constructed before play button wiring", () => {
  assert.doesNotThrow(() => new ClientPluginHost(echoFrontClientPreset));
});

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

test("public game exposes touch movement and action controls", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="touch-controls"/);
  assert.match(html, /data-touch-control="forward"/);
  assert.match(html, /data-touch-control="back"/);
  assert.match(html, /data-touch-control="left"/);
  assert.match(html, /data-touch-control="right"/);
  assert.match(html, /data-touch-control="stop"/);
  assert.match(html, /data-touch-action="fire"/);
  assert.match(html, /data-touch-action="reload"/);
  assert.match(html, /VoiceOver/);
});

test("public movement help no longer describes left and right arrows as camera turning", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /стрелка влево — двигаться влево/i);
  assert.match(html, /стрелка вправо — двигаться вправо/i);
  assert.match(html, /Камера и поворот мышью не используются/i);
  assert.doesNotMatch(html, /стрелки влево и вправо — поворот для ориентации/i);
});

test("spoken welcome guidance matches the new directional controls", async () => {
  const announcer = await readFile(new URL("../public/client/plugins/announcer.js", import.meta.url), "utf8");
  assert.match(announcer, /влево — движение влево/i);
  assert.match(announcer, /вправо — движение вправо/i);
  assert.match(announcer, /Поворот камеры не нужен/i);
  assert.doesNotMatch(announcer, /Q и E делают боковые шаги/i);
  assert.doesNotMatch(announcer, /поворачивают для ориентации по звуку/i);
});
