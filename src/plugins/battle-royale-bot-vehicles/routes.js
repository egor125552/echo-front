import { distance, headingTo } from "./driving.js";

export function createDriverRoutes(physics, navigation, map) {
  const { world, RAPIER } = physics;
  // Sized for the widest current body, not just the internal chassis.
  const shape = new RAPIER.Cuboid(2.55, .3, 1.5);

  function buildingBounds() {
    const bounds = [];
    if (map.building?.minX != null) bounds.push(map.building);
    for (const building of map.navigationBuildings ?? []) {
      if (building?.bounds) bounds.push(building.bounds);
    }
    return bounds;
  }

  function clearDistance(vehicle, angle, maximum = 160, ignoreVehicleId = null) {
    const yaw = -angle - Math.PI / 2;
    const hit = world.castShape(
      { x: vehicle.x, y: Math.max(.8, vehicle.y), z: vehicle.z },
      { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      { x: Math.sin(angle), y: 0, z: -Math.cos(angle) }, shape, .1, maximum, false,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined,
      physics.dynamicBody(vehicle.id), collider => {
        if (!collider.isEnabled() || physics.isCharacterCollider(collider)) return false;
        if (ignoreVehicleId) {
          const info = physics.colliderInfo?.(collider.handle);
          if (info?.worldObject?.vehicleId === ignoreVehicleId || info?.worldObject?.bodyId === ignoreVehicleId) return false;
        }
        return true;
      },
    );
    return hit ? Number(hit.time_of_impact ?? hit.timeOfImpact ?? 0) : Infinity;
  }

  // Diagnostic-only cast for Engine Lab: identify which real Rapier collider
  // blocks the current heading. Keep ordinary path/physics behavior unchanged.
  function forwardBlocker(vehicle, maximum = 20) {
    const angle = vehicle.angle;
    const yaw = -angle - Math.PI / 2;
    const hit = world.castShape(
      { x: vehicle.x, y: Math.max(.8, vehicle.y), z: vehicle.z },
      { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      { x: Math.sin(angle), y: 0, z: -Math.cos(angle) },
      shape, .1, maximum, false,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined,
      physics.dynamicBody(vehicle.id),
      collider => collider.isEnabled() && !physics.isCharacterCollider(collider),
    );
    if (!hit) return null;
    const info = physics.colliderInfo?.(hit.collider) ?? null;
    const object = info?.worldObject ?? null;
    return {
      distance: Number(hit.time_of_impact ?? hit.timeOfImpact ?? 0),
      kind: object?.kind ?? null,
      vehicleId: object?.vehicleId ?? null,
      bodyId: object?.bodyId ?? null,
      entityId: info?.entityId ?? null,
    };
  }

  function visible(vehicle, target) {
    const from = { x: vehicle.x, y: vehicle.y + .85, z: vehicle.z };
    const delta = { x: target.x - from.x, y: (target.y ?? 0) + .6 - from.y, z: target.z - from.z };
    const length = Math.hypot(delta.x, delta.y, delta.z);
    if (length < .1) return true;
    const ray = new RAPIER.Ray(from, { x: delta.x / length, y: delta.y / length, z: delta.z / length });
    return !world.castRay(ray, Math.max(0, length - .4), true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, physics.dynamicBody(vehicle.id),
      collider => collider.isEnabled() && !physics.isCharacterCollider(collider));
  }

  function parkingGoal(from, goal) {
    const b = buildingBounds().find(bounds => goal.x >= bounds.minX && goal.x <= bounds.maxX
      && goal.z >= bounds.minZ && goal.z <= bounds.maxZ);
    if (!b) return { ...goal, y: 0 };
    return [
      { x: b.minX - 9, z: (b.minZ + b.maxZ) / 2 }, { x: b.maxX + 9, z: (b.minZ + b.maxZ) / 2 },
      { x: (b.minX + b.maxX) / 2, z: b.minZ - 9 }, { x: (b.minX + b.maxX) / 2, z: b.maxZ + 9 },
    ].sort((a, b) => distance(from, a) - distance(from, b))[0];
  }

  function clearanceEscape(from, clearance) {
    for (const bounds of buildingBounds()) {
      const minX = bounds.minX - clearance, maxX = bounds.maxX + clearance;
      const minZ = bounds.minZ - clearance, maxZ = bounds.maxZ + clearance;
      if (from.x < minX || from.x > maxX || from.z < minZ || from.z > maxZ) continue;
      const exits = [
        { distance: Math.abs(from.x - minX), point: { x: minX - 1.5, y: 0, z: from.z } },
        { distance: Math.abs(maxX - from.x), point: { x: maxX + 1.5, y: 0, z: from.z } },
        { distance: Math.abs(from.z - minZ), point: { x: from.x, y: 0, z: minZ - 1.5 } },
        { distance: Math.abs(maxZ - from.z), point: { x: from.x, y: 0, z: maxZ + 1.5 } },
      ];
      exits.sort((a, b) => a.distance - b.distance);
      return exits[0].point;
    }
    return null;
  }

  function plan(vehicle, destination) {
    const goal = parkingGoal(vehicle, destination);
    const buildingClearance = Math.max(5.5, Number(navigation.constants?.vehicleDetourClearance) || 7);
    // If a replan happens while the car is already inside a building's safety
    // margin, first move straight out through the nearest face. Otherwise a
    // diagonal detour can still scrape the wall before reaching a safe corner.
    const escape = clearanceEscape(vehicle, buildingClearance);
    const routeStart = escape ?? vehicle;
    const route = navigation.buildRoute(routeStart, { position: goal, mode: "vehicle" });
    // Keep corners, rather than the widely spaced speech checkpoints. Give
    // every segment a right-hand lane bias so opposing bot traffic does
    // not aim for the exact same centre line.
    const anchors = (route?.anchors?.length ? route.anchors : [goal]).map(p => ({ x: p.x, y: 0, z: p.z }));
    const raw = escape ? [{ ...escape, escape: true }, ...anchors] : anchors;
    const points = [];
    let cursor = vehicle;
    for (const point of raw) {
      const dx = point.x - cursor.x, dz = point.z - cursor.z;
      const length = Math.hypot(dx, dz);
      const lane = !point.escape && length > 16 ? 4 : 0;
      const rightX = length > .001 ? -dz / length : 0;
      const rightZ = length > .001 ? dx / length : 0;
      const biased = { x: point.x + rightX * lane, y: 0, z: point.z + rightZ * lane };
      const nearBuilding = buildingBounds().some(bounds => (
        biased.x >= bounds.minX - buildingClearance && biased.x <= bounds.maxX + buildingClearance
        && biased.z >= bounds.minZ - buildingClearance && biased.z <= bounds.maxZ + buildingClearance
      ));
      points.push(nearBuilding ? { ...point, y: 0 } : biased);
      cursor = point;
    }
    return { points, index: 0, goal };
  }

  function waypoint(vehicle, route) {
    while (route.index < route.points.length - 1 && distance(vehicle, route.points[route.index]) < 5) route.index++;
    const point = route.points[route.index];
    let remaining = distance(vehicle, point);
    for (let i = route.index + 1; i < route.points.length; i++) remaining += distance(route.points[i - 1], route.points[i]);
    return { point, nextPoint: route.points[route.index + 1], remaining };
  }

  return { clearDistance, forwardBlocker, visible, parkingGoal, plan, waypoint,
    clearPath(vehicle, point, margin = 3) { return clearDistance(vehicle, headingTo(vehicle, point), distance(vehicle, point) + margin) > distance(vehicle, point); } };
}
