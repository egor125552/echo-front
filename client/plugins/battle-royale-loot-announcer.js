export const manifest = {
  id: "battle-royale-loot-announcer",
  requires: ["cloudflare-session", "speech-settings"],
};

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");

  function announce(text) {
    if (!text) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    speech.say(text, { interrupt: true });
  }

  ctx.events.on("game:event", (packet) => {
    if (packet.event !== "loot:picked") return;
    const payload = packet.payload ?? {};
    if (payload.entityId !== network.playerId || payload.loot !== "rifle") return;
    if (payload.restocked) {
      announce(`Патроны к автомату: ${Math.max(0, Number(payload.quantity) || 0)}`);
      return;
    }
    announce(payload.applied ? "Автомат подобран" : "Боезапас автомата полон");
  });
}
