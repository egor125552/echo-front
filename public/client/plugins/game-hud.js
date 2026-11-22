export function shouldShowNewMatchButton({ isBr = false, tutorial = false, self = null, spectator = null, match = null } = {}) {
  if (!isBr || tutorial || !self) return false;
  return Boolean(!self.alive || spectator?.active || match?.ended);
}

export const manifest = {
  id: "game-hud",
  requires: ["cloudflare-session"],
};

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const connection = document.querySelector("#connection-status");
  const mode = document.querySelector("#mode-value");
  const team = document.querySelector("#team-value");
  const score = document.querySelector("#score-value");
  const remaining = document.querySelector("#remaining-value");
  const location = document.querySelector("#location-value");
  const zone = document.querySelector("#zone-value");
  const placement = document.querySelector("#placement-value");
  const spectator = document.querySelector("#spectator-value");
  const weapon = document.querySelector("#weapon-value");
  const ammo = document.querySelector("#ammo-value");
  const health = document.querySelector("#health-value");
  const armor = document.querySelector("#armor-value");
  const cash = document.querySelector("#cash-value");
  const shopButton = document.querySelector('[data-touch-action="shop"]');
  const crouchButton = document.querySelector('[data-touch-action="crouch"]');
  const mineButton = document.querySelector('[data-touch-action="mine"]');
  const nukeButton = document.querySelector('[data-touch-action="nuke"]');
  const electroModeButton = document.querySelector('[data-touch-action="electro-mode"]');
  const electroJumpButton = document.querySelector('[data-touch-action="electro-jump"]');
  const gestureCrouchButton = document.querySelector("#gesture-crouch");
  const gestureMineButton = document.querySelector("#gesture-mine");
  const gestureNukeButton = document.querySelector("#gesture-nuke");
  const gestureElectroButton = document.querySelector("#gesture-electro");
  const gestureElectroJumpButton = document.querySelector("#gesture-electro-jump");
  const newMatchButton = document.querySelector("#new-match-button");
  const gestureNewMatchButton = document.querySelector("#gesture-new-match");

  function setNewMatchVisible(visible) {
    const hidden = !visible;
    if (newMatchButton) {
      newMatchButton.hidden = hidden;
      if (!hidden) newMatchButton.disabled = false;
    }
    if (gestureNewMatchButton) {
      gestureNewMatchButton.hidden = hidden;
      if (!hidden) gestureNewMatchButton.disabled = false;
    }
  }

  ctx.events.on("network:connected", () => { connection.textContent = "Соединение установлено"; });
  ctx.events.on("network:welcome", () => { setNewMatchVisible(false); });
  ctx.events.on("network:disconnected", ({ willReconnect } = {}) => {
    setNewMatchVisible(false);
    connection.textContent = willReconnect ? "Соединение потеряно. Переподключение" : "Соединение потеряно";
  });
  ctx.events.on("network:reconnecting", ({ attempt } = {}) => {
    connection.textContent = attempt > 1 ? `Переподключение к матчу. Попытка ${attempt}` : "Переподключение к матчу";
  });
  ctx.events.on("network:reconnected", ({ resumed } = {}) => {
    connection.textContent = resumed ? "Соединение восстановлено. Матч продолжен" : "Соединение восстановлено";
  });
  ctx.events.on("network:error", () => { connection.textContent = "Ошибка соединения"; });

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (!self) return;
    const isBr = snapshot.mode === "battle-royale" || snapshot.match?.mode === "battle-royale";
    const observedId = snapshot?.spectator?.active ? snapshot.spectator.targetId : network.playerId;
    const observed = snapshot?.entities?.find((entity) => entity.id === observedId) ?? self;
    if (mode) {
      mode.textContent = network.tutorial
        ? "Обучение"
        : isBr
          ? "Королевская битва"
          : "Командный бой";
    }
    team.textContent = isBr
      ? (!network.tutorial && Number(self.team) >= 100_000 ? "Ваш отряд" : "каждый сам за себя")
      : String(self.team || "-");
    const personalKills = Math.max(0, Number(self.kills) || 0);
    const squadKills = Math.max(personalKills, Number(self.squadKills) || 0);
    score.textContent = isBr
      ? (squadKills > 0 ? `убийств отряда: ${squadKills} (ваших: ${personalKills})` : "без командного счёта")
      : `${snapshot.match?.score?.[1] ?? 0} : ${snapshot.match?.score?.[2] ?? 0}`;
    if (remaining) remaining.textContent = isBr ? String(snapshot.match?.alive ?? "-") : "-";
    if (location) location.textContent = observed.location ?? "-";
    if (placement) placement.textContent = isBr && snapshot?.playerPlacement ? String(snapshot.playerPlacement) : "-";
    if (spectator) spectator.textContent = snapshot?.spectator?.active ? (snapshot.spectator.targetName ?? "активно") : "нет";
    if (zone) {
      if (isBr && snapshot.match?.zone) {
        const distance = Math.hypot(observed.x ?? 0, observed.z ?? 0);
        const radius = Number(snapshot.match.zone.radius) || 0;
        zone.textContent = `${Math.round(radius)} м, вы ${distance <= radius ? "внутри" : "снаружи"}`;
      } else zone.textContent = "-";
    }
    const WEAPON_LABELS = {
      pistol: "Пистолет",
      rifle: "Автомат",
      "electro-rifle": "Электрический автомат-шокер",
      marksman: "Винтовка",
      sniper: "Снайперка",
    };
    weapon.textContent = WEAPON_LABELS[self.weapon] ?? "-";
    ammo.textContent = self.ammo == null ? "-" : `${self.ammo} / ${self.reserve ?? 0}`;
    health.textContent = self.health == null ? "-" : String(Math.round(self.health));
    if (self.armor == null) armor.textContent = "нет";
    else if (self.armorPlates != null && self.armorPlateMax != null) {
      const plating = self.plating ? ", установка" : "";
      const reserve = self.armorReserve != null && self.armorReserveMax != null
        ? `, запас ${self.armorReserve} из ${self.armorReserveMax}`
        : "";
      const satchel = self.armorSatchel ? ", бронесумка" : "";
      armor.textContent = `${self.armorPlates} из ${self.armorPlateMax} пластин, ${Math.round(self.armor)} брони${reserve}${satchel}${plating}`;
    } else armor.textContent = String(Math.round(self.armor));
    if (cash) cash.textContent = isBr ? `${Math.max(0, Number(self.cash) || 0)} $` : "-";
    if (shopButton) {
      const nearbyShop = snapshot?.shop?.nearbyShop ?? null;
      shopButton.disabled = !isBr || !self.alive || Boolean(self.downed) || !nearbyShop;
      shopButton.textContent = nearbyShop ? `Магазин (${nearbyShop.name})` : "Магазин";
    }
    if (crouchButton) {
      const crouched = Boolean(self.crouching);
      crouchButton.setAttribute("aria-pressed", String(crouched));
      crouchButton.textContent = crouched
        ? (self.inCover && self.coverLabel ? `Встать (${self.coverLabel})` : "Встать (присел)")
        : "Присесть / Укрытие";
    }
    if (gestureCrouchButton) {
      const crouched = Boolean(self.crouching);
      gestureCrouchButton.setAttribute("aria-pressed", String(crouched));
      gestureCrouchButton.textContent = crouched ? "Встать" : "Укрытие";
    }
    const specialOps = snapshot?.specialOps ?? null;
    if (mineButton || gestureMineButton) {
      const mines = Number(specialOps?.mines) || 0;
      const disabled = !isBr || !self.alive || Boolean(self.downed) || mines <= 0;
      if (mineButton) {
        mineButton.disabled = disabled;
        mineButton.textContent = `Поставить мину (${mines})`;
      }
      if (gestureMineButton) {
        gestureMineButton.hidden = !isBr;
        gestureMineButton.disabled = disabled;
        gestureMineButton.textContent = `Мина (${mines})`;
      }
    }
    if (nukeButton || gestureNukeButton) {
      const nukes = Number(specialOps?.miniNukes) || 0;
      const aiming = Boolean(specialOps?.nukeAiming);
      const disabled = !isBr || !self.alive || Boolean(self.downed) || (!aiming && nukes <= 0);
      if (nukeButton) {
        nukeButton.disabled = disabled;
        nukeButton.textContent = aiming
          ? `Запустить ядерку (${specialOps?.nukeDistance?.meters ?? 105} м)!`
          : `Мини-ядерка (${nukes})`;
      }
      if (gestureNukeButton) {
        gestureNukeButton.hidden = !isBr;
        gestureNukeButton.disabled = disabled;
        gestureNukeButton.textContent = aiming
          ? `Запуск (${specialOps?.nukeDistance?.meters ?? 105} м)!`
          : `Ядерка (${nukes})`;
      }
    }
    if (electroModeButton || gestureElectroButton) {
      const hasElectro = Boolean(specialOps?.hasElectroRifle);
      const shortLabel = specialOps?.electroMode?.shortLabel || "Шок";
      if (electroModeButton) {
        electroModeButton.disabled = !isBr || !self.alive || !hasElectro;
        electroModeButton.textContent = hasElectro
          ? `Режим шокера: ${shortLabel}`
          : "Режим шокера";
      }
      if (gestureElectroButton) {
        gestureElectroButton.hidden = !isBr || !hasElectro;
        gestureElectroButton.disabled = !isBr || !self.alive || !hasElectro;
        gestureElectroButton.textContent = `Режим: ${shortLabel}`;
      }
    }
    if (electroJumpButton || gestureElectroJumpButton) {
      const isElectroSuit = Boolean(specialOps?.electroLukashenko);
      const phase = specialOps?.electroJumpPhase || "ready";
      const cdSec = Math.ceil((Number(specialOps?.electroJumpCooldownMs) || 0) / 1000);
      const fuelSec = Math.ceil((Number(specialOps?.electroJumpFuelMs) || 0) / 1000);
      const rising = phase === "rising";
      const gliding = phase === "gliding";
      const diving = phase === "diving";
      const label = rising
        ? `Взлёт (${fuelSec}с)`
        : (gliding
          ? (fuelSec > 0 ? `Удар / Вверх (${fuelSec}с)` : "УДАР ВНИЗ!")
          : (diving ? "Удар..." : (phase === "cooldown" && cdSec > 0 ? `Прыжок (${cdSec}с)` : "Суперпрыжок")));
      const fullLabel = rising
        ? `Полёт вверх (${fuelSec} сек) — отпусти чтобы падать`
        : (gliding
          ? (fuelSec > 0 ? `Падение: Удар вниз / Вверх (${fuelSec}с) / Парашют` : "УДАР ВНИЗ! (или Парашют)")
          : (diving ? "Падение с ударом..." : (phase === "cooldown" && cdSec > 0 ? `Суперпрыжок (${cdSec} сек)` : "Суперпрыжок Лукашенко (15с)")));
      const disabled = !isBr || !self.alive || Boolean(self.downed) || !isElectroSuit || diving || (phase === "cooldown" && cdSec > 0);
      if (electroJumpButton) {
        electroJumpButton.hidden = !isBr || !isElectroSuit;
        electroJumpButton.disabled = disabled;
        electroJumpButton.textContent = fullLabel;
      }
      if (gestureElectroJumpButton) {
        gestureElectroJumpButton.hidden = !isBr || !isElectroSuit;
        gestureElectroJumpButton.disabled = disabled;
        gestureElectroJumpButton.textContent = label;
      }
    }
    setNewMatchVisible(shouldShowNewMatchButton({
      isBr,
      tutorial: network.tutorial,
      self,
      spectator: snapshot?.spectator ?? null,
      match: snapshot?.match ?? null,
    }));
  });
}
