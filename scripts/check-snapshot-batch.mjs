import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

const game = await createEchoFrontGame({mode:"battle-royale"});
const player = "cpu-snapshot-batch-test";
try {
  game.api.connectHuman(player);
  const get = () => game.api.snapshotFor(player, 1234567890);
  get(); // initialize one-time developer catalog
  const before = get();
  const batched = game.api.withSnapshotBatch(get);
  assert.deepStrictEqual(batched, before, "read cache must not change the snapshot");
  assert.throws(() => game.api.withSnapshotBatch(() => {get();throw Error("test unwind")}),/test unwind/);
  const health = game.host.components.get(player,"Health");
  const originalHealth = health.current;
  health.current -= 7;
  const updated = game.api.withSnapshotBatch(get);
  assert.equal(updated.entities.find(e=>e.id===player).health,originalHealth-7,
    "A new batch must see updated game components");
  const stateAfter = get();
  assert.deepStrictEqual(updated,stateAfter,"A regular snapshot must retain identical fields");
  console.log("PASS network snapshot batch preserves all fields and invalidates after use");
} finally {
  await game.host.stop();
}
