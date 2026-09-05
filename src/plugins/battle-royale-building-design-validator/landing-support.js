// Check the union of floor rectangles, including seams between adjacent slabs.
// Splitting at every slab edge catches narrow holes without a sampling grid.
export function hasLandingSupport(stair, slabs, depth) {
  const direction = stair.risesToward ?? "west";
  const alongZ = direction === "north" || direction === "south";
  const sign = direction === "west" || direction === "north" ? -1 : 1;
  const along = alongZ ? "z" : "x";
  const across = alongZ ? "x" : "z";
  const top = (Number(stair[along]) || 0) + sign * Math.abs(Number(stair.run) || 5) / 2;
  const center = Number(stair[across]) || 0;
  const halfWidth = Math.abs(Number(stair.width) || 3) / 2;
  const bounds = {
    [along]: [Math.min(top, top + sign * depth), Math.max(top, top + sign * depth)],
    [across]: [center - halfWidth, center + halfWidth],
  };
  const rectangles = slabs.map(slab => ({
    x: [(Number(slab.x) || 0) - slab.width / 2, (Number(slab.x) || 0) + slab.width / 2],
    z: [(Number(slab.z) || 0) - slab.depth / 2, (Number(slab.z) || 0) + slab.depth / 2],
  }));
  const cuts = axis => [...new Set([
    ...bounds[axis],
    ...rectangles.flatMap(rect => rect[axis]).filter(value => value > bounds[axis][0] && value < bounds[axis][1]),
  ])].sort((a, b) => a - b);
  const xs = cuts("x");
  const zs = cuts("z");
  for (let i = 1; i < xs.length; i++) {
    for (let j = 1; j < zs.length; j++) {
      const x = (xs[i - 1] + xs[i]) / 2;
      const z = (zs[j - 1] + zs[j]) / 2;
      if (!rectangles.some(rect => x >= rect.x[0] && x <= rect.x[1] && z >= rect.z[0] && z <= rect.z[1])) return false;
    }
  }
  return true;
}
