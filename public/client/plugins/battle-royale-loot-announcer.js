export const manifest = {
  id: "battle-royale-loot-announcer",
  requires: ["cloudflare-session", "speech-settings"],
};

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");

  function announce(text, { interrupt = true } = {}) {
    if (!text || network.tutorial) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    speech.say(text, { interrupt });
  }

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};
    if (packet.event === "crate:juggernaut-incoming") {
      announce("Внимание! С неба сбрасывается груз Джаггернаут! Все отряды стягиваются к точке сброса!", { interrupt: false });
      return;
    }
    if (packet.event === "crate:juggernaut-landed") {
      announce("Груз Джаггернаут приземлился! Мощный маяк активен!", { interrupt: false });
      return;
    }
    if (packet.event === "crate:airdrop-incoming") {
      announce("С неба сбрасывается груз снабжения. Точка отмечена на карте.", { interrupt: false });
      return;
    }
    if (packet.event === "crate:airdrop-landed") {
      announce("Груз снабжения приземлился. Звуковой маяк активен.", { interrupt: false });
      return;
    }
    if (packet.event === "loot:picked") {
      if (payload.entityId !== network.playerId) return;
      if (payload.loot === "juggernaut") {
        announce("Комплект Джаггернаута получен! 700 здоровья, 600 брони, полный запас стимуляторов и тяжёлое вооружение!");
        return;
      }
      if (payload.loot === "airdrop") {
        announce("Груз снабжения открыт: бронесумка, пластины, стимуляторы и тяжёлое вооружение.");
        return;
      }
      if (payload.loot === "rifle" || payload.loot === "marksman" || payload.loot === "sniper") {
        const restockLabels = { rifle: "автомату", marksman: "винтовке", sniper: "снайперке" };
        const pickedLabels = { rifle: "Автомат подобран", marksman: "Винтовка подобрана", sniper: "Снайперка подобрана" };
        const fullLabels = { rifle: "Боезапас автомата полон", marksman: "Боезапас винтовки полон", sniper: "Боезапас снайперки полон" };
        if (payload.restocked) {
          announce(`Патроны к ${restockLabels[payload.loot]}: ${Math.max(0, Number(payload.quantity) || 0)}`);
          return;
        }
        announce(payload.applied ? pickedLabels[payload.loot] : fullLabels[payload.loot]);
        return;
      }
      return;
    }

    if (packet.event === "shop:cash-gained" && payload.entityId === network.playerId) {
      const amount = Math.max(0, Number(payload.amount) || 0);
      const balance = Math.max(0, Number(payload.balance) || 0);
      if (amount <= 0) return;
      if (payload.reason === "crate") {
        announce(`Найдено ${amount} долларов. Всего на руках ${balance} долларов.`, { interrupt: false });
      } else if (payload.reason === "juggernaut") {
        announce(`Из груза Джаггернаута получено ${amount} долларов. Всего ${balance} долларов.`, { interrupt: false });
      } else if (payload.reason === "airdrop") {
        announce(`Из груза снабжения получено ${amount} долларов. Всего ${balance} долларов.`, { interrupt: false });
      } else if (payload.reason === "bounty") {
        announce(`Контракт охоты выполнен: плюс ${amount} долларов. Всего ${balance} долларов.`, { interrupt: false });
      } else if (payload.reason === "elimination") {
        announce(`Награда за врага: ${amount} долларов. Всего ${balance} долларов.`, { interrupt: false });
      } else if (payload.reason === "squad-elimination") {
        const mateName = payload.killerName ?? "Напарник";
        announce(`${mateName} уничтожил врага: плюс ${amount} долларов. Всего ${balance} долларов.`, { interrupt: false });
      }
      return;
    }

    if (packet.event === "shop:nearby" && payload.entityId === network.playerId) {
      announce(`Рядом ${payload.shopName}. Нажмите E, чтобы открыть магазин.`, { interrupt: false });
      return;
    }

    if (packet.event === "shop:teammate-bought-back") {
      if (payload.targetId === network.playerId) {
        announce("Напарник выкупил тебя! Высадка на парашюте.");
      } else if (payload.buyerId === network.playerId) {
        announce(`Напарник ${payload.targetName ?? ""} выкуплен и спускается на парашюте.`);
      } else {
        announce(`В отряде выкуплен напарник ${payload.targetName ?? ""}. Высадка на парашюте.`, { interrupt: false });
      }
    }
  });
}
