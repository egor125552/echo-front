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

  ctx.events.on("network:connected", () => { connection.textContent = "Соединение установлено"; });
  ctx.events.on("network:disconnected", ({ willReconnect } = {}) => {
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
    if (mode) mode.textContent = isBr ? "Королевская битва" : "Командный бой";
    team.textContent = isBr ? "каждый сам за себя" : String(self.team || "-");
    score.textContent = isBr
      ? "без командного счёта"
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
    weapon.textContent = self.weapon === "rifle" ? "Автомат" : self.weapon === "pistol" ? "Пистолет" : "-";
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
  });
}
