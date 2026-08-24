export const manifest = {
  id: "game-hud",
  requires: ["cloudflare-session"],
};

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const connection = document.querySelector("#connection-status");
  const team = document.querySelector("#team-value");
  const score = document.querySelector("#score-value");
  const weapon = document.querySelector("#weapon-value");
  const ammo = document.querySelector("#ammo-value");
  const health = document.querySelector("#health-value");
  const armor = document.querySelector("#armor-value");

  ctx.events.on("network:connected", () => {
    connection.textContent = "Соединение установлено";
  });

  ctx.events.on("network:disconnected", ({ willReconnect } = {}) => {
    connection.textContent = willReconnect ? "Соединение потеряно. Переподключение" : "Соединение потеряно";
  });

  ctx.events.on("network:reconnecting", ({ attempt } = {}) => {
    connection.textContent = attempt > 1
      ? `Переподключение к матчу. Попытка ${attempt}`
      : "Переподключение к матчу";
  });

  ctx.events.on("network:reconnected", ({ resumed } = {}) => {
    connection.textContent = resumed ? "Соединение восстановлено. Матч продолжен" : "Соединение восстановлено";
  });

  ctx.events.on("network:error", () => {
    connection.textContent = "Ошибка соединения";
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (!self) return;
    team.textContent = String(self.team || "-");
    score.textContent = `${snapshot.match?.score?.[1] ?? 0} : ${snapshot.match?.score?.[2] ?? 0}`;
    weapon.textContent = self.weapon === "rifle" ? "Автомат" : self.weapon === "pistol" ? "Пистолет" : "-";
    ammo.textContent = self.ammo == null ? "-" : `${self.ammo} / ${self.reserve ?? 0}`;
    health.textContent = self.health == null ? "-" : String(Math.round(self.health));
    armor.textContent = self.armor == null ? "нет" : String(Math.round(self.armor));
  });
}
