function intersects(a, b, rect) {
  let start = 0;
  let end = 1;
  for (const axis of ["x", "z"]) {
    const delta = b[axis] - a[axis];
    const [min, max] = rect[axis];
    if (Math.abs(delta) < 1e-8) {
      if (a[axis] < min || a[axis] > max) return false;
      continue;
    }
    const t1 = (min - a[axis]) / delta;
    const t2 = (max - a[axis]) / delta;
    start = Math.max(start, Math.min(t1, t2));
    end = Math.min(end, Math.max(t1, t2));
    if (start > end) return false;
  }
  return true;
}

function contains(rect, p) {
  return p.x >= rect.x[0] && p.x <= rect.x[1] && p.z >= rect.z[0] && p.z <= rect.z[1];
}

// Route same-floor travel around the occupied stair volume. Floor-changing
// transitions still use their authored stair entrance and exit waypoints.
export function stairBypassPoints(from, to, walls) {
  const obstacles = walls.filter(stair => stair.kind === "building-stair"
    && Math.abs((from.y || 0) - (stair.y || 0)) < 0.2
    && Math.abs((to.y || 0) - (stair.y || 0)) < 0.2).map(stair => {
    const alongZ = stair.risesToward === "north" || stair.risesToward === "south";
    const hx = (alongZ ? stair.width : stair.run) / 2;
    const hz = (alongZ ? stair.run : stair.width) / 2;
    return {
      // Include the forgiving collision width and the character's shoulders.
      rect: {
        x: [stair.x - hx - (alongZ ? 0.75 : 0.1), stair.x + hx + (alongZ ? 0.75 : 0.1)],
        z: [stair.z - hz - (alongZ ? 0.1 : 0.75), stair.z + hz + (alongZ ? 0.1 : 0.75)],
      },
      corners: [-1, 1].flatMap(sx => [-1, 1].map(sz => ({
        x: stair.x + sx * (hx + (alongZ ? 1.35 : 0.9)),
        y: stair.y || 0,
        z: stair.z + sz * (hz + (alongZ ? 0.9 : 1.35)),
        kind: "ground-bypass",
        mandatory: true,
      }))),
    };
  }).filter(({ rect }) => !contains(rect, from) && !contains(rect, to));
  const clear = (a, b) => obstacles.every(({ rect }) => !intersects(a, b, rect));
  if (clear(from, to)) return [];
  const nodes = [from, to, ...obstacles.flatMap(({ corners }) => corners)];
  const distances = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const visited = new Set();
  distances[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    let best = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (!visited.has(i) && (best < 0 || distances[i] < distances[best])) best = i;
    }
    if (best < 0 || !Number.isFinite(distances[best])) break;
    if (best === 1) {
      const path = [];
      for (let i = previous[1]; i > 0; i = previous[i]) path.unshift(nodes[i]);
      return path;
    }
    visited.add(best);
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i) || !clear(nodes[best], nodes[i])) continue;
      const distance = distances[best] + Math.hypot(nodes[i].x - nodes[best].x, nodes[i].z - nodes[best].z);
      if (distance < distances[i]) {
        distances[i] = distance;
        previous[i] = best;
      }
    }
  }
  return [];
}
