import test from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/core/plugin-host.js";
import * as entitiesPlugin from "../src/plugins/entities/server.js";
import * as rapierPhysics from "../src/plugins/rapier-physics/server.js";
import * as mapPlugin from "../src/plugins/battle-royale-map/server.js";
import * as movementPlugin from "../src/plugins/movement/server.js";
import * as teamsPlugin from "../src/plugins/teams/server.js";
import * as botControllerPlugin from "../src/plugins/bot-controller/server.js";
import * as spatialGridPlugin from "../src/plugins/battle-royale-spatial-grid/server.js";
import * as botInterestPlugin from "../src/plugins/battle-royale-bot-interest/server.js";
import {
  BOT_INTEREST_CAPACITY,
  BOT_HEARING_WEAPON_TTL_MS,
} from "../src/plugins/battle-royale-bot-interest/server.js";
import { UPPER_FLOOR_Y } from "../src/plugins/battle-royale-map/server.js";

async function interestHost() {
  return new PluginHost({
    plugins: [
      entitiesPlugin,
      rapierPhysics,
      mapPlugin,
      movementPlugin,
      teamsPlugin,
      botControllerPlugin,
      spatialGridPlugin,
      botInterestPlugin,
    ],
  }).start();
}

test("battle royale bot interest publishes ground-floor and upper-floor warehouse patrol points", async () => {
  const host = await interestHost();
  const interest = host.services.get("bot-interest");

  assert.equal(interest.points.length, 5);
  assert.ok(interest.points.some((point) => Math.abs(point.y) < 0.01));
  assert.ok(interest.points.some((point) => Math.abs(point.y - UPPER_FLOOR_Y) < 0.01));
  assert.ok(interest.points.every((point) => point.group === "warehouse"));

  await host.stop();
});

test("nearby enemy gunfire creates a temporary investigation target for a bot", async () => {
  const host = await interestHost();
  const entities = host.services.get("entities");
  const interest = host.services.get("bot-interest");
  const grid = host.services.get("spatial-grid");
  const now = 120_000;

  entities.spawn({
    id: "hearing-human",
    team: 1,
    position: { x: 100, y: 0, z: 40, angle: 0 },
  });
  entities.spawn({
    id: "hearing-bot",
    bot: true,
    team: 2,
    position: { x: 88, y: 0, z: 40, angle: 0 },
  });
  grid.rebuild(now);

  const listeners = interest.recordSound({
    entityId: "hearing-human",
    key: "weapon.rifle",
    x: 100,
    y: 0,
    z: 40,
    radius: 110,
  }, now);

  assert.equal(listeners, 1);
  const heard = interest.heardFor("hearing-bot");
  assert.equal(heard?.sourceId, "hearing-human");
  assert.equal(heard?.expiresAt, now + BOT_HEARING_WEAPON_TTL_MS);

  const transform = host.components.get("hearing-bot", "Transform");
  const target = interest.targetFor("hearing-bot", transform, now + 1);
  assert.equal(target?.kind, "sound-interest");
  assert.equal(target?.x, 100);
  assert.equal(target?.z, 40);

  await host.stop();
});

test("warehouse curiosity has a hard visitor cap instead of pulling every nearby bot inside", async () => {
  const host = await interestHost();
  const entities = host.services.get("entities");
  const interest = host.services.get("bot-interest");
  const now = 180_000;
  const targets = [];

  for (let i = 1; i <= 30; i += 1) {
    const id = `poi-bot-${i}`;
    entities.spawn({
      id,
      bot: true,
      team: i + 10,
      position: { x: 95 + (i % 3), y: 0, z: (i % 5) - 2, angle: -Math.PI / 2 },
    });
    const transform = host.components.get(id, "Transform");
    const target = interest.targetFor(id, transform, now);
    if (target?.kind === "poi-interest") targets.push({ id, target });
  }

  assert.ok(targets.length > 0, "at least one nearby bot should decide to investigate the warehouse");
  assert.ok(targets.length <= BOT_INTEREST_CAPACITY, `warehouse visitor cap exceeded: ${targets.length}`);
  assert.equal(interest.activeAssignmentCount("warehouse", now), targets.length);
  assert.ok(targets.some(({ target }) => target.y === 0 || target.y === UPPER_FLOOR_Y));

  await host.stop();
});
