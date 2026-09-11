import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';
const PLAYER = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';
async function scenario(run) {
  const game = await createEchoFrontGame({ mode: 'battle-royale' });
  const s = game.host.services, c = game.host.components;
  let now = Date.now() + 1000;
  try {
    for (const id of [PLAYER, OTHER]) game.api.connectHuman(id);
    for (const e of [...s.get('entities').all()]) if (e.bot) s.get('entities').remove(e.id);
    for (const id of [PLAYER, OTHER]) {
      Object.assign(c.get(id, 'Parachute'), { phase: 'landed', airborne: false });
      s.get('movement').teleport(id, { x: 0, y: 0, z: id === PLAYER ? 0 : -8, angle: Math.PI });
    }
    const snap = () => game.api.snapshotFor(PLAYER, now).entities.find(e => e.id === PLAYER);
    const down = () => s.get('health').applyDamage(PLAYER, 999, { attackerId: OTHER, weaponId: 'pistol', now });
    const step = (ticks, input = {}) => { for (let i = 0; i < ticks; i++) { now += 50; game.api.handleInput(PLAYER, input, now); game.api.step(.05, now); } };
    await run({ game, s, c, snap, down, step, now: () => now });
  } finally { await game.host.stop(); }
}

test('lethal hit downs a human; armor is gone and passive healing cannot raise them', () => scenario(({ s, down, snap, step }) => {
  assert.equal(down().killed, false);
  assert.equal(snap().downed, true);
  assert.equal(snap().health, 100);
  assert.equal(snap().healthMax, 100);
  assert.equal(snap().armor, 0);
  assert.equal(s.get('health').heal(PLAYER, 100), 0);
  step(200);
  assert(snap().health > 82 && snap().health < 84);
  assert.equal(snap().alive, true);
}));

test('downed humans crawl slowly and cannot fire, sprint, plate, jump or enter a vehicle', () => scenario(({ down, snap, step, s }) => {
  down(); s.get('armor').grantPlates(PLAYER, 2);
  const ammo = snap().ammo;
  step(20, { forward: 1, sprint: true, fireHeld: true, firePressed: true, platePressed: true, jumpPressed: true, parachutePressed: true, interactPressed: true });
  const p = snap();
  assert(Math.hypot(p.x, p.z) > .7 && Math.hypot(p.x, p.z) < 1);
  assert(Math.abs(p.y) < .1);
  assert.equal(p.ammo, ammo); assert.equal(p.armor, 0); assert.equal(p.plating, false);
  assert.equal(s.get('vehicles').isDriving(PLAYER), false);
}));

test('finishing shots consume downed health and cause one final death', () => scenario(({ game, s, down, snap, now }) => {
  down(); game.drainEvents();
  s.get('combat').damage(PLAYER, 22, { attackerId: OTHER, weaponId: 'pistol', now: now() });
  assert.equal(snap().health, 78); assert.equal(snap().armor, 0);
  s.get('combat').damage(PLAYER, 100, { attackerId: OTHER, weaponId: 'pistol', now: now() });
  assert.equal(snap().alive, false);
  assert.equal(game.drainEvents().filter(p => p.event === 'entity:died' && p.payload.entityId === PLAYER).length, 1);
}));

test('bleed-out kills after one minute without respawning or healing', () => scenario(({ down, snap, step }) => {
  down(); step(1180); assert.equal(snap().alive, true);
  step(21); assert.equal(snap().alive, false);
}));

test('one starting stim revives after six seconds; moving or taking damage cancels without consuming it', () => scenario(({ s, game, down, snap, step, now }) => {
  down();
  game.api.handleInput(PLAYER, { stimulantPressed: true }, now());
  step(40); assert.equal(snap().downed, true); assert(snap().stimulantUse);
  step(1, { forward: 1 }); assert.equal(snap().stimulantUse, null); assert.equal(snap().stimulants, 1);
  game.api.handleInput(PLAYER, { stimulantPressed: true }, now());
  s.get('combat').damage(PLAYER, 1, { attackerId: OTHER, weaponId: 'pistol', now: now() });
  assert.equal(snap().stimulantUse, null);
  game.api.handleInput(PLAYER, { stimulantPressed: true }, now());
  step(119); assert.equal(snap().downed, true);
  step(1); assert.equal(snap().downed, false); assert.equal(snap().stimulants, 0);
  assert.equal(snap().healthMax, 200); assert.equal(snap().health, 100); assert.equal(snap().armor, 0);
  const before = snap(); step(20, { forward: 1 });
  assert(Math.hypot(snap().x - before.x, snap().z - before.z) > 3);
}));

