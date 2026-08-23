import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  WORLD_HALF_SIZE,
  describeBlockedMove,
} from "../src/plugins/map-test-arena/server.js";

test("forest training ground is a large open 100 by 100 metre map", async () => {
  const game = await createEchoFrontGame();
  const map = game.host.services.get("map");

  assert.equal(map.id, "forest-training-ground");
  assert.equal(WORLD_HALF_SIZE, 50);
  assert.equal(map.halfSize, 50);
  assert.equal(map.walls.length, 4);
  assert.ok(map.walls.every((wall) => wall.kind === "world-boundary"));
  assert.deepEqual(new Set(map.walls.map((wall) => wall.side)), new Set(["north", "south", "west", "east"]));

  const snapshot = game.api.snapshot();
  assert.ok(snapshot.entities.every((entity) => Math.abs(entity.x) < 40 && Math.abs(entity.z) < 40));
  await game.host.stop();
});

test("blocked movement is classified as world boundary only at the outer edge", () => {
  assert.deepEqual(
    describeBlockedMove(
      { x: 49.1, z: 0 },
      { x: 0.3, z: 0 },
      { x: 0.04, z: 0 },
    ),
    {
      kind: "world-boundary",
      speech: "Здесь пройти нельзя. Граница мира",
    },
  );

  assert.equal(
    describeBlockedMove(
      { x: 0, z: 0 },
      { x: 0.3, z: 0 },
      { x: 0, z: 0 },
    ),
    null,
    "another character blocking movement in the field must not be called a wall",
  );
});

test("human gets one boundary warning per collision attempt and can trigger it again after releasing movement", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-boundary");
  const movement = game.host.services.get("movement");

  movement.teleport("human-boundary", { x: 49, z: 0, angle: Math.PI / 2 });
  game.drainEvents();

  movement.setInput("human-boundary", { forward: 1 });
  movement.tick(0.1, 1000);
  let warnings = game.drainEvents().filter((packet) => packet.event === "movement:blocked");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].payload.recipientId, "human-boundary");
  assert.equal(warnings[0].payload.kind, "world-boundary");

  movement.tick(0.1, 1100);
  warnings = game.drainEvents().filter((packet) => packet.event === "movement:blocked");
  assert.equal(warnings.length, 0, "holding into the same boundary must not spam speech");

  movement.setInput("human-boundary", {});
  movement.tick(0.1, 1200);
  game.drainEvents();

  movement.setInput("human-boundary", { forward: 1 });
  movement.tick(0.1, 1300);
  warnings = game.drainEvents().filter((packet) => packet.event === "movement:blocked");
  assert.equal(warnings.length, 1, "a fresh collision attempt should announce again");
  await game.host.stop();
});

test("client boundary phrase interrupts speech and browser mirror stays identical", async () => {
  const source = await readFile(new URL("../client/plugins/announcer.js", import.meta.url), "utf8");
  const browser = await readFile(new URL("../public/client/plugins/announcer.js", import.meta.url), "utf8");

  assert.match(source, /movement:blocked/);
  assert.match(source, /Здесь пройти нельзя\. Граница мира/);
  assert.match(source, /interrupt: true, repeat: true/);
  assert.equal(browser, source);
});
