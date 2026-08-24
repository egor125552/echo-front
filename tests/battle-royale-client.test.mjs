import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveSoundUrl } from "../client/plugins/core-sound-pack.js";
import { occlusionCutoff } from "../client/plugins/spatial-audio.js";

test("battle royale UI exposes a dedicated mode button and interaction control", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="battle-royale-button"/);
  assert.match(html, /data-touch-action="interact"/);
  assert.match(html, /E — взаимодействовать/i);
  assert.match(html, /Осталось игроков/);
  assert.match(html, /Локация/);
});

test("client and public battle royale plugins stay mirrored", async () => {
  for (const name of [
    "network", "input", "game-hud", "announcer", "core-sound-pack", "spatial-audio",
    "building-acoustics", "battle-royale-audio", "snapshot-smoothing",
  ]) {
    const source = await readFile(new URL(`../client/plugins/${name}.js`, import.meta.url), "utf8");
    const browser = await readFile(new URL(`../public/client/plugins/${name}.js`, import.meta.url), "utf8");
    assert.equal(browser, source, `${name} browser mirror differs`);
  }
});

test("surface footsteps resolve into the imported sound library", () => {
  assert.match(resolveSoundUrl({ key: "footstep.concrete.8", surface: "concrete", gait: "walk", variant: 8 }), /open-esport-concrete\/walk-8\.mp3$/);
  assert.match(resolveSoundUrl({ key: "footstep.metal.8", surface: "metal", gait: "run", variant: 8 }), /scp\/metal-run-8\.mp3$/);
  assert.match(resolveSoundUrl({ key: "footstep.stone.6", surface: "stone", gait: "walk", variant: 6 }), /stone-right-3\.mp3$/);
  assert.match(resolveSoundUrl({ key: "footstep.sand.6", surface: "sand", gait: "run", variant: 6 }), /sand-right-3\.mp3$/);
  assert.match(resolveSoundUrl({ key: "footstep.default.1", surface: "default", gait: "walk", variant: 1 }), /zacjoffe\/step-0\.mp3$/);
});

test("occlusion progressively removes high frequencies without muting a source", () => {
  assert.equal(occlusionCutoff(0), 18000);
  assert.ok(occlusionCutoff(0.5) < 18000);
  assert.ok(occlusionCutoff(1) <= 3000.1);
  assert.ok(occlusionCutoff(1) >= 2999.9);
});

test("battle royale cues reuse existing Warzone assets instead of missing alias files", async () => {
  const source = await readFile(new URL("../client/plugins/battle-royale-audio.js", import.meta.url), "utf8");
  assert.match(source, /WARZONE_AUDIO_ROOT/);
  assert.match(source, /Loot Cache Chest Open/);
  assert.match(source, /Warzone Victory!/);
  assert.doesNotMatch(source, /assets\/audio\/battle-royale\//);
});

test("local weapon audio stays silent during the deployment freeze", async () => {
  const source = await readFile(new URL("../client/plugins/core-sound-pack.js", import.meta.url), "utf8");
  assert.match(source, /canFire: !battleRoyale \|\| snapshot\.match\?\.phase === "active"/);
  assert.match(source, /!selfState\.canFire/);
});

test("held input is resent when deployment unlocks combat", async () => {
  const source = await readFile(new URL("../client/plugins/network.js", import.meta.url), "utf8");
  assert.match(source, /packet\.event === "battle-royale:started"\) sendInput\(\)/);
});

test("spectator snapshots move the audio listener to the observed survivor", async () => {
  const spatial = await readFile(new URL("../client/plugins/spatial-audio.js", import.meta.url), "utf8");
  const announcer = await readFile(new URL("../client/plugins/announcer.js", import.meta.url), "utf8");
  assert.match(spatial, /snapshot\?\.spectator\?\.active/);
  assert.match(spatial, /snapshot\.spectator\.targetId/);
  assert.match(announcer, /Вы выбыли\. \${placement}-е место/);
  assert.match(announcer, /Наблюдение за/);
  const hud = await readFile(new URL("../client/plugins/game-hud.js", import.meta.url), "utf8");
  assert.match(hud, /snapshot\?\.playerPlacement/);
});
