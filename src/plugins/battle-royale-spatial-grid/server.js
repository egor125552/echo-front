export const GRID_CELL_SIZE = 32;

export const manifest = {
  id: "spatial-grid",
  version: "1.0.0",
  requires: ["entities", "movement"],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

function cellCoordinate(value) {
  return Math.floor((Number(value) || 0) / GRID_CELL_SIZE);
}

function cellKey(x, z) {
  return `${x}:${z}`;
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const cells = new Map();
  let rebuiltAt = -Infinity;

  function rebuild(now = Date.now()) {
    if (now - rebuiltAt < 45) return;
    rebuiltAt = now;
    cells.clear();
    for (const entity of entities.all()) {
      if (!entity.alive) continue;
      const transform = ctx.components.get(entity.id, "Transform");
      if (!transform) continue;
      const key = cellKey(cellCoordinate(transform.x), cellCoordinate(transform.z));
      const list = cells.get(key) ?? [];
      list.push({ entity, transform });
      cells.set(key, list);
    }
  }

  function query(position, radius, now = Date.now()) {
    rebuild(now);
    const safeRadius = Math.max(0, Number(radius) || 0);
    const minX = cellCoordinate((position.x ?? 0) - safeRadius);
    const maxX = cellCoordinate((position.x ?? 0) + safeRadius);
    const minZ = cellCoordinate((position.z ?? 0) - safeRadius);
    const maxZ = cellCoordinate((position.z ?? 0) + safeRadius);
    const result = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (const entry of cells.get(cellKey(x, z)) ?? []) result.push(entry);
      }
    }
    return result;
  }

  ctx.services.provide("spatial-grid", {
    cellSize: GRID_CELL_SIZE,
    rebuild,
    query,
    get rebuiltAt() { return rebuiltAt; },
  });
}
