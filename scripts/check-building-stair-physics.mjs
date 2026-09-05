import assert from 'node:assert/strict';
import { setup as setupPhysics } from '../src/plugins/rapier-physics/server.js';
import { setup as setupRamps } from '../src/plugins/rapier-cardinal-ramps/server.js';

const services = new Map();
const ctx = { services: { provide: (key, value) => services.set(key, value), get: key => services.get(key) } };
await setupPhysics(ctx);
await setupRamps(ctx);
const physics = services.get('physics');
physics.createFloor({ kind: 'ground', x: 0, y: 0, z: 0, hx: 100, hz: 100 });
const axes = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] };
let count = 0;
for (const [direction, [ux, uz]] of Object.entries(axes)) {
  const origin = { x: count++ * 20 - 30, z: 0 };
  const point = (along, across, y = 0) => ({ x: origin.x + ux * along - uz * across, y, z: origin.z + uz * along + ux * across });
  physics.createRamp({ kind: 'building-stair', ...origin, y: 0, run: 6, rise: 3.2, width: 4, risesToward: direction });
  const upper = point(6, 0, 3.2);
  physics.createFloor({ kind: 'building-floor', ...upper, hx: ux ? 3 : 4, hz: uz ? 3 : 4 });
  const id = direction;
  physics.createCharacter(id, point(-4, 0));
  const walk = (along, across, ticks, dt = .05, speed = 3.25) => {
    let velocity = 0;
    for (let i = 0; i < ticks; i++) {
      velocity = Math.max(-16, velocity - 18 * dt);
      const moved = physics.move(id, (ux * along - uz * across) * speed * dt, (uz * along + ux * across) * speed * dt, velocity * dt);
      if (moved.grounded) velocity = 0;
      assert(physics.position(id).y > -.08, `${direction}: character sank below the ground`);
    }
    return physics.position(id);
  };
  for (const dt of [.025, .05, .1]) {
    for (const speed of [3.25, 5.4]) {
      for (const across of [-1.6, 0, 1.6]) {
        physics.teleport(id, point(-4, across));
        const up = walk(1, 0, Math.ceil(12 / (speed * dt)), dt, speed);
        assert(up.y > 3.1, `${direction}: failed ascent at offset ${across}, dt=${dt}, speed=${speed}: ${JSON.stringify(up)}`);
        const down = walk(-1, 0, Math.ceil(13 / (speed * dt)), dt, speed);
        assert(Math.abs(down.y) < .08, `${direction}: failed descent`);
      }
    }
  }
  // A ground-floor approach must meet a solid stair side, not enter its underside.
  physics.teleport(id, point(0, 4));
  const side = walk(0, -1, 30);
  const lateral = -(side.x - origin.x) * uz + (side.z - origin.z) * ux;
  assert(lateral > 2.25, `${direction}: walked under the staircase: ${JSON.stringify(side)}`);
  // No invisible ceiling may catch a jump through the lower, hollow underside.
  physics.teleport(id, point(-1.4, 4));
  const lowSide = walk(0, -1, 30);
  const lowLateral = -(lowSide.x - origin.x) * uz + (lowSide.z - origin.z) * ux;
  assert(lowLateral > 2.25, `${direction}: entered the lower stair volume`);
  physics.removeCharacter(id);
}
console.log('PASS: stairs in all four directions, walk/run ascent and descent, side approaches, three frame times.');
