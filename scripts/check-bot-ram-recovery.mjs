import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRamRecovery } from '../src/plugins/battle-royale-bot-vehicles/ram-recovery.js';

function fixture(clearance = Infinity) {
  const target = { id: 'human', alive: true };
  const point = { x: 0, y: 0, z: 0 };
  const routes = { clearDistance: () => clearance, clearPath: () => clearance > 35, visible: () => true };
  const recovery = createRamRecovery({ routes, targetFor: () => target.alive ? point : null });
  const state = { phase: 'travel', attempts: 0 };
  return { recovery, state, point, target };
}

test('a missed first pass plans a bounded second approach when space is clear', () => {
  const { recovery, state } = fixture();
  recovery.update(state, { x: 0, z: 20, angle: 0 }, { entityId: 'human', point: { x: 0, z: 0 }, distance: 20 }, 0);
  recovery.update(state, { x: 0, z: 4, angle: 0 }, { entityId: 'human', point: { x: 0, z: 0 }, distance: 4 }, 1000);
  const result = recovery.update(state, { x: 0, z: -12, angle: 0 }, null, 2000);
  assert(result.turnaround, 'The missed pass must produce a second approach');
  assert.equal(state.phase, 'ram-turnaround');
  assert(result.point.z < -12, 'First clear the passing lane before turning');
});

test('a missed ram near obstacles chooses dismount instead of a blind U-turn', () => {
  const { recovery, state } = fixture(8);
  recovery.update(state, { x: 0, z: 20, angle: 0 }, { entityId: 'human', point: { x: 0, z: 0 }, distance: 20 }, 0);
  recovery.update(state, { x: 0, z: 4, angle: 0 }, { entityId: 'human', point: { x: 0, z: 0 }, distance: 4 }, 1000);
  assert.equal(recovery.update(state, { x: 0, z: -12, angle: 0 }, null, 2000).stopReason, 'ram-no-turn-space');
});

test('a second failed attempt ends in braking, not endless circling', () => {
  const { recovery, state } = fixture();
  state.attempts = 1;
  recovery.update(state, { x: 0, z: 20, angle: 0 }, { entityId: 'human', point: { x: 0, z: 0 }, distance: 20 }, 0);
  recovery.update(state, { x: 0, z: 4, angle: 0 }, { entityId: 'human', point: { x: 0, z: 0 }, distance: 4 }, 1000);
  assert.equal(recovery.update(state, { x: 0, z: -12, angle: 0 }, null, 2000).stopReason, 'ram-attempts-exhausted');
});

test('turnaround timeout releases a stale chase', () => {
  const { recovery, state } = fixture();
  recovery.update(state, { x: 0, z: 10, angle: 0 }, { entityId: 'human', point: { x: 0, z: 0 }, distance: 10 }, 0);
  recovery.update(state, { x: 0, z: -15, angle: 0 }, null, 1000);
  assert.equal(recovery.update(state, { x: 0, z: -12, angle: 0 }, null, 61000).stopReason, 'ram-turn-timeout');
});
