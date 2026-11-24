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

export function formatBattleRoyaleEndAnnouncement(payload = {}, playerId = null, playerTeam = 0) {
  const winnerTeam = Number(payload?.winnerTeam) || 0;
  const ownTeam = Number(playerTeam) || 0;
  const winnerIds = Array.isArray(payload?.winnerIds) ? payload.winnerIds : [];
  const playerWon = Boolean(
    (playerId && payload?.winnerId === playerId)
    || (playerId && winnerIds.includes(playerId))
    || (winnerTeam > 0 && ownTeam > 0 && winnerTeam === ownTeam),
  );
  if (!playerWon) return "Королевская битва завершена";
  if (payload?.squadVictory) return "Победа. Ваш отряд победил";
  return "Победа. Вы последний выживший";
}

function customPlayerName(name) {
  const clean = String(name ?? "").trim();
  if (!clean || clean.toLowerCase() === "игрок") return null;
  return clean;
}

function humanNominative(name) {
  const custom = customPlayerName(name);
  return custom ? `игрок ${custom}` : "живой игрок";
}

function humanAccusative(name) {
  const custom = customPlayerName(name);
  return custom ? `игрока ${custom}` : "живого игрока";
}

function humanGenitive(name) {
  const custom = customPlayerName(name);
  return custom ? `игрока ${custom}` : "живого игрока";
}

