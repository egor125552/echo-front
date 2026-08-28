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

  function announce(text, interrupt = false) {
    if (!text) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    // Important announcements are latest-wins; speech-settings never builds a queue.
    speech.say(text, { interrupt });
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

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.mode !== "battle-royale") {
      announcedVehicleId = null;
      announcedDrivingVehicleId = null;
      drivingVehicleName = "машины";
      resetNitroTracking();
      return;
    }
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    const fleet = Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : [];
    if (!self) return;

    const drivenVehicle = fleet.find((vehicle) => vehicle.driverId === network.playerId) ?? null;
    if (drivenVehicle) {
      drivingVehicleName = vehicleName(drivenVehicle);
      announcedVehicleId = drivenVehicle.id;

      // Snapshot fallback: if vehicle:entered was lost, speak from the same fleet
      // state that drives vehicle audio. Event delivery is not required.
      if (announcedDrivingVehicleId !== drivenVehicle.id) {
        announcedDrivingVehicleId = drivenVehicle.id;
        announceEntered(drivingVehicleName);
        resetNitroTracking(drivenVehicle.id);
      }
      followNitroSnapshot(drivenVehicle);
      return;
    }

    if (announcedDrivingVehicleId != null) {
      announcedDrivingVehicleId = null;
      drivingVehicleName = "машины";
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
      resetNitroTracking(eventVehicleId);
      if (!alreadySpoken) announceEntered(drivingVehicleName);
      return;
    }
    if (packet.event === "vehicle:exited" && payload.entityId === network.playerId) {
      const name = String(payload.vehicleName ?? "").trim() || drivingVehicleName;
      announce(`Вы вышли из ${vehicleOutPhrase(name)}`, true);
      announcedDrivingVehicleId = null;
      drivingVehicleName = "машины";
      resetNitroTracking();
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
    resetNitroTracking();
  });
}
