import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';
import { EngineLab } from '../src/server/engine-lab.js';

test('dismounted BR bot resumes walking while other bots still parachute', async () => {
  const game = await createEchoFrontGame({ mode: 'battle-royale' });
  const lab = new EngineLab(game, {
    mode: 'battle-royale', room: 'actual-bot-dismount-replay',
    watch: ['runner', 'driver'],
  });
  const call = (service, method, ...args) => ({
    command: 'service.call', args: { service, method, arguments: args },
  });
  try {
    const setup = await lab.prepare([
      call('match-api', 'connectHuman', 'runner'),
      call('match-api', 'connectHuman', 'other-player'),
      call('movement', 'teleport', 'runner', { x: 430, y: 0, z: 430 }),
      call('movement', 'teleport', 'other-player', { x: 450, y: 0, z: 450 }),
      { command: 'entity.spawn', args: { spec: {
        id: 'driver', kind: 'bot', bot: true, health: 200,
        position: { x: -630, y: 0, z: -836 },
      } } },
      { command: 'game.step', args: { steps: 25, dt: .05 } },
      // Ordinary bot traffic has already seated driver. Calling assign again
      // would return false and is NOT proof of successful entry.
      { command: 'game.step', args: { steps: 10, dt: .05 } },
      call('movement', 'teleport', 'runner', { x: -600, y: 0, z: -840 }),
    ]);
    assert(setup.results.every(entry => entry.ok), JSON.stringify(setup.results));
    const svc = game.host.services, parts = game.host.components;
    assert.equal(svc.get('vehicles').stateFor('br-jeep-2')?.driverId, 'driver',
      'driver must actually be seated before running the replay');
    lab.start();

    let dismountAt = null, dismountPosition = null, maxMove = 0;
    let footDecision = null, footInput = null;
    for (let second = 1; second <= 20; second++) {
      game.api.handleInput('runner', { forward: 0, strafe: -1, sprint: true });
      await lab.advance({ steps: 20, sampleEvery: 5 });
      const position = parts.get('driver', 'Transform');
      const seated = svc.get('vehicles').isDriving('driver');
      if (!seated && dismountAt === null) {
        dismountAt = second;
        dismountPosition = { x: position.x, z: position.z };
      }
      if (dismountAt !== null) {
        maxMove = Math.max(maxMove, Math.hypot(
          position.x - dismountPosition.x, position.z - dismountPosition.z,
        ));
        footDecision = svc.get('bot-brain').commitmentFor('driver');
        footInput = parts.get('driver', 'Input');
        if (second >= dismountAt + 4) break;
      }
    }
    const activeDeployment = svc.get('battle-royale').status().deployment.active;
    const airborne = svc.get('bots').all().filter(bot =>
      parts.get(bot.id, 'Parachute')?.airborne).length;
    const outcome = {
      dismountAt, maxMove, footGoal: footDecision?.goal ?? null,
      requestedMovement: Math.hypot(footInput?.forward || 0, footInput?.strafe || 0),
      activeDeployment, airborne,
    };
    console.log('EXACT_DISMOUNT_REPLAY', JSON.stringify(outcome));
    assert(dismountAt !== null, 'driver must leave the jeep');
    assert(activeDeployment && airborne > 0, 'other participants must still be airborne');
    assert(footDecision, 'on-foot bot must get a fresh decision');
    assert(outcome.requestedMovement > .1, 'on-foot bot must request movement');
    assert(maxMove > 1, 'on-foot bot must actually walk at least one metre within four seconds');
  } finally {
    await game.host.stop();
  }
});