function capitalizeFirst(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
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
  let lastArmorReserveCapacity = null;
  let mode = "tdm";
  let lastLocation = null;
  let lastSpectatorTargetId = null;
  let lastSelf = null;
  let lastZone = null;
  let lastZoneWarningAt = 0;
  let lastBunkerPrompt = null;
  const lastBotKillfeedByKiller = new Map();

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
    lastArmorReserveCapacity = null;
    lastLocation = null;
    lastSelf = null;
    lastZone = null;
    lastZoneWarningAt = 0;
    if (network.tutorial) return;
    if (mode === "battle-royale") {
      announce(
        resumed
          ? "Королевская битва продолжена"
          : "Королевская битва. Подготовка к высадке. Стрелки — движение. Shift — бег. X — огонь. R — ручная перезарядка, пустой магазин перезаряжается сам. B — установить доступные бронепластины, можно двигаться. E — открыть дверь или ящик. Удерживайте Z и нажимайте стрелки влево или вправо для смены оружия.",
        { interrupt: true },
      );
      return;
    }
    announce(`Вы в команде ${team}. Командный бой начался.`, { interrupt: true });
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    if (network.tutorial) return;
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (!self) return;
    lastSelf = self;
    lastZone = snapshot?.match?.zone ?? lastZone;
    mode = snapshot.mode === "battle-royale" ? "battle-royale" : mode;
    if (self.armorPlates != null && lastArmorPlates == null) lastArmorPlates = Number(self.armorPlates);
    if (self.armorReserve != null && lastArmorReserve == null) lastArmorReserve = Number(self.armorReserve);
    if (self.armorReserveMax != null && lastArmorReserveCapacity == null) {
      lastArmorReserveCapacity = Number(self.armorReserveMax);
    }
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
        const currentLower = String(observed.location).toLowerCase();
        const previousLower = String(previous).toLowerCase();
        const stairTransition = currentLower.includes("лестниц") || previousLower.includes("лестниц");
        const important = stairTransition
          || observed.location.startsWith("Склад")
          || previous.startsWith("Склад");
        if (important) {
          announce(observed.location, {
            interrupt: stairTransition,
            repeat: true,
          });
        }
      }
    }
    const bunkerPrompt = snapshot?.specialOps?.nearbyBunkerPrompt ?? null;
    if (bunkerPrompt && bunkerPrompt !== lastBunkerPrompt) {
      lastBunkerPrompt = bunkerPrompt;
      announce(bunkerPrompt, { interrupt: true, repeat: true });
    } else if (!bunkerPrompt) {
      lastBunkerPrompt = null;
    }
  });

  ctx.events.on("game:event", (packet) => {
    if (network.tutorial) return;
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
      if (Number.isFinite(reserve)) lastArmorReserve = reserve;
      if (Number.isFinite(capacity)) lastArmorReserveCapacity = capacity;
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
      if (payload.key === "enemy.killed") {
        if (payload.squadKill) {
          if (payload.targetIsHuman) {
            announce(`Напарник уничтожил ${humanAccusative(payload.targetName)}`, { interrupt: true, repeat: true });
          } else if (payload.targetElectro) {
            announce("Напарник уничтожил Электрического Лукашенко", { interrupt: true, repeat: true });
          } else {
            announce("Напарник уничтожил противника", { interrupt: false, repeat: true });
          }
        } else if (payload.targetIsHuman) {
          announce(`Уничтожен ${humanNominative(payload.targetName)}`, { interrupt: true, repeat: true });
        } else if (payload.targetElectro) {
          announce("Электрический Лукашенко уничтожен", { interrupt: true, repeat: true });
        } else {
          announce("Противник уничтожен", { interrupt: true, repeat: true });
        }
      }
      if (payload.key === "death.full" && mode !== "battle-royale") {
        if (payload.attackerIsHuman && payload.attackerId !== network.playerId) {
          announce(`Вас уничтожил ${humanNominative(payload.attackerName)}. Возрождение через три секунды`, { interrupt: true, repeat: true });
        } else {
          announce("Вы погибли. Возрождение через три секунды", { interrupt: true, repeat: true });
        }
      }
      if (payload.key === "armor.break") {
        if (payload.targetIsHuman) {
          announce(`Броня ${humanGenitive(payload.targetName)} разбита`, { interrupt: true, repeat: true });
        } else {
          announce("Броня противника разбита", { interrupt: true, repeat: true });
        }
      }
      if (payload.key === "armor.self-break") announce("Ваша броня разбита", { interrupt: true, repeat: true });
    }

    if (packet.event === "combat:killfeed") {
      if (payload.killerId === network.playerId || payload.victimId === network.playerId) {
        return;
      }
      if (payload.victimIsHuman) {
        const victimLabel = capitalizeFirst(humanNominative(payload.victimName));
        if (payload.weaponId === "zone") {
          announce(`${victimLabel} погиб в зоне`, { interrupt: false, repeat: true });
        } else if (payload.killerIsHuman) {
          announce(
            `${capitalizeFirst(humanNominative(payload.killerName))} уничтожил ${humanAccusative(payload.victimName)}`,
            { interrupt: false, repeat: true },
          );
        } else {
          announce(
            mode === "battle-royale" ? `${victimLabel} выбыл` : `${victimLabel} уничтожен ботом`,
            { interrupt: false, repeat: true },
          );
        }
        return;
      }
      if (payload.killerIsHuman) {
        const now = Date.now();
        const key = String(payload.killerId || payload.killerName || "human");
        const throttleMs = mode === "battle-royale" ? 6000 : 2500;
        const lastAt = lastBotKillfeedByKiller.get(key) ?? 0;
        if (now - lastAt >= throttleMs) {
          lastBotKillfeedByKiller.set(key, now);
          const victimText = payload.victimElectro ? "Электрического Лукашенко" : "противника";
          announce(
            `${capitalizeFirst(humanNominative(payload.killerName))} уничтожил ${victimText}`,
            { interrupt: false, repeat: true },
          );
        }
      }
      return;
    }

    if (packet.event === "entity:respawned" && payload.entityId === network.playerId && mode !== "battle-royale") {
      lastArmorPlates = null;
      lastArmorReserve = null;
      lastArmorReserveCapacity = null;
      announce("Вы снова в бою", { interrupt: true });
    }

    if (packet.event === "weapon:selected" && payload.entityId === network.playerId) {
      const names = {
        rifle: "Автомат",
        "electro-rifle": "Электрический автомат-шокер",
        marksman: "Винтовка",
        sniper: "Снайперка",
        pistol: "Пистолет",
      };
      announce(names[payload.weaponId] ?? "Пистолет", { interrupt: true });
    }

    if (
      packet.event === "weapon:unlocked"
      && payload.entityId === network.playerId
      && (payload.weaponId === "rifle" || payload.weaponId === "electro-rifle" || payload.weaponId === "marksman" || payload.weaponId === "sniper")
    ) {
      const unlockNames = {
        rifle: mode === "battle-royale" ? "Подобран автомат" : "Открыт автомат",
        "electro-rifle": "Получен электрический автомат-шокер",
        marksman: mode === "battle-royale" ? "Получена винтовка" : "Открыта винтовка",
        sniper: mode === "battle-royale" ? "Получена снайперка" : "Открыта снайперка",
      };
      announce(unlockNames[payload.weaponId], { interrupt: false });
    }

    if (mode === "battle-royale") {
      if (packet.event === "battle-royale:deployment") announce("Высадка начинается", { interrupt: true });
      if (packet.event === "battle-royale:started") announce("Падение началось", { interrupt: true });
      if (packet.event === "battle-royale:remaining") announce(`Осталось ${payload.alive} игроков`, { interrupt: false, repeat: true });
      if (packet.event === "battle-royale:eliminated" && payload.entityId === network.playerId) {
        const placement = Number(payload.placement);
        const killerNote = payload.killerIsHuman && payload.killerId !== network.playerId
          ? ` Вас уничтожил ${humanNominative(payload.killerName)}.`
          : "";
        const placementText = Number.isFinite(placement) ? `Вы выбыли.${killerNote} ${placement}-е место` : `Вы выбыли.${killerNote}`;
        announce(`${placementText}. Можно наблюдать за напарниками или нажать кнопку Начать новый матч`, { interrupt: true, repeat: true });
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
        if (payload.loot === "rifle" || payload.loot === "marksman" || payload.loot === "sniper") {
          const restockLabels = {
            rifle: "автомату",
            marksman: "винтовке",
            sniper: "снайперке",
          };
          const pickedLabels = {
            rifle: "Автомат подобран",
            marksman: "Винтовка подобрана",
            sniper: "Снайперка подобрана",
          };
          const fullLabels = {
            rifle: "Боезапас автомата полон",
            marksman: "Боезапас винтовки полон",
            sniper: "Боезапас снайперки полон",
          };
          if (payload.restocked) {
            announce(`Патроны к ${restockLabels[payload.loot]}: ${Math.max(0, Number(payload.quantity) || 0)}`, { interrupt: false });
          } else {
            announce(payload.applied ? pickedLabels[payload.loot] : fullLabels[payload.loot], { interrupt: false });
          }
        }
        if (payload.loot === "armor") {
          if (!payload.applied) {
            announce("Запас бронепластин полон", { interrupt: false, repeat: true });
          } else {
            const quantity = Math.max(0, Number(payload.quantity) || 0);
            const reserve = Number(lastArmorReserve);
            const capacity = Number(lastArmorReserveCapacity);
            let message = `Бронепластины: плюс ${quantity}`;
            if (Number.isFinite(reserve)) {
              message += Number.isFinite(capacity)
                ? `. В запасе ${reserve} из ${capacity}`
                : `. В запасе ${reserve}`;
            }
            // Pickup is a direct user action. Non-interrupting speech is dropped
            // whenever another phrase is playing, which made these counts vanish.
            announce(message, { interrupt: true, repeat: true });
          }
        }
        if (payload.loot === "drop-pack" && payload.dropItem) {
          const qty = Math.max(0, Number(payload.quantity) || Number(payload.dropItem.quantity) || 0);
          const label = payload.dropItem.label || "Предмет";
          announce(
            payload.applied ? `Подобрано: ${label}, ${qty} шт.` : `Не удалось подобрать: ${label}`,
            { interrupt: true, repeat: true },
          );
        }
      }
      if (packet.event === "tactics:stance-changed" && payload.entityId === network.playerId) {
        if (payload.crouching) {
          const text = payload.inCover && payload.coverLabel
            ? `Присел ${payload.coverLabel}. Можно стрелять из укрытия`
            : "Присел";
          announce(text, { interrupt: true, repeat: true });
        } else if (payload.reason !== "jump") {
          announce("Встал", { interrupt: true, repeat: true });
        }
      }
      if (packet.event === "tactics:cover-blocked" && payload.targetId === network.playerId && payload.inCover) {
        const now = Date.now();
        if (now - lastZoneWarningAt >= 1400) {
          lastZoneWarningAt = now;
          announce("Укрытие приняло выстрел", { interrupt: false, repeat: true });
        }
      }
      if (packet.event === "tactics:squad-order" && payload.leaderId === network.playerId && payload.speech) {
        announce(payload.speech, { interrupt: true, repeat: true });
      }
      if ((packet.event === "inventory:dropped" || packet.event === "inventory:transferred" || packet.event === "inventory:failed")
        && payload.entityId === network.playerId && payload.speech) {
        announce(payload.speech, { interrupt: true, repeat: true });
      }
      if (packet.event === "special:electro-equipped") {
        if (payload.entityId === network.playerId) {
          announce(
            "Костюм «Электрический Лукашенко» надет! 800 здоровья, 800 брони, встроенный стимулятор, электрический автомат-шокер и мини-ядерка!",
            { interrupt: true, repeat: true },
          );
        } else {
          announce(
            `Внимание! ${payload.name || "Противник"} надел костюм «Электрический Лукашенко»!`,
            { interrupt: true, repeat: true },
          );
        }
      }
      if (packet.event === "special:electro-mode-changed" && payload.entityId === network.playerId) {
        announce(`Режим электро-автомата: ${payload.modeLabel || payload.shortLabel}`, { interrupt: true, repeat: true });
      }
      if (packet.event === "special:electro-jump") {
        const isSelf = payload.entityId === network.playerId;
        if (isSelf) {
          if (payload.phase === "launch") {
            announce("Взлёт вверх и разгон вперёд! Держи квадрат до 15 секунд — наберёшь до 600 метров. Отпусти в любой момент, чтобы начать падать.", { interrupt: true, repeat: true });
          } else if (payload.phase === "altitude") {
            const alt = Math.round(Number(payload.altitude) || 0);
            announce(payload.ceiling ? `Высота ${alt} метров, потолок!` : `Высота ${alt} метров.`, { interrupt: false, repeat: true });
          } else if (payload.phase === "boost-resume") {
            announce("Дополнительная тяга вверх!", { interrupt: true, repeat: true });
          } else if (payload.phase === "glide") {
            if (payload.fuelExhausted) {
              announce("15 секунд полёта вышли, падение! Крестик — парашют, квадрат — удар вниз.", { interrupt: true, repeat: true });
            } else {
              announce("Падение! Крестик — парашют, держи квадрат — вверх, короткий квадрат — удар вниз.", { interrupt: true, repeat: true });
            }
          } else if (payload.phase === "parachute") {
            announce("Парашют раскрыт прямо из полёта!", { interrupt: true, repeat: true });
          } else if (payload.phase === "land") {
            announce("Мягкое приземление после полёта.", { interrupt: true, repeat: true });
          } else if (payload.phase === "dive") {
            announce("Удар вниз!", { interrupt: true, repeat: true });
          } else if (payload.phase === "slam") {
            announce(`Электрический взрыв вокруг! Поражено целей: ${payload.hitCount ?? 0}.`, { interrupt: true, repeat: true });
          }
        } else if (payload.phase === "launch") {
          announce(`Внимание! Вражеский ${payload.name || "Электрический Лукашенко"} взлетает на суперпрыжок!`, { interrupt: true, repeat: true });
        } else if (payload.phase === "slam") {
          announce(`Грохот! Вражеский ${payload.name || "Электрический Лукашенко"} ударил в землю!`, { interrupt: false, repeat: true });
        }
      }
      if (packet.event === "special:rival-buyback") {
        announce(`Внимание! Вражеский отряд выкупил напарника в магазине «${payload.shopName || "Магазин"}»!`, { interrupt: false, repeat: true });
      }
      if ((packet.event === "special:internal-stim" || packet.event === "special:info") && payload.entityId === network.playerId && payload.text) {
        announce(payload.text, { interrupt: true, repeat: true });
      }
      if ((packet.event === "bunker:transition" || packet.event === "bunker:info") && payload.entityId === network.playerId && payload.text) {
        announce(payload.text, { interrupt: true, repeat: true });
      }
      if (packet.event === "mine:planted" && payload.entityId === network.playerId) {
        announce(`Мина установлена. Активация меньше чем за секунду — взорвётся от врага или выстрела. Осталось мин: ${payload.remaining ?? 0}.`, { interrupt: true, repeat: true });
      }
      if (packet.event === "mine:failed" && payload.entityId === network.playerId && payload.text) {
        announce(payload.text, { interrupt: true, repeat: true });
      }
      if (packet.event === "mine:detonated" && payload.ownerId === network.playerId) {
        announce(`Сработала твоя мина! Задето целей: ${payload.hitCount ?? 0}.`, { interrupt: true, repeat: true });
      }
      if ((packet.event === "nuke:aiming" || packet.event === "nuke:failed" || packet.event === "nuke:cancelled") && payload.entityId === network.playerId && payload.text) {
        announce(payload.text, { interrupt: true, repeat: true });
      }
      if (packet.event === "nuke:launched") {
        if (payload.entityId === network.playerId && payload.text) {
          announce(payload.text, { interrupt: true, repeat: true });
        } else {
          announce(`Тревога! ${payload.ownerName || "Противник"} запустил мини-ядерку с радиусом 86 метров!`, { interrupt: true, repeat: true });
        }
      }
      if (packet.event === "nuke:detonated" && payload.ownerId === network.playerId) {
        announce(`Взрыв мини-ядерки на 86 метров! Поражено целей: ${payload.hitCount ?? 0}.`, { interrupt: true, repeat: true });
      }
      if (packet.event === "crate:airdrop-incoming" && payload.electroLukashenko) {
        announce("Сброшен особый груз «Электрический Лукашенко»! Враги уже стягиваются к нему!", { interrupt: true, repeat: true });
      }
      if (packet.event === "crate:airdrop-landed" && payload.electroLukashenko) {
        announce("Груз «Электрический Лукашенко» приземлился!", { interrupt: true, repeat: true });
      }
      if (packet.event === "battle-royale:ended") {
        const effectiveTeam = Number(lastSelf?.team) || Number(team) || 0;
        announce(formatBattleRoyaleEndAnnouncement(payload, network.playerId, effectiveTeam), { interrupt: true });
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
      if (network.tutorial) return;
      const unlock = Number(payload.roundNumber) === 1 ? " Автомат открыт." : "";
      if (payload.winner === 0) announce(`Раунд завершён вничью.${unlock} Новый раунд через пять секунд`, { interrupt: true });
      else if (payload.winner === team) announce(`Победа.${unlock} Новый раунд через пять секунд`, { interrupt: true });
      else announce(`Поражение.${unlock} Новый раунд через пять секунд`, { interrupt: true });
    }
    if (packet.event === "match:started" && !network.tutorial) {
      announce(`Раунд ${payload.roundNumber ?? ""}. В бой`, { interrupt: true });
    }
  });
}
