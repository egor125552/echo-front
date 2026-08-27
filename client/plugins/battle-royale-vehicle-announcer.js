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

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  let nearArmed = true;
  let driving = false;

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
      nearArmed = true;
      driving = false;
      return;
    }
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    const vehicle = snapshot?.vehicles?.[0] ?? null;
    if (!self || !vehicle) return;
    driving = vehicle.driverId === network.playerId;
    if (driving) {
      nearArmed = false;
      return;
    }
    const distance = distance2(self, vehicle);
    if (distance >= REARM_DISTANCE) nearArmed = true;
    if (nearArmed && distance <= NEAR_VEHICLE_DISTANCE) {
      nearArmed = false;
      announce("Внедорожник рядом. E — сесть", false);
    }
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};
    if (packet.event === "vehicle:entered" && payload.entityId === network.playerId) {
      driving = true;
      nearArmed = false;
      announce(
        "Вы в внедорожнике. Стрелка вверх — газ. Стрелка вниз — тормоз и задний ход. Стрелки влево и вправо — руль. Shift — ручник. Удерживайте X вместе с газом — нитро. E — выйти",
        true,
      );
      return;
    }
    if (packet.event === "vehicle:exited" && payload.entityId === network.playerId) {
      driving = false;
      announce("Вы вышли из внедорожника", true);
      return;
    }
    if (packet.event === "vehicle:nitro-start" && payload.driverId === network.playerId) {
      announce("Нитро", true);
      return;
    }
    if (packet.event === "vehicle:nitro-stop" && payload.driverId === network.playerId) {
      announce("Нитро перезаряжается. Десять секунд", false);
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
    nearArmed = true;
  });
}
