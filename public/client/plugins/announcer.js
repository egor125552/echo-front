export const manifest = {
  id: "announcer",
  requires: ["cloudflare-session", "speech-settings"],
};

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  let lastMessage = "";
  let team = 0;
  let lastArmorPlates = null;

  function updateLiveMode() {
    live?.setAttribute("aria-live", speech.enabled ? "off" : "assertive");
  }

  function announce(text, { interrupt = false, repeat = false } = {}) {
    if (!text || (!repeat && text === lastMessage)) return;
    lastMessage = text;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => {
        live.textContent = text;
      });
    }
    speech.say(text, { interrupt });
  }

  ctx.events.on("speech:settings-changed", updateLiveMode);
  updateLiveMode();

  ctx.events.on("network:welcome", ({ team: joinedTeam }) => {
    team = joinedTeam;
    lastArmorPlates = null;
    announce(
      `Вы в команде ${team}. Первый раунд учебный. ` +
      "Стрелка вверх — вперёд, вниз — назад, влево — движение влево, вправо — движение вправо. Стрелки можно удерживать и сочетать. Поворот камеры не нужен. " +
      "X — огонь, X можно удерживать. R — перезарядка. B — поставить одну бронепластину. Shift — бег. Удерживайте Z и нажимайте стрелки влево или вправо, чтобы сменить оружие. " +
      "На сенсорном экране доступны отдельные кнопки движения, стопа, огня, бега, перезарядки, бронепластины и смены оружия.",
      { interrupt: true },
    );
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (!self || self.armorPlates == null) return;
    if (lastArmorPlates == null) lastArmorPlates = Number(self.armorPlates);
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};

    if (packet.event === "movement:blocked" && payload.recipientId === network.playerId) {
      const text = payload.kind === "world-boundary"
        ? "Здесь пройти нельзя. Граница мира"
        : "Здесь пройти нельзя. Стена";
      announce(text, { interrupt: true, repeat: true });
      return;
    }

    if (packet.event === "armor:changed" && payload.entityId === network.playerId) {
      const next = Number(payload.platesRemaining);
      if (Number.isFinite(next)) {
        if (lastArmorPlates != null && next < lastArmorPlates) {
          announce(`Осталось ${next} ${next === 1 ? "пластина" : next >= 2 && next <= 4 ? "пластины" : "пластин"}`, {
            interrupt: false,
            repeat: true,
          });
        }
        lastArmorPlates = next;
      }
      return;
    }

    if (packet.event === "armor:plating-completed" && payload.entityId === network.playerId) {
      const next = Number(payload.plateNumber);
      if (Number.isFinite(next)) lastArmorPlates = next;
      return;
    }

    if (packet.event === "feedback:sound" && payload.recipientId === network.playerId) {
      if (payload.key === "enemy.killed") announce("Противник уничтожен", { interrupt: true });
      if (payload.key === "death.full") announce("Вы погибли. Возрождение через три секунды", { interrupt: true });
      if (payload.key === "armor.break") announce("Броня противника разбита", { interrupt: true });
      if (payload.key === "armor.self-break") announce("Ваша броня разбита", { interrupt: true });
    }

    if (packet.event === "entity:respawned" && payload.entityId === network.playerId) {
      lastArmorPlates = null;
      announce("Вы снова в бою", { interrupt: true });
    }

    if (packet.event === "weapon:selected" && payload.entityId === network.playerId) {
      announce(payload.weaponId === "rifle" ? "Автомат" : "Пистолет", { interrupt: true });
    }

    if (packet.event === "weapon:unlocked" && payload.entityId === network.playerId && payload.weaponId === "rifle") {
      announce("Открыт автомат", { interrupt: false });
    }

    if (packet.event === "match:score") {
      const own = Number(payload.score?.[team] ?? 0);
      const enemyTeam = team === 1 ? 2 : 1;
      const enemy = Number(payload.score?.[enemyTeam] ?? 0);
      if (own === 5) announce(`Половина пути. Счёт ${own} ${enemy}`);
      if (own === 9) announce(`Одно убийство до победы. Счёт ${own} ${enemy}`, { interrupt: true });
      if (enemy === 9 && own < 9) announce(`Противнику осталось одно убийство. Счёт ${own} ${enemy}`, { interrupt: true });
    }

    if (packet.event === "match:ended") {
      const unlock = Number(payload.roundNumber) === 1 ? " Автомат открыт. Учебный режим завершён." : "";
      if (payload.winner === 0) announce(`Раунд завершён вничью.${unlock} Новый раунд через пять секунд`, { interrupt: true });
      else if (payload.winner === team) announce(`Победа.${unlock} Новый раунд через пять секунд`, { interrupt: true });
      else announce(`Поражение.${unlock} Новый раунд через пять секунд`, { interrupt: true });
    }

    if (packet.event === "match:started") {
      announce(`Раунд ${payload.roundNumber ?? ""}. В бой`, { interrupt: true });
    }
  });
}
