export const manifest = {
  id: "battle-royale-navigation-announcer",
  version: "1.0.0",
  requires: ["cloudflare-session", "speech-settings"],
};

function roundedMeters(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  let lastMessage = "";

  function announce(text, { interrupt = true, repeat = false } = {}) {
    if (!text || (!repeat && text === lastMessage)) return;
    lastMessage = text;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    speech.say(text, { interrupt });
  }

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (payload.entityId !== network.playerId) return;

    if (packet.event === "navigation:selected") {
      announce(`${payload.targetName}. ${roundedMeters(payload.distanceMeters ?? payload.distance)} метров. Enter — выбрать.`);
      return;
    }
    if (packet.event === "navigation:started") {
      announce(`${payload.replaced ? "Новая цель" : "Маршрут"}: ${payload.targetName}. ${roundedMeters(payload.distanceMeters ?? payload.distance)} метров.`);
      return;
    }
    if (packet.event === "navigation:stopped") {
      announce("Навигация выключена.");
      return;
    }
    if (packet.event === "navigation:reached") {
      announce(`Цель достигнута: ${payload.targetName}.`);
      return;
    }
    if (packet.event === "navigation:unavailable") {
      announce("Цель навигации недоступна.");
      return;
    }
    if (packet.event === "vehicle:dropzone-placed") {
      const name = payload.vehicleName || "Внедорожник";
      announce(`${name} рядом с местом посадки. ${roundedMeters(payload.distance)} метров.`, { interrupt: false, repeat: true });
    }
  });
}
