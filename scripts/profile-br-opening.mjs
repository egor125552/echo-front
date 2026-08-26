import { createEchoFrontGame } from "../src/server/game.js";

const game = await createEchoFrontGame({ mode: "battle-royale" });
const playerId = "opening-profile-human";
const entities = game.host.services.get("entities");

game.api.connectHuman(playerId);
const deployment = game.api.snapshot().match;
let now = deployment.deploymentEndsAt + 1;
game.api.step(0.05, now);
game.drainEvents();

const samples = [];
const deaths = [];
const remaining = [];
const damageByWeapon = new Map();
const deathByWeapon = new Map();
const lastDamage = new Map();

function transformOf(entityId) {
  const value = game.host.components.get(entityId, "Transform");
  return value ? { x: value.x, y: value.y, z: value.z } : null;
}

function sample(second) {
  const snapshot = game.api.snapshot(now);
  const aliveEntities = snapshot.entities.filter((entry) => entry.alive);
  const radii = aliveEntities.map((entry) => Math.hypot(entry.x, entry.z));
  samples.push({
    second,
    alive: snapshot.match.alive,
    minRadius: radii.length ? Math.min(...radii) : null,
    medianRadius: radii.length ? [...radii].sort((a, b) => a - b)[Math.floor(radii.length / 2)] : null,
    maxRadius: radii.length ? Math.max(...radii) : null,
  });
}

sample(0);
for (let step = 1; step <= 2400; step += 1) {
  now += 50;
  game.api.step(0.05, now);

  for (const packet of game.drainEvents()) {
    const payload = packet.payload ?? {};
    if (packet.event === "combat:damage") {
      const key = payload.weaponId ?? "unknown";
      damageByWeapon.set(key, (damageByWeapon.get(key) ?? 0) + 1);
      lastDamage.set(payload.targetId, payload);
    }
    if (packet.event === "entity:died") {
      const victim = entities.get(payload.entityId);
      const killer = payload.killerId ? entities.get(payload.killerId) : null;
      const victimPos = transformOf(payload.entityId);
      const killerPos = payload.killerId ? transformOf(payload.killerId) : null;
      const distance = victimPos && killerPos
        ? Math.hypot(victimPos.x - killerPos.x, victimPos.z - killerPos.z)
        : null;
      const damage = lastDamage.get(payload.entityId) ?? null;
      const weapon = damage?.weaponId ?? "unknown";
      deathByWeapon.set(weapon, (deathByWeapon.get(weapon) ?? 0) + 1);
      deaths.push({
        second: Number(((now - deployment.deploymentEndsAt - 1) / 1000).toFixed(2)),
        victimId: payload.entityId,
        victimBot: Boolean(victim?.bot),
        killerId: payload.killerId ?? null,
        killerBot: Boolean(killer?.bot),
        weapon,
        distance: distance == null ? null : Number(distance.toFixed(2)),
        victimRadius: victimPos ? Number(Math.hypot(victimPos.x, victimPos.z).toFixed(2)) : null,
      });
    }
    if (packet.event === "battle-royale:remaining") {
      remaining.push({
        second: Number(((now - deployment.deploymentEndsAt - 1) / 1000).toFixed(2)),
        alive: payload.alive,
        threshold: payload.threshold,
      });
    }
  }

  if (step % 100 === 0) sample(step / 20);
  if (game.api.snapshot(now).match.ended) break;
}

const firstMinuteDeaths = deaths.filter((entry) => entry.second <= 60);
const firstMinuteDistances = firstMinuteDeaths
  .map((entry) => entry.distance)
  .filter(Number.isFinite)
  .sort((a, b) => a - b);

const report = {
  samples,
  remaining,
  totalDeaths: deaths.length,
  firstMinuteDeaths: firstMinuteDeaths.length,
  firstMinuteMedianKillDistance: firstMinuteDistances.length
    ? firstMinuteDistances[Math.floor(firstMinuteDistances.length / 2)]
    : null,
  firstMinuteMaxKillDistance: firstMinuteDistances.length
    ? firstMinuteDistances[firstMinuteDistances.length - 1]
    : null,
  damageByWeapon: Object.fromEntries([...damageByWeapon.entries()].sort()),
  deathByWeapon: Object.fromEntries([...deathByWeapon.entries()].sort()),
  firstTwentyDeaths: deaths.slice(0, 20),
};

console.log("BR_OPENING_PROFILE " + JSON.stringify(report));
await game.host.stop();
