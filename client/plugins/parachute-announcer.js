export const manifest = {
  id: "parachute-announcer",
  requires: ["cloudflare-session", "speech-settings"],
};

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  let mode = "tdm";
  let lastWarningAt = 0;

  function say(text, { interrupt = true } = {}) {
    if (!text) return;
    speech.say(text, { interrupt });
    if (!live || speech.enabled) return;
    live.textContent = "";
    requestAnimationFrame(() => { live.textContent = text; });
  }

  ctx.events.on("network:welcome", ({ mode: joinedMode }) => {
    mode = joinedMode === "battle-royale" ? "battle-royale" : "tdm";
  });

  ctx.events.on("game:event", (packet) => {
    if (mode !== "battle-royale") return;
    const payload = packet?.payload ?? {};

    if (packet.event === "battle-royale:started") {
      say("Падение началось. Высота пятьсот метров. Пробел — парашют. H — высота и скорость.");
      return;
    }

    if (payload.entityId !== network.playerId) return;

    if (packet.event === "parachute:landing-approach") {
      say("Посадочный заход", { interrupt: false });
      return;
    }

    if (packet.event === "parachute:stall") {
      say("Сваливание купола. Отпустите тормоз.");
      return;
    }

    if (packet.event === "parachute:stall-recovered") {
      say("Купол восстановился", { interrupt: false });
      return;
    }

    if (packet.event === "parachute:deploy-blocked") {
      say("Недостаточно места для раскрытия купола");
      return;
    }

    if (packet.event === "parachute:canopy-compressed") {
      const now = performance.now();
      if (now - lastWarningAt < 900 || Number(payload.compression) < 0.55) return;
      lastWarningAt = now;
      say(payload.indoor ? "Купол упирается в помещение" : "Купол задевает препятствие", { interrupt: false });
      return;
    }

    if (packet.event === "parachute:canopy-collapse") {
      say("Купол схлопнулся");
      return;
    }

    if (packet.event === "parachute:landed") {
      const speed = Math.max(0, Number(payload.impactSpeed) || 0);
      const damage = Math.max(0, Number(payload.damage) || 0);
      if (payload.killed) {
        say(`Удар о поверхность. Скорость ${speed.toFixed(1)} метра в секунду. Смертельное падение.`);
      } else if (damage > 0) {
        say(`Высадка завершена. Удар ${speed.toFixed(1)} метра в секунду. Получено ${Math.round(damage)} урона.`);
      } else {
        say(`Высадка завершена. Посадка ${speed.toFixed(1)} метра в секунду.`);
      }
    }
  });
}
