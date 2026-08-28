export const manifest = {
  id: "battle-royale-vehicle-announcer",
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

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  let announcedVehicleId = null;
  let driving = false;
  let drivingVehicleName = "машины";

  function announce(text, interrupt = false) {
    if (!text) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    speech.say(text, { interrupt });
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.mode !== "battle-royale") {
      announcedVehicleId = null;
      driving = false;
      drivingVehicleName = "машины";
      return;
    }
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    const fleet = Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : [];
    if (!self) return;

    const drivenVehicle = fleet.find((vehicle) => vehicle.driverId === network.playerId) ?? null;
    driving = Boolean(drivenVehicle);
    if (drivenVehicle) {
      drivingVehicleName = vehicleName(drivenVehicle);
      announcedVehicleId = drivenVehicle.id;
      return;
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
      driving = true;
      drivingVehicleName = String(payload.vehicleName ?? "").trim()
        || (payload.vehicleKind === "supercar" ? "суперкар" : "внедорожник");
      announcedVehicleId = payload.vehicleId ?? announcedVehicleId;
      announce(
        `Вы в ${drivingVehicleName === "суперкар" ? "суперкаре" : "внедорожнике"}. Стрелка вверх — газ. Стрелка вниз — тормоз и задний ход. Стрелки влево и вправо — руль. Shift — ручник. Удерживайте X вместе с газом — нитро. E — выйти`,
        true,
      );
      return;
    }
    if (packet.event === "vehicle:exited" && payload.entityId === network.playerId) {
      driving = false;
      const name = String(payload.vehicleName ?? "").trim() || drivingVehicleName;
      announce(`Вы вышли из ${name === "суперкар" ? "суперкара" : "внедорожника"}`, true);
      drivingVehicleName = "машины";
      return;
    }
    if (packet.event === "vehicle:nitro-start" && payload.driverId === network.playerId) {
      announce("Нитро", true);
      return;
    }
    if (packet.event === "vehicle:nitro-stop" && payload.driverId === network.playerId) {
      const seconds = Math.max(1, Math.round(Number(payload.cooldownSeconds) || 10));
      announce(`Нитро перезаряжается. ${seconds} секунд`, false);
      return;
    }
    if (packet.event === "vehicle:nitro-ready" && payload.driverId === network.playerId) {
      announce("Нитро готово", false);
      return;
    }
    if (packet.event === "vehicle:impact" && payload.driverId === network.playerId) {
      const delta = Math.max(0, Number(payload.deltaSpeed) || 0);
      if (delta >= 10) announce("Сильный удар", true);
    }
  });

  ctx.events.on("network:disconnected", () => {
    driving = false;
    announcedVehicleId = null;
    drivingVehicleName = "машины";
  });
}
