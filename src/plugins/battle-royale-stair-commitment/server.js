import { STAIR, UPPER_FLOOR_Y } from "../battle-royale-map/server.js";

export const manifest = {
  id: "battle-royale-stair-commitment",
  version: "1.0.0",
  requires: ["map-test-arena"],
  capabilities: ["services.consume"],
};

function insideStairLane(position) {
  const x = Number(position?.x) || 0;
  const z = Number(position?.z) || 0;
  return x >= STAIR.minX - 0.55
    && x <= STAIR.maxX + 0.55
    && z >= STAIR.minZ - 0.36
    && z <= STAIR.maxZ + 0.36;
}

export async function setup(ctx) {
  const map = ctx.services.get("map");
  const originalNavigationWaypoint = map.navigationWaypoint.bind(map);

  map.navigationWaypoint = function committedStairWaypoint(from, target) {
    const route = originalNavigationWaypoint(from, target);
    if (route?.kind !== "stair") return route;

    const y = Number(from?.y) || 0;
    if (y <= 0.02 || y >= UPPER_FLOOR_Y - 0.12 || !insideStairLane(from)) return route;

    const targetUpper = (Number(target?.y) || 0) >= UPPER_FLOOR_Y * 0.55;
    if (targetUpper) {
      return {
        ...route,
        kind: "stair",
        stairStage: "commit-up",
        x: STAIR.minX - 0.5,
        y: UPPER_FLOOR_Y,
        z: (STAIR.minZ + STAIR.maxZ) / 2,
      };
    }

    // y=0.21 intentionally keeps the generic bottom-entry alignment helper from
    // treating a descending bot as if it were approaching the stair for the first time.
    return {
      ...route,
      kind: "stair",
      stairStage: "commit-down",
      x: STAIR.maxX - 0.5,
      y: 0.21,
      z: (STAIR.minZ + STAIR.maxZ) / 2,
    };
  };
}
