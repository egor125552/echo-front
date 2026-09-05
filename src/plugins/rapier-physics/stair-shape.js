// A staircase occupies the space below its treads. A thin rotated slab lets
// characters enter that space and collide with the underside while climbing.
export function stairHullPoints(run, rise, width, thickness, direction) {
  const [ux, uz] = {
    east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1],
  }[direction] ?? [-1, 0];
  const points = [];
  for (const across of [-width / 2, width / 2]) {
    for (const [along, y] of [
      [-run / 2, -thickness], [run / 2, -thickness],
      [-run / 2, 0], [run / 2, rise],
    ]) {
      points.push(ux * along - uz * across, y, uz * along + ux * across);
    }
  }
  return new Float32Array(points);
}
