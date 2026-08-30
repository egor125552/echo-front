export const ZONE_WARNING_INTERVAL_MS = 3000;

export function zoneDirectionLabel(self, zone) {
  if (!self || !zone) return null;
  const dx = (Number(zone.x) || 0) - (Number(self.x) || 0);
  const dz = (Number(zone.z) || 0) - (Number(self.z) || 0);
  if (Math.hypot(dx, dz) < 0.1) return "впереди";
  const angle = Number(self.angle) || 0;
  const forward = dx * Math.sin(angle) + dz * -Math.cos(angle);
  const right = dx * Math.cos(angle) + dz * Math.sin(angle);
  const sector = Math.round(Math.atan2(right, forward) / (Math.PI / 4));
  if (sector === 0) return "впереди";
  if (sector === 1) return "впереди справа";
  if (sector === 2) return "справа";
  if (sector === 3) return "сзади справа";
  if (Math.abs(sector) === 4) return "сзади";
  if (sector === -3) return "сзади слева";
  if (sector === -2) return "слева";
  return "впереди слева";
}

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
  let lastArmorReserve = null;
  let mode = "tdm";
  let lastLocation = null;
  let lastSpectatorTargetId = null;
  let lastSelf = null;
  let lastZone = null;
  let lastZoneWarningAt = 0;

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
    lastArmorReserve = null;
    lastLocation = null;
    lastSelf = null;
    lastZone = null;
    lastZoneWarningAt = 0;
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
    lastSelf = self;
    lastZone = snapshot?.match?.zone ?? lastZone;
    mode = snapshot.mode === "battle-royale" ? "battle-royale" : mode;
    if (self.armorPlates != null && lastArmorPlates == null) lastArmorPlates = Number(self.armorPlates);
    if (self.armorReserve != null && lastArmorReserve == null) lastArmorReserve = Number(self.armorReserve);
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
      announce(
        payload.speech
          || (payload.kind === "world-boundary" ? "Здесь пройти нельзя. Граница мира" : "Здесь пройти нельзя. Стена"),
        {
          interrupt: true,
          repeat: true,
        },
      );
      return;
    }

    if (packet.event === "armor:changed" && payload.entityId === network.playerId) {
      const next = Number(payload.platesRemaining);
      const reserve = Number(payload.reservePlates);
      const capacity = Number(payload.reserveCapacity);
      if (Number.isFinite(reserve)) {
        if (lastArmorReserve != null && reserve > lastArmorReserve) {
          announce(
            Number.isFinite(capacity)
              ? `Бронепластина подобрана. В запасе ${reserve} из ${capacity}`
              : `Бронепластина подобрана. В запасе ${reserve}`,
            { interrupt: false, repeat: true },
          );
        }
        lastArmorReserve = reserve;
      }
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
      const reserve = Number(payload.reservePlates);
      if (Number.isFinite(next)) lastArmorPlates = next;
      if (Number.isFinite(reserve)) lastArmorReserve = reserve;
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
      lastArmorReserve = null;
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
      if (packet.event === "battle-royale:started") announce("Падение началось", { interrupt: true });
      if (packet.event === "battle-royale:remaining") announce(`Осталось ${payload.alive} игроков`, { interrupt: false, repeat: true });
      if (packet.event === "battle-royale:eliminated" && payload.entityId === network.playerId) {
        const placement = Number(payload.placement);
        announce(Number.isFinite(placement) ? `Вы выбыли. ${placement}-е место` : "Вы выбыли", { interrupt: true, repeat: true });
      }
      if (packet.event === "battle-royale:zone-damage" && payload.entityId === network.playerId) {
        const now = Date.now();
        if (now - lastZoneWarningAt >= ZONE_WARNING_INTERVAL_MS) {
          lastZoneWarningAt = now;
          const direction = zoneDirectionLabel(lastSelf, lastZone);
          const outside = Math.max(0, Number(payload.distance) - Number(payload.radius));
          const metres = Math.max(1, Math.ceil(Number.isFinite(outside) ? outside : 0));
          announce(
            direction
              ? `Вы за пределами безопасной зоны. Зона ${direction}. До границы примерно ${metres} м`
              : "Вы за пределами безопасной зоны",
            { interrupt: true, repeat: true },
          );
        }
      }
      if (packet.event === "world:door" && payload.entityId === network.playerId) {
        announce(payload.open ? "Дверь открыта" : "Дверь закрыта", { interrupt: false, repeat: true });
      }
      if (packet.event === "loot:picked" && payload.entityId === network.playerId) {
        if (payload.loot === "rifle") {
          if (payload.restocked) announce(`Патроны к автомату: ${Math.max(0, Number(payload.quantity) || 0)}`, { interrupt: false });
          else announce(payload.applied ? "Автомат подобран" : "Боезапас автомата полон", { interrupt: false });
        }
        if (payload.loot === "armor" && !payload.applied) announce("Запас бронепластин полон", { interrupt: false });
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
