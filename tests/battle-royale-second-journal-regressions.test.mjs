import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  STAIR,
  UPPER_FLOOR_Y,
} from "../src/plugins/battle-royale-map/server.js";
import { hasOnlyNavigableSupportCollisions } from "../src/plugins/movement/server.js";
import {
  ZONE_WARNING_INTERVAL_MS,
  zoneDirectionLabel,
} from "../client/plugins/announcer.js";

async function activeBattleRoyale(playerId) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(playerId);
  const deployment = game.api.snapshot().match;
  game.api.step(0.05, deployment.deploymentEndsAt + 1);
  return { game, now: deployment.deploymentEndsAt + 1 };
}

function keepOneBot(game) {
  const entities = game.host.services.get("entities");
  const bots = entities.all().filter((entity) => entity.bot);
  const hunter = bots[0];
  assert.ok(hunter);
  for (const bot of bots.slice(1)) entities.remove(bot.id);
  return hunter;
}

test("zone-style health damage blocks player regeneration for the normal five-second delay", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("gas-regen-human");
  const health = game.host.services.get("health");
  const regen = game.host.services.get("health-regeneration");
  const state = game.host.components.get("gas-regen-human", "Health");

  health.applyDamage("gas-regen-human", 12, {
    attackerId: null,
    weaponId: "zone",
    now: 1000,
  });
  assert.equal(state.current, 188);

  regen.tick(1, 1000);
  assert.equal(state.current, 188, "gas damage must not be healed in the same simulation step");
  regen.tick(1, 5999);
  assert.equal(state.current, 188, "gas damage must restart the same five-second regeneration delay as combat damage");
  regen.tick(1, 6000);
  assert.equal(state.current, 200, "regeneration may resume only after five clean seconds");

  await game.host.stop();
});

test("a BR bot already halfway up the stair keeps climbing instead of combat-strafing off the ramp", async () => {
  const { game, now: start } = await activeBattleRoyale("stair-combat-human");
  const hunter = keepOneBot(game);
  const movement = game.host.services.get("movement");

  movement.teleport("stair-combat-human", {
    x: 65,
    y: UPPER_FLOOR_Y,
    z: -9,
    angle: 0,
  });
  movement.teleport(hunter.id, {
    x: 68.25,
    y: 2.58,
    z: -1.2,
    angle: -Math.PI / 2,
  });

  const state = game.host.components.get(hunter.id, "Bot");
  state.lastKnownTargetId = "stair-combat-human";
  state.lastKnownX = 65;
  state.lastKnownY = UPPER_FLOOR_Y;
  state.lastKnownZ = -9;
  state.lastKnownUntil = start + 20_000;
  state.nextThinkAt = 0;

  let reachedUpper = false;
  for (let step = 1; step <= 160; step += 1) {
    game.api.step(0.05, start + step * 50);
    const transform = game.host.components.get(hunter.id, "Transform");
    if ((transform?.y ?? 0) >= UPPER_FLOOR_Y - 0.2 && transform.x < STAIR.minX + 0.2) {
      reachedUpper = true;
      break;
    }
  }

  const transform = game.host.components.get(hunter.id, "Transform");
  const input = game.host.components.get(hunter.id, "Input");
  const map = game.host.services.get("map");
  const brain = game.host.services.get("bot-brain");
  const route = map.navigationWaypoint(transform, { x: 65, y: UPPER_FLOOR_Y, z: -9 });
  const commitment = brain.commitmentFor(hunter.id);
  assert.equal(
    reachedUpper,
    true,
    `bot still failed the live stair pursuit: ${JSON.stringify({ transform, input, route, commitment })}`,
  );
  assert.ok(Math.abs(transform.z) < 1.5, `bot should stay near the stair centreline instead of falling off the side: z=${transform.z}`);

  await game.host.stop();
});

test("Rapier stair and floor support corrections are not misreported as generic walls", () => {
  assert.equal(hasOnlyNavigableSupportCollisions({
    collisions: [
      { worldObject: { kind: "building-stair" } },
      { worldObject: { kind: "building-floor" } },
    ],
  }), true);
  assert.equal(hasOnlyNavigableSupportCollisions({
    collisions: [{ worldObject: { kind: "ground" } }],
  }), true);
  assert.equal(hasOnlyNavigableSupportCollisions({
    collisions: [
      { worldObject: { kind: "building-stair" } },
      { worldObject: { kind: "building-wall" } },
    ],
  }), false);
  assert.equal(hasOnlyNavigableSupportCollisions({ collisions: [] }), false);
});

test("safe-zone speech tells a blind player which relative direction leads back inside", () => {
  const zone = { x: 0, z: 0, radius: 60 };
  assert.equal(zoneDirectionLabel({ x: 100, z: 0, angle: Math.PI / 2 }, zone), "сзади");
  assert.equal(zoneDirectionLabel({ x: 100, z: 0, angle: -Math.PI / 2 }, zone), "впереди");
  assert.equal(zoneDirectionLabel({ x: 0, z: 100, angle: 0 }, zone), "впереди");
  assert.equal(ZONE_WARNING_INTERVAL_MS, 3000);
});

test("public announcer mirrors directional zone guidance", async () => {
  const source = await readFile(new URL("../client/plugins/announcer.js", import.meta.url), "utf8");
  const publicCopy = await readFile(new URL("../public/client/plugins/announcer.js", import.meta.url), "utf8");
  assert.equal(publicCopy, source);
  assert.match(source, /Зона \$\{direction\}/);
  assert.match(source, /ZONE_WARNING_INTERVAL_MS = 3000/);
});
