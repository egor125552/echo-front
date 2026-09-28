import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

const game = await createEchoFrontGame({ mode: "battle-royale" });
const playerId = "navigation-stability-bot-driver-isolation";
game.api.connectHuman(playerId);
game.host.events.emit("parachute:landed", { entityId: playerId, now: Date.now() });

const entities = game.host.services.get("entities");
const vehicles = game.host.services.get("vehicles");
const navigation = game.host.services.get("navigation");
const originalAvailableTargets = navigation.availableTargets.bind(navigation);
let botDriverNavigationCalls = 0;
navigation.availableTargets = (entityId) => {
  if (entities.get(entityId)?.bot && vehicles.isDriving?.(entityId)) botDriverNavigationCalls += 1;
  return originalAvailableTargets(entityId);
};

let now = Date.now();
for (let i = 0; i < 1200; i += 1) {
  now += 50;
  game.api.step(0.05, now);
}
botDriverNavigationCalls = 0;
for (let i = 0; i < 20; i += 1) {
  now += 50;
  game.api.step(0.05, now);
}
assert.equal(botDriverNavigationCalls, 0, "bot drivers must bypass human navigation stability");
console.log("navigation stability bot-driver isolation: ok");
