export const manifest = {
  id: "battle-royale-vehicle-announcer",
  version: "1.3.0",
  requires: ["cloudflare-session", "speech-settings"],
};

const NEAR_VEHICLE_DISTANCE = 8;
const REARM_DISTANCE = 11;

function distance2(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function vehicleName(vehicle) {
  if (String(vehicle?.accessibleName ?? "").trim()) return String(vehicle.accessibleName).trim();
  return vehicle?.kind === "supercar" ? "суперкар" : "внедорожник";
}

function vehicleInPhrase(name) {
  return name === "суперкар" ? "суперкаре" : "внедорожнике";
}

function vehicleOutPhrase(name) {
  return name === "суперкар" ? "суперкара" : "внедорожника";
}

function nitroSnapshot(vehicle) {
  const nitro = vehicle?.nitro ?? {};
  const active = Boolean(nitro.active);
  const ready = Boolean(nitro.ready);
  const cooldownRemaining = Math.max(0, Number(
    nitro.cooldownSecondsRemaining
      ?? nitro.cooldownRemaining
      ?? nitro.cooldownSecondsLeft
      ?? 0,
  ) || 0);
  const cooldownSeconds = Math.max(1, Number(nitro.cooldownSeconds) || 10);
  return {
    active,
    ready,
    cooling: !active && !ready && cooldownRemaining > 0.03,
    cooldownRemaining,
    cooldownSeconds,
  };
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  let announcedVehicleId = null;
  let announcedDrivingVehicleId = null;
  let drivingVehicleName = "машины";
  let trackedNitroVehicleId = null;
  let nitroInitialized = false;
  let lastNitroActive = false;
  let lastNitroReady = false;
  let lastNitroCooling = false;
  let knownPassengerIds = new Set();
  const knownEntityNames = new Map();
  const pendingAnnouncements = [];
  let queueTimer = null;

  function announce(text, interrupt = false) {
    if (!text || network.tutorial) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    // Important announcements are latest-wins; speech-settings never builds a queue.
    speech.say(text, { interrupt });
  }

  function flushPendingAnnouncements() {
    if (queueTimer) {
      clearTimeout(queueTimer);
      queueTimer = null;
    }
    if (!pendingAnnouncements.length) return;
    const synthBusy = typeof window !== "undefined"
      && Boolean(window.speechSynthesis?.speaking || window.speechSynthesis?.pending);
    if (synthBusy) {
      queueTimer = setTimeout(flushPendingAnnouncements, 260);
      return;
    }
    const batch = pendingAnnouncements.splice(0, pendingAnnouncements.length);
    const text = batch.join(". ");
    announce(text, false);
  }

  function queuePassengerAnnouncement(text) {
    if (!text || network.tutorial) return;
    pendingAnnouncements.push(text);
    if (!queueTimer) {
      queueTimer = setTimeout(flushPendingAnnouncements, 280);
    }
  }

  function announceEntered(name) {
    announce(
      `Вы в ${vehicleInPhrase(name)}. Стрелка вверх — газ. Стрелка вниз — тормоз и задний ход. Стрелки влево и вправо — руль. Shift — ручник. Удерживайте X вместе с газом — нитро. E — выйти`,
      true,
    );
  }

  function resetNitroTracking(vehicleId = null) {
    trackedNitroVehicleId = vehicleId;
    nitroInitialized = false;
    lastNitroActive = false;
    lastNitroReady = false;
    lastNitroCooling = false;
  }

  function setNitroBaseline(vehicle) {
    const next = nitroSnapshot(vehicle);
    trackedNitroVehicleId = vehicle?.id ?? trackedNitroVehicleId;
    nitroInitialized = true;
    lastNitroActive = next.active;
    lastNitroReady = next.ready;
    lastNitroCooling = next.cooling;
    return next;
  }

  function followNitroSnapshot(vehicle) {
    if (!vehicle) return;
    if (trackedNitroVehicleId !== vehicle.id || !nitroInitialized) {
      setNitroBaseline(vehicle);
      return;
    }

    const next = nitroSnapshot(vehicle);
    if (next.active && !lastNitroActive) {
      announce("Нитро", true);
    } else if (!next.active && lastNitroActive && next.cooling) {
      const seconds = Math.max(1, Math.round(next.cooldownRemaining || next.cooldownSeconds));
      announce(`Нитро перезаряжается. ${seconds} секунд`, true);
    } else if (next.ready && !lastNitroReady && !next.active) {
      announce("Нитро готово", true);
    }

    lastNitroActive = next.active;
    lastNitroReady = next.ready;
    lastNitroCooling = next.cooling;
  }

  function passengerDisplayName(entityId, explicitName = null) {
    const clean = String(explicitName ?? "").trim()
      || String(knownEntityNames.get(entityId) ?? "").trim();
    return clean || "Напарник";
  }

  function syncPassengerDiff(vehicle) {
    const nextIds = new Set(Array.isArray(vehicle?.passengerIds) ? vehicle.passengerIds : []);
    for (const id of nextIds) {
      if (id === network.playerId || knownPassengerIds.has(id)) continue;
      knownPassengerIds.add(id);
      queuePassengerAnnouncement(`${passengerDisplayName(id)} сел в машину`);
    }
    for (const id of [...knownPassengerIds]) {
      if (nextIds.has(id)) continue;
      knownPassengerIds.delete(id);
      if (id !== network.playerId) {
        queuePassengerAnnouncement(`${passengerDisplayName(id)} вышел из машины`);
      }
    }
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.mode !== "battle-royale") {
      announcedVehicleId = null;
      announcedDrivingVehicleId = null;
      drivingVehicleName = "машины";
      knownPassengerIds.clear();
      pendingAnnouncements.length = 0;
      resetNitroTracking();
      return;
    }
    if (Array.isArray(snapshot?.entities)) {
      for (const e of snapshot.entities) {
        if (e?.id && e?.name) knownEntityNames.set(e.id, e.name);
      }
    }
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    const fleet = Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : [];
    if (!self) return;

    const drivenVehicle = fleet.find((vehicle) => (
      vehicle.driverId === network.playerId
      || (Array.isArray(vehicle.passengerIds) && vehicle.passengerIds.includes(network.playerId))
    )) ?? null;
    if (drivenVehicle) {
      drivingVehicleName = vehicleName(drivenVehicle);
      announcedVehicleId = drivenVehicle.id;

      // Snapshot fallback: if vehicle:entered was lost, speak from the same fleet
      // state that drives vehicle audio. Event delivery is not required.
      if (announcedDrivingVehicleId !== drivenVehicle.id) {
        announcedDrivingVehicleId = drivenVehicle.id;
        knownPassengerIds = new Set(Array.isArray(drivenVehicle.passengerIds) ? drivenVehicle.passengerIds : []);
        if (drivenVehicle.driverId === network.playerId) {
          announceEntered(drivingVehicleName);
        }
        resetNitroTracking(drivenVehicle.id);
      } else {
        syncPassengerDiff(drivenVehicle);
      }
      if (drivenVehicle.driverId === network.playerId) {
        followNitroSnapshot(drivenVehicle);
      }
      return;
    }

    if (announcedDrivingVehicleId != null) {
      announcedDrivingVehicleId = null;
      drivingVehicleName = "машины";
      knownPassengerIds.clear();
      resetNitroTracking();
    }

    const nearest = fleet
      .filter((vehicle) => !vehicle.occupied)
      .map((vehicle) => ({ vehicle, distance: distance2(self, vehicle) }))
      .sort((a, b) => a.distance - b.distance)[0] ?? null;

    if (!nearest) {
      announcedVehicleId = null;
      return;
    }
    if (nearest.distance >= REARM_DISTANCE && nearest.vehicle.id === announcedVehicleId) {
      announcedVehicleId = null;
    }
    if (nearest.distance <= NEAR_VEHICLE_DISTANCE && nearest.vehicle.id !== announcedVehicleId) {
      announcedVehicleId = nearest.vehicle.id;
      announce(`${vehicleName(nearest.vehicle)} рядом. E — сесть`, false);
    }
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};
    if (packet.event === "vehicle:entered" && payload.entityId === network.playerId) {
      const eventVehicleId = payload.vehicleId ?? null;
      const alreadySpoken = Boolean(eventVehicleId && announcedDrivingVehicleId === eventVehicleId);
      drivingVehicleName = String(payload.vehicleName ?? "").trim()
        || (payload.vehicleKind === "supercar" ? "суперкар" : "внедорожник");
      announcedVehicleId = eventVehicleId ?? announcedVehicleId;
      announcedDrivingVehicleId = eventVehicleId ?? announcedDrivingVehicleId;
      knownPassengerIds.clear();
      resetNitroTracking(eventVehicleId);
      if (!alreadySpoken) announceEntered(drivingVehicleName);
      return;
    }
    if (packet.event === "vehicle:exited" && payload.entityId === network.playerId) {
      const name = String(payload.vehicleName ?? "").trim() || drivingVehicleName;
      announce(`Вы вышли из ${vehicleOutPhrase(name)}`, true);
      announcedDrivingVehicleId = null;
      drivingVehicleName = "машины";
      knownPassengerIds.clear();
      pendingAnnouncements.length = 0;
      resetNitroTracking();
      return;
    }
    if (packet.event === "vehicle:passenger-entered" && payload.entityId && payload.entityId !== network.playerId) {
      if (payload.driverId === network.playerId || (announcedDrivingVehicleId && payload.vehicleId === announcedDrivingVehicleId)) {
        if (!knownPassengerIds.has(payload.entityId)) {
          knownPassengerIds.add(payload.entityId);
          queuePassengerAnnouncement(`${passengerDisplayName(payload.entityId, payload.entityName)} сел в машину`);
        }
      }
      return;
    }
    if (packet.event === "vehicle:passenger-exited" && payload.entityId && payload.entityId !== network.playerId) {
      if (payload.driverId === network.playerId || (announcedDrivingVehicleId && payload.vehicleId === announcedDrivingVehicleId)) {
        if (knownPassengerIds.delete(payload.entityId) && payload.reason !== "interact") {
          queuePassengerAnnouncement(`${passengerDisplayName(payload.entityId, payload.entityName)} вышел из машины`);
        }
      }
      return;
    }
    if (packet.event === "vehicle:nitro-start" && payload.driverId === network.playerId) {
      const alreadySpoken = nitroInitialized && lastNitroActive;
      nitroInitialized = true;
      lastNitroActive = true;
      lastNitroReady = false;
      lastNitroCooling = false;
      if (!alreadySpoken) announce("Нитро", true);
      return;
    }
    if (packet.event === "vehicle:nitro-stop" && payload.driverId === network.playerId) {
      const alreadySpoken = nitroInitialized && !lastNitroActive && lastNitroCooling;
      nitroInitialized = true;
      lastNitroActive = false;
      lastNitroReady = false;
      lastNitroCooling = true;
      if (!alreadySpoken) {
        const seconds = Math.max(1, Math.round(Number(payload.cooldownSeconds) || 10));
        announce(`Нитро перезаряжается. ${seconds} секунд`, true);
      }
      return;
    }
    if (packet.event === "vehicle:nitro-ready" && payload.driverId === network.playerId) {
      const alreadySpoken = nitroInitialized && lastNitroReady;
      nitroInitialized = true;
      lastNitroActive = false;
      lastNitroReady = true;
      lastNitroCooling = false;
      if (!alreadySpoken) announce("Нитро готово", true);
      return;
    }
    if (packet.event === "vehicle:impact" && payload.driverId === network.playerId) {
      const delta = Math.max(0, Number(payload.deltaSpeed) || 0);
      if (delta >= 10) announce("Сильный удар", true);
    }
  });

  ctx.events.on("network:disconnected", () => {
    announcedVehicleId = null;
    announcedDrivingVehicleId = null;
    drivingVehicleName = "машины";
    knownPassengerIds.clear();
    knownEntityNames.clear();
    pendingAnnouncements.length = 0;
    if (queueTimer) {
      clearTimeout(queueTimer);
      queueTimer = null;
    }
    resetNitroTracking();
  });
}
