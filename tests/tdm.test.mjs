import test from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/core/plugin-host.js";
import * as entities from "../src/plugins/entities/server.js";
import * as teams from "../src/plugins/teams/server.js";
import * as tdm from "../src/plugins/tdm/server.js";

test("TDM reaches target score and resets after intermission", async () => {
  const host = await new PluginHost({ plugins: [entities, teams, tdm] }).start();
  const entityApi = host.services.get("entities");
  const mode = host.services.get("tdm");
  entityApi.spawn({ id: "a", team: 1, movable: false, health: false, weapons: false });
  entityApi.spawn({ id: "b", team: 2, movable: false, health: false, weapons: false });

  for (let i = 0; i < 10; i += 1) {
    host.events.emit("entity:died", { entityId: "b", killerId: "a" });
  }

  const ended = mode.status();
  assert.equal(ended.score[1], 10);
  assert.equal(ended.ended, true);
  assert.equal(ended.winner, 1);

  mode.tick(ended.restartAt + 1);
  const restarted = mode.status(ended.restartAt + 1);
  assert.equal(restarted.ended, false);
  assert.deepEqual(restarted.score, { 1: 0, 2: 0 });
  await host.stop();
});
