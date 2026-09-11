const ROOT = "/assets/audio/injury/";
const IMPACT_DOWN_WEAPONS = new Set(["fall-impact", "ragdoll-impact", "vehicle-crash-force"]);
export const manifest = {
  id: "injury-feedback",
  requires: ["cloudflare-session", "spatial-audio-web", "speech-settings", "low-health-audio"],
};

export function injuryMessage(event, p = {}) {
  if (event === "injury:downed") return "Ты тяжело ранен. Можно только ползти. Используй стимулятор: клавиша N на клавиатуре или кнопка Стимулятор на сенсорном экране. Без помощи ты истечёшь кровью.";
  if (event === "injury:stim-picked") return p.quantity > 0
    ? `Стимулятор подобран. В запасе ${p.stimulants} из 2. Используй клавишу N или кнопку Стимулятор на сенсорном экране.`
    : "Запас стимуляторов полон: 2 из 2.";
  if (event === "injury:stim-started") return p.downed
    ? "Самостоятельный подъём. Не двигайся 6 секунд." : "Используешь стимулятор. Не двигайся 2 секунды.";
  if (event === "injury:stim-completed") return `${p.revived ? "Ты снова на ногах." : "Здоровье восстановлено."} Осталось стимуляторов: ${p.stimulants}.`;
  if (event === "injury:stim-cancelled") {
    if (p.reason === "no-room-to-stand") return "Здесь нельзя встать. Отползи на свободное место. Стимулятор сохранён.";
    if (p.reason === "death" || p.reason === "downed") return "";
    return "Лечение прервано. Стимулятор сохранён.";
  }
  if (event === "injury:stim-unavailable") return ({
    empty: "Стимуляторов нет. Ищи их в ящиках с бронепластинами.",
    healthy: "Здоровье полное. Стимулятор не нужен.",
    busy: "Стимулятор можно использовать на земле, вне машины, когда закончится падение.",
  })[p.reason] ?? "";
  return "";
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const lowHealth = ctx.services.get("low-health-audio");
  const status = document.querySelector("#injury-value");
  const stock = document.querySelector("#stimulants-value");
  const button = document.querySelector('[data-touch-action="stimulant"]');
  let downed = false;
  let pending = false;
  let heartbeat = null;
  let generation = 0;
  let retryAfter = 0;

  function stopHeartbeat() {
    generation++;
    heartbeat?.stop?.();
    heartbeat = null;
    pending = false;
    audio.stopChannel("injury-heartbeat");
  }
  async function startHeartbeat() {
    if (pending || heartbeat || Date.now() < retryAfter) return;
    pending = true;
    const token = generation;
    try {
      const handle = await audio.playCentered(`${ROOT}heartbeat.mp3`, {
        gain: 0.76, loop: true, channel: "injury-heartbeat", replace: true, foreground: true,
      });
      if (!downed || token !== generation) { handle?.stop?.(); return; }
      heartbeat = handle;
    } catch (error) {
      retryAfter = Date.now() + 1500;
      console.error("Injury heartbeat", error);
    } finally { if (token === generation) pending = false; }
  }
  const play = (file, channel) => audio.playCentered(ROOT + file, {
    gain: 0.65, channel, replace: true, foreground: true,
  }).catch(error => console.error("Injury sound", error));

  ctx.events.on("game:snapshot", snapshot => {
    const self = snapshot.entities?.find(e => e.id === network.playerId);
    downed = Boolean(self?.alive && self.downed);
    if (downed) void startHeartbeat(); else if (pending || heartbeat) stopHeartbeat();
    if (status) status.textContent = downed
      ? `Ранен: ${Math.ceil(self.health)} из ${self.healthMax}. До смерти без новых попаданий около ${self.bleedOutSeconds} секунд.`
      : (self?.alive ? "На ногах" : "—");
    if (stock) stock.textContent = self?.stimulants == null ? "—" : `${self.stimulants} из ${self.stimulantCapacity}`;
    if (button) {
      button.disabled = snapshot.mode !== "battle-royale" || !self?.alive;
      button.textContent = downed ? `Подняться стимулятором (${self.stimulants ?? 0})` : `Стимулятор (${self?.stimulants ?? 0})`;
    }
  });
  ctx.events.on("game:event", packet => {
    const p = packet.payload ?? {};
    if (packet.event === "sound:spatial" && p.key === "injury.crawl") {
      const promise = p.entityId === network.playerId
        ? audio.playCentered(`${ROOT}crawl.mp3`, { gain: 0.5, channel: "injury-crawl", replace: true })
        : audio.playSpatial(`${ROOT}crawl.mp3`, p, { gain: 0.65, radius: 12, occlusion: p.occlusion ?? 0 });
      void promise.catch(error => console.error("Crawling sound", error));
    }
    if (p.entityId !== network.playerId || !packet.event.startsWith("injury:")) return;
    if (packet.event === "injury:downed" && IMPACT_DOWN_WEAPONS.has(String(p.weaponId ?? ""))) {
      void lowHealth.playWoundedCue();
    }
    const text = injuryMessage(packet.event, p);
    if (text) speech.say(text, { interrupt: true });
    if (packet.event === "injury:stim-started") void play("stim-start.mp3", "injury-stim");
    if (packet.event === "injury:stim-cancelled") audio.stopChannel("injury-stim");
    if (packet.event === "injury:stim-completed") void play("stim-complete.mp3", "injury-stim");
  });
  ctx.events.on("network:disconnected", () => {
    downed = false; stopHeartbeat();
    audio.stopChannel("injury-stim"); audio.stopChannel("injury-crawl");
  });
}