test('the starting stim fully heals a standing player and cannot be used again when empty', () => scenario(({ s, game, snap, step, now }) => {
  s.get('health').applyDamage(PLAYER, 100, { now: now() });
  game.api.handleInput(PLAYER, { stimulantPressed: true }, now());
  assert(snap().stimulantUse);
  step(40); assert.equal(snap().health, 200); assert.equal(snap().stimulants, 0);
  s.get('health').applyDamage(PLAYER, 100, { now: now() });
  game.api.handleInput(PLAYER, { stimulantPressed: true }, now());
  assert.equal(snap().stimulantUse, null);
}));

test('standing humans regenerate after five seconds, while downed humans still cannot passively heal', () => scenario(({ s, snap, step, down, now }) => {
  assert.equal(s.has('health-regeneration'), true, 'BR must load passive regeneration for standing humans');
  s.get('health').applyDamage(PLAYER, 100, { now: now() });
  assert.equal(snap().health, 100);
  step(99);
  assert.equal(snap().health, 100, 'Health must not regenerate before the five-second delay');
  step(21);
  assert(snap().health > 124 && snap().health < 127, 'Health must regenerate after the delay');
  s.get('health').applyDamage(PLAYER, 999, { now: now() });
  assert.equal(snap().downed, true);
  const downedHealth = snap().health;
  step(20);
  assert(snap().health < downedHealth, 'A downed player must bleed instead of passively regenerating');
}));

test('stimulants cannot run inside a vehicle and vehicle entry cancels active use', () => scenario(({ s, c, now }) => {
  const vehicles = s.get('vehicles'), meds = s.get('stimulants'), movement = s.get('movement');
  const car = vehicles.stateFor('br-jeep-2');
  s.get('health').applyDamage(PLAYER, 80, { now: now() });
  assert.equal(meds.start(PLAYER, now()), true);
  movement.teleport(PLAYER, { x: car.x, y: 0, z: car.z + 2 });
  assert.equal(vehicles.enter(PLAYER, now(), 'br-jeep-2'), true);
  assert.equal(meds.isUsing(PLAYER), false);
  assert.equal(meds.start(PLAYER, now()), false);
  assert.equal(vehicles.exit(PLAYER, now(), 'test'), true);

  movement.teleport(OTHER, { x: car.x, y: 0, z: car.z + 2 });
  assert.equal(vehicles.enter(OTHER, now(), 'br-jeep-2'), true);
  movement.teleport(PLAYER, { x: car.x, y: 0, z: car.z + 2.2 });
  assert.equal(meds.start(PLAYER, now()), true);
  assert.equal(vehicles.enterPassenger(PLAYER, 'br-jeep-2', now()), true);
  assert.equal(meds.isUsing(PLAYER), false);
  assert.equal(meds.start(PLAYER, now()), false);
}));

test('an armor crate grants plates and a stim once, with a maximum of two stims', () => scenario(({ s, game, c, snap, now }) => {
  const crate = s.get('map').crates.find(e => e.loot === 'armor');
  s.get('movement').teleport(PLAYER, { x: crate.x + 1.5, y: crate.y, z: crate.z });
  game.api.handleInput(PLAYER, { interactPressed: true }, now());
  assert.equal(snap().stimulants, 2); assert(snap().armorReserve >= 3);
  game.api.handleInput(PLAYER, { interactPressed: true }, now()); assert.equal(snap().stimulants, 2);
  s.get('stimulants').grant(PLAYER, 10); assert.equal(snap().stimulants, 2);
}));

test('bots die immediately and can aim real projectiles at a crawling human', () => scenario(({ s, c, down, snap, step, now }) => {
  const bot = s.get('entities').spawn({ id: 'test-bot', bot: true, team: 44, health: 100, position: { x: 10, y: 0, z: 0 } });
  assert.equal(s.get('health').applyDamage('test-bot', 999, { now: now() }).killed, true);
  down();
  // Target assist must aim down to the smaller, real crawling collider.
  const shot = s.get('targeting').resolveShot(OTHER, { x: 0, y: 0, z: 1 }, 50);
  assert.equal(shot.targetId, PLAYER); assert(shot.direction.y < -.03);
  const before = snap().health;
  assert.equal(s.get('weapons').fire(OTHER, now()), true);
  step(5);
  assert(snap().health < before - 15, 'The real projectile missed the crawling player');
}));
