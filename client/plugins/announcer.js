export const manifest = {
  id: "announcer",
  requires: ["cloudflare-session"],
};

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const live = document.querySelector("#announcer");
  let lastMessage = "";

  function announce(text) {
    if (!text || text === lastMessage) return;
    lastMessage = text;
    live.textContent = "";
    requestAnimationFrame(() => {
      live.textContent = text;
    });
  }

  ctx.events.on("network:welcome", ({ team }) => announce(`Вы в команде ${team}. Матч начался.`));
  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};
    if (packet.event === "feedback:sound" && payload.recipientId === network.playerId) {
      if (payload.key === "enemy.killed") announce("Противник уничтожен");
      if (payload.key === "death.full") announce("Вы погибли. Возрождение через три секунды");
      if (payload.key === "armor.break") announce("Броня противника разбита");
    }
    if (packet.event === "entity:respawned" && payload.entityId === network.playerId) {
      announce("Вы возродились");
    }
    if (packet.event === "weapon:selected" && payload.entityId === network.playerId) {
      announce(payload.weaponId === "rifle" ? "Автомат" : "Пистолет");
    }
    if (packet.event === "match:ended") {
      if (payload.winner === 0) announce("Раунд завершён вничью. Новый раунд через пять секунд.");
      else announce(`Раунд завершён. Победила команда ${payload.winner}. Новый раунд через пять секунд.`);
    }
    if (packet.event === "match:started") {
      announce("Новый раунд начался");
    }
  });
}
