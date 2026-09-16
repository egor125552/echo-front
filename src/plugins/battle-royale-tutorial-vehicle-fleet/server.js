export const manifest = {
  id: "battle-royale-vehicle-fleet",
  version: "1.0.0-tutorial",
  requires: [
    "battle-royale-vehicle", "battle-royale-world-expansion",
    "rapier-physics", "movement", "entities", "map-test-arena",
  ],
  capabilities: ["services.consume"],
};

export async function setup(ctx) {
  const vehicles = ctx.services.get("vehicles");
  const primaryId = vehicles.vehicleId;
  const originalSnapshot = vehicles.snapshot.bind(vehicles);
  const originalStateFor = vehicles.stateFor.bind(vehicles);
  const originalSummary = vehicles.summary.bind(vehicles);

  function vehicleForDriver(playerId) {
    return vehicles.isDriving(playerId) ? originalStateFor(primaryId) : null;
  }

  function networkSnapshot() {
    return originalSnapshot();
  }
  Object.assign(vehicles, {
    enterBot(playerId, now = Date.now(), vehicleId = primaryId) {
      if (vehicleId !== primaryId) return false;
      return vehicles.enter(playerId, now);
    },
    vehicleForDriver,
    networkSnapshot,
    isPassenger() { return false; },
    vehicleForPassenger() { return null; },
    enterPassenger() { return false; },
    exitPassenger() { return false; },
    passengerIds() { return []; },
    passengerCapacity: 0,
    fleetLayout: [],
    assertVehicle(vehicleId = primaryId) {
      return { ok: vehicleId === primaryId, vehicle: originalStateFor(vehicleId) };
    },
    assertFleet() {
      return { ok: true, total: originalSnapshot().length, tutorial: true };
    },
    summary() {
      return { ...originalSummary(), tutorialFleet: true, total: originalSnapshot().length };
    },
  });
}
