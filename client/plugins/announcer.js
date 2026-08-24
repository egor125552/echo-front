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
  let mode = "tdm";
  let lastLocation = null;
  let lastSpectatorTargetId = null;

  function updateLiveMode() {
    live?.setAttribute("aria-live", speech.enabled ? "off" : "assertive");
  }

  function announce(text, { interrupt = false, repeat = false } = {}) {
    if (!text || (!repeat && text === lastMessage)) return;
    lastMessage = text;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    speech.say(text, { interrupt });
  }

  ctx.events.on("speech:settings-changed", updateLiveMode);
  updateLiveMode();

  ctx.events.on("network:welcome", ({ team: joinedTeam, mode: joinedMode, resumed }) => {
    team = joinedTeam;
    mode = joinedMode === "battle-royale" ? "battle-royale" : "tdm";
    lastArmorPlates = null;
    lastLocation = null;
    if (mode === "battle-royale") {
      announce(
        resumed
          ? "Королевская битва продолжена"
          : "Королевская битва. Подготовка к высадке. Стрелки — движение. Shift — бег. X — огонь. R — перезарядка. B — бронепластина. E — открыть дверь или ящик. Удерживайте Z и нажимайте стрелки влево или вправо для смены оружия.",
        { interrupt: true },
      );
      return;
    }
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
    if (!self) return;
    mode = snapshot.mode === "battle-royale" ? "battle-royale" : mode;
    if (self.armorPlates != null && lastArmorPlates == null) lastArmorPlates = Number(self.armorPlates);
    const spectator = snapshot?.spectator;
    const observedId = spectator?.active ? spectator.targetId : network.playerId;
    const observed = snapshot?.entities?.find((entity) => entity.id === observedId) ?? self;
    if (spectator?.active && spectator.targetId && spectator.targetId !== lastSpectatorTargetId) {
      lastSpectatorTargetId = spectator.targetId;
      announce(`Наблюдение за ${spectator.targetName || "оставшимся игроком"}`, { interrupt: false, repeat: true });
    } else if (!spectator?.active) {
      lastSpectatorTargetId = null;
    }
    if (mode === "battle-royale" && observed.location) {
      if (lastLocation == null) lastLocation = observed.location;
      else if (observed.location !== lastLocation) {
        const previous = lastLocation;
        lastLocation = observed.location;
        const important = observed.location.startsWith("Склад") || previous.startsWith("Склад");
        if (important) announce(observed.location, { interrupt: false, repeat: true });
      }
    }
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};

    if (packet.event === "movement:blocked" && payload.recipientId === network.playerId) {
      announce(payload.kind === "world-boundary" ? "Здесь пройти нельзя. Граница мира" : "Здесь пройти нельзя. Стена", {
        interrupt: true,
        repeat: true,
      });
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
      if (payload.key === "death.full" && mode !== "battle-royale") {
        announce("Вы погибли. Возрождение через три секунды", { interrupt: true });
      }
      if (payload.key === "armor.break") announce("Броня противника разбита", { interrupt: true });
      if (payload.key === "armor.self-break") announce("Ваша броня разбита", { interrupt: true });
    }

    if (packet.event === "entity:respawned" && payload.entityId === network.playerId && mode !== "battle-royale") {
      lastArmorPlates = null;
      announce("Вы снова в бою", { interrupt: true });
    }

    if (packet.event === "weapon:selected" && payload.entityId === network.playerId) {
      announce(payload.weaponId === "rifle" ? "Автомат" : "Пистолет", { interrupt: true });
    }

    if (packet.event === "weapon:unlocked" && payload.entityId === network.playerId && payload.weaponId === "rifle") {
      announce(mode === "battle-royale" ? "Подобран автомат" : "Открыт автомат", { interrupt: false });
    }

    if (mode === "battle-royale") {
      if (packet.event === "battle-royale:deployment") announce("Высадка начинается", { interrupt: true });
      if (packet.event === "battle-royale:started") announce("Высадка завершена. В бой", { interrupt: true });
      if (packet.event === "battle-royale:remaining") announce(`Осталось ${payload.alive} игроков`, { interrupt: false, repeat: true });
      if (packet.event === "battle-royale:eliminated" && payload.entityId === network.playerId) {
        const placement = Number(payload.placement);
        announce(Number.isFinite(placement) ? `Вы выбыли. ${placement}-е место` : "Вы выбыли", { interrupt: true, repeat: true });
      }
      if (packet.event === "battle-royale:zone-damage" && payload.entityId === network.playerId) {
        announce("Вы за пределами безопасной зоны", { interrupt: true, repeat: true });
      }
      if (packet.event === "world:door" && payload.entityId === network.playerId) {
        announce(payload.open ? "Дверь открыта" : "Дверь закрыта", { interrupt: false, repeat: true });
      }
      if (packet.event === "loot:picked" && payload.entityId === network.playerId) {
        if (payload.loot === "rifle") announce(payload.applied ? "Автомат подобран" : "Автомат уже есть", { interrupt: false });
        if (payload.loot === "armor") announce(payload.applied ? "Бронепластина подобрана" : "Броня уже полная", { interrupt: false });
      }
      if (packet.event === "battle-royale:ended") {
        announce(payload.winnerId === network.playerId ? "Победа. Вы последний выживший" : "Королевская битва завершена", { interrupt: true });
      }
      return;
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
    if (packet.event === "match:started") announce(`Раунд ${payload.roundNumber ?? ""}. В бой`, { interrupt: true });
  });
}
