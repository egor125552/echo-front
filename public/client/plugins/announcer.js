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

  function updateLiveMode() {
    live?.setAttribute("aria-live", speech.enabled ? "off" : "assertive");
  }

  function announce(text, { interrupt = false } = {}) {
    if (!text || text === lastMessage) return;
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
    announce(
      `Вы в команде ${team}. Задача: уничтожить десять противников раньше другой команды. ` +
      "Слушайте шаги и выстрелы. Стрелки вверх и вниз — движение, влево и вправо — поворот. " +
      "Shift — бег, X — огонь. Удерживайте Z и нажимайте влево или вправо, чтобы сменить оружие.",
      { interrupt: true },
    );
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};

    if (packet.event === "feedback:sound" && payload.recipientId === network.playerId) {
      if (payload.key === "enemy.killed") announce("Противник уничтожен", { interrupt: true });
      if (payload.key === "death.full") announce("Вы погибли. Возрождение через три секунды", { interrupt: true });
      if (payload.key === "armor.break") announce("Броня противника разбита", { interrupt: true });
    }

    if (packet.event === "entity:respawned" && payload.entityId === network.playerId) {
      announce("Вы снова в бою", { interrupt: true });
    }

    if (packet.event === "weapon:selected" && payload.entityId === network.playerId) {
      announce(payload.weaponId === "rifle" ? "Автомат" : "Пистолет", { interrupt: true });
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
      if (payload.winner === 0) announce("Раунд завершён вничью. Новый раунд через пять секунд", { interrupt: true });
      else if (payload.winner === team) announce("Победа. Новый раунд через пять секунд", { interrupt: true });
      else announce("Поражение. Новый раунд через пять секунд", { interrupt: true });
    }

    if (packet.event === "match:started") {
      announce("Новый раунд. В бой", { interrupt: true });
    }
  });
}
