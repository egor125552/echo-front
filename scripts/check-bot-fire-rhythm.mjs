import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';
import { botFireRhythm } from '../src/plugins/bot-combat/server.js';

test('different bots get bounded distinct bursts and pistol taps', () => {
  const pistol = [1, 2, 3, 4].map(cycle => botFireRhythm('bot-4', 'pistol', cycle));
  assert(pistol.every(p => p.shotMs >= 105 && p.shotMs < 200));
  assert(pistol.every(p => p.pauseMs >= 145 && p.pauseMs <= 434));
  assert(new Set(pistol.map(p => p.shotMs)).size > 1);
  const rifle = [1, 2, 3].map(cycle => botFireRhythm('bot-2', 'rifle', cycle));
  assert(rifle.every(p => p.shotMs === 100 && p.burstMs > 400 && p.pauseMs > 150));
});

test('joining human leaves rifle opponents, rifle teammate, and a pistol specialist', async () => {
  const game = await createEchoFrontGame({ mode: 'tdm' });
  try {
    const humanId = 'rhythm-test-human';
    game.api.connectHuman(humanId);
    const c = game.host.components;
    const bots = game.host.services.get('bots').all();
    const teams = game.host.services.get('teams');
    const loadouts = bots.map(bot => ({ id: bot.id, team: teams.teamOf(bot.id), weapon: c.get(bot.id, 'Weapons').items[0].id }));
    const myTeam = game.host.services.get('teams').teamOf(humanId);
    assert(loadouts.some(b => b.team === myTeam && b.weapon === 'rifle'), 'teammate rifle missing');
    assert(loadouts.some(b => b.team !== myTeam && b.weapon === 'rifle'), 'enemy rifle missing');
    assert(loadouts.some(b => b.weapon === 'pistol'), 'pistol specialist missing');
  } finally { await game.host.stop(); }
});

test('a short real team match produces varied pistol-fire timing without double shots per tick', async () => {
  const game = await createEchoFrontGame({ mode: 'tdm' });
  try {
    game.api.connectHuman('rhythm-human');
    let now = Date.now() + 1000;
    const shots = new Map();
    for (let i = 0; i < 760; i++) {
      now += 50;
      game.api.handleInput('rhythm-human', {}, now);
      game.api.step(0.05, now);
      for (const packet of game.drainEvents()) {
        if (packet.event !== 'weapon:fired') continue;
        const list = shots.get(packet.payload.entityId) ?? [];
        list.push({ now, weapon: packet.payload.weaponId });
        shots.set(packet.payload.entityId, list);
      }
    }
    const pistolShots = [...shots.values()].flat().filter(s => s.weapon === 'pistol');
    const rifleShots = [...shots.values()].flat().filter(s => s.weapon === 'rifle');
    assert(pistolShots.length >= 12, 'pistol bots barely fire');
    assert(rifleShots.length >= 12, 'rifle bots barely fire');
    for (const [id, recorded] of shots) {
      const sameTick = new Set(recorded.map(s => s.now));
      assert.equal(sameTick.size, recorded.length, 'bot ' + id + ' fired twice in one game tick');
    }
    console.log('Observed bot shots: ', Object.fromEntries([...shots].map(([id, a]) => [id, a.length])));
  } finally { await game.host.stop(); }
});
