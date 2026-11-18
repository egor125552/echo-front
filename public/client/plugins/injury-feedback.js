const ROOT = "/assets/audio/injury/";
const IMPACT_DOWN_WEAPONS = new Set(["fall-impact", "ragdoll-impact", "vehicle-crash-force"]);
export const manifest = {
  id: "injury-feedback",
  requires: ["cloudflare-session", "spatial-audio-web", "speech-settings", "low-health-audio"],
};

export function injuryMessage(event, p = {}, selfId = null) {
  if (event === "injury:downed") {
    if (selfId && p.entityId && p.entityId !== selfId) {
      return "Напарник ранен.";
    }
    return "Ты тяжело ранен. Можно только ползти. Используй стимулятор: клавиша N на клавиатуре или кнопка Стимулятор на сенсорном экране. Без помощи ты истечёшь кровью.";
  }
  if (event === "squad:callout") return String(p.text ?? "").trim();
  if (event === "injury:downed-teammate-nearby") {
    return "Лежащий напарник рядом. Можно поднять касанием одним пальцем или клавишей E.";
  }
  if (event === "injury:team-revive-started") {
    return selfId && p.reviverId === selfId && p.entityId !== selfId
      ? "Поднимаешь напарника."
      : "Напарник поднимает тебя.";
  }
  if (event === "injury:team-revive-paused") {
    if (p.reason === "target-died" || p.reason === "removed" || p.reason === "disconnect") return "";
    return selfId && p.reviverId === selfId && p.entityId !== selfId
      ? "Подъём напарника приостановлен. Таймер сохранён."
      : "Подъём приостановлен. Таймер сохранён.";
  }
  if (event === "injury:team-revive-completed") {
    return selfId && p.reviverId === selfId && p.entityId !== selfId
      ? "Напарник поднят."
      : "Ты снова на ногах.";
  }
  if (event === "injury:stim-picked") return p.quantity > 0
    ? `Стимулятор подобран. В запасе ${p.stimulants} из 2. Используй клавишу N или кнопку Стимулятор на сенсорном экране.`
    : "Запас стимуляторов полон: 2 из 2.";
  if (event === "injury:stim-started") {
    if (p.stimKind === "turbo") {
      return p.downed
        ? "Турбо-стимулятор: подъём и 600 здоровья за 1 секунду."
        : "Турбо-стимулятор: здоровье повышается до 600 за 1 секунду.";
    }
    if (p.stimKind === "fast") {
      return p.downed
        ? "Усиленный стимулятор: самостоятельный подъём за 1 секунду."
        : "Усиленный стимулятор: лечение за 1 секунду.";
    }
    return p.downed
      ? "Самостоятельный подъём. Не двигайся 6 секунд."
      : "Используешь стимулятор. Можно ходить и бежать, но не стрелять. Лечение займёт 2 секунды.";
  }
  if (event === "injury:stim-completed") {
    if (p.stimKind === "turbo") {
      const prefix = p.revived ? "Ты снова на ногах. " : "";
      return `${prefix}Турбо-стимулятор подействовал: здоровье ${Math.round(Number(p.health) || 600)}. Осталось турбо-стимуляторов: ${p.turboStimulants ?? 0}.`;
    }
    if (p.stimKind === "fast") {
      return `${p.revived ? "Ты снова на ногах." : "Здоровье восстановлено."} Осталось усиленных стимуляторов: ${p.fastStimulants ?? 0}.`;
    }
    return `${p.revived ? "Ты снова на ногах." : "Здоровье восстановлено."} Осталось стимуляторов: ${p.stimulants}.`;
  }
  if (event === "injury:stim-cancelled") {
    if (p.reason === "no-room-to-stand") return "Здесь нельзя встать. Отползи на свободное место. Стимулятор сохранён.";
    if (p.reason === "death" || p.reason === "downed") return "";
    return "Лечение прервано. Стимулятор сохранён.";
  }
  if (event === "injury:stim-unavailable") {
    if (p.reason === "empty") {
      if (p.stimKind === "turbo") return "Турбо-стимуляторов нет. Их можно купить в магазине.";
      if (p.stimKind === "fast") return "Усиленных стимуляторов нет. Их можно купить в магазине.";
      return "Стимуляторов нет. Ищи их в ящиках с бронепластинами.";
    }
    if (p.reason === "healthy") {
      if (p.stimKind === "turbo") return "Здоровье уже 600 или выше. Турбо-стимулятор не нужен.";
      return "Здоровье полное. Стимулятор не нужен.";
    }
    return ({
      busy: "Стимулятор можно использовать на земле, вне машины, когда закончится падение.",
    })[p.reason] ?? "";
  }
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
  const fastButton = document.querySelector('[data-touch-action="fast-stimulant"]');
  const turboButton = document.querySelector('[data-touch-action="turbo-stimulant"]');
  const live = document.querySelector("#announcer");
  let downed = false;
  let pending = false;
  let heartbeat = null;
  let generation = 0;
  let retryAfter = 0;
  let selfTeamId = 0;
  const recentCallouts = new Map();

  function speakCallout(text, interrupt = false) {
    if (!text || network.tutorial) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    speech.say(text, { interrupt });
  }

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

  const playSpatialInjury = (file, p, channel) => {
    if (!Number.isFinite(Number(p?.x)) || !Number.isFinite(Number(p?.z))) return Promise.resolve(null);
    return audio.playSpatial(ROOT + file, {
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      z: Number(p.z) || 0,
    }, {
      gain: 0.85,
      radius: Number(p.radius) || 36,
      referenceDistance: 2.5,
      rolloffFactor: 0.45,
      occlusion: Number(p.occlusion) || 0,
      channel,
      replace: true,
    }).catch(error => console.error("Spatial injury sound", error));
  };

  ctx.events.on("game:snapshot", snapshot => {
    const self = snapshot.entities?.find(e => e.id === network.playerId);
    if (self?.team != null) selfTeamId = Number(self.team) || 0;
    downed = Boolean(self?.alive && self.downed);
    if (downed) void startHeartbeat(); else if (pending || heartbeat) stopHeartbeat();
    if (status) status.textContent = downed
      ? `Ранен: ${Math.ceil(self.health)} из ${self.healthMax}. До смерти без новых попаданий около ${self.bleedOutSeconds} секунд.`
      : (self?.alive ? "На ногах" : "—");
    if (stock) {
      if (self?.stimulants == null) {
        stock.textContent = "—";
      } else {
        const fast = Number(self.fastStimulants) || 0;
        const turbo = Number(self.turboStimulants) || 0;
        const purchased = Number(self.turboPurchasedCount) || 0;
        const limit = Number(self.turboPurchaseLimit) || 3;
        stock.textContent = `${self.stimulants} из ${self.stimulantCapacity}, быстрых 1 сек: ${fast}, турбо 600 HP: ${turbo} (куплено ${purchased} из ${limit})`;
      }
    }
    if (button) {
      button.disabled = snapshot.mode !== "battle-royale" || !self?.alive;
      button.textContent = downed ? `Подняться стимулятором (${self.stimulants ?? 0})` : `Стимулятор (${self?.stimulants ?? 0})`;
    }
    if (fastButton) {
      const fast = Number(self?.fastStimulants) || 0;
      fastButton.disabled = snapshot.mode !== "battle-royale" || !self?.alive || fast <= 0;
      fastButton.textContent = downed ? `Быстрый подъём 1 сек (${fast})` : `Усиленный 1 сек (${fast})`;
    }
    if (turboButton) {
      const turbo = Number(self?.turboStimulants) || 0;
      turboButton.disabled = snapshot.mode !== "battle-royale" || !self?.alive || turbo <= 0;
      turboButton.textContent = `Турбо 600 HP (${turbo})`;
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
    if (packet.event === "squad:callout") {
      const text = injuryMessage(packet.event, p, network.playerId);
      if (text) {
        const now = Date.now();
        const key = `${p.kind ?? ""}:${p.subjectId ?? text}`;
        if (now - (recentCallouts.get(key) ?? 0) >= 1200) {
          recentCallouts.set(key, now);
          const urgent = p.kind === "teammate-died";
          speakCallout(text, urgent);
        }
      }
      return;
    }
    const involvesSelf = p.entityId === network.playerId || p.reviverId === network.playerId;
    const isSameTeam = Boolean(selfTeamId > 0 && p.teamId && Number(p.teamId) === selfTeamId);
    const isTeammateDowned = packet.event === "injury:downed"
      && p.entityId !== network.playerId
      && (!selfTeamId || !p.teamId || Number(p.teamId) === selfTeamId);
    if (isTeammateDowned) {
      const text = injuryMessage(packet.event, p, network.playerId);
      if (text) speakCallout(text, true);
      return;
    }
    if (!involvesSelf && packet.event.startsWith("injury:")) {
      const chan = `injury-stim:${p.entityId ?? "other"}`;
      if (packet.event === "injury:stim-started" || packet.event === "injury:team-revive-started") {
        void playSpatialInjury("stim-start.mp3", p, chan);
        if (isSameTeam && (p.downed || packet.event === "injury:team-revive-started")) {
          speakCallout(packet.event === "injury:team-revive-started" ? "Напарника поднимают." : "Напарник поднимается сам.", false);
        }
      } else if (packet.event === "injury:stim-cancelled" || packet.event === "injury:team-revive-paused") {
        audio.stopChannel(chan);
      } else if (
        packet.event === "injury:stim-completed"
        || packet.event === "injury:team-revive-completed"
        || packet.event === "injury:revived"
      ) {
        void playSpatialInjury("stim-complete.mp3", p, chan);
        if (isSameTeam && (p.revived || packet.event === "injury:team-revive-completed" || packet.event === "injury:revived")) {
          speakCallout("Напарник снова на ногах.", false);
        }
      }
      return;
    }
    if (!involvesSelf || !packet.event.startsWith("injury:")) return;
    if (packet.event === "injury:downed" && p.entityId === network.playerId && IMPACT_DOWN_WEAPONS.has(String(p.weaponId ?? ""))) {
      void lowHealth.playWoundedCue();
    }
    const text = injuryMessage(packet.event, p, network.playerId);
    if (text && !network.tutorial) speech.say(text, { interrupt: true });
    if (packet.event === "injury:stim-started" || packet.event === "injury:team-revive-started") {
      void play("stim-start.mp3", "injury-stim");
    }
    if (packet.event === "injury:stim-cancelled" || packet.event === "injury:team-revive-paused") {
      audio.stopChannel("injury-stim");
    }
    if (packet.event === "injury:stim-completed" || packet.event === "injury:team-revive-completed") {
      void play("stim-complete.mp3", "injury-stim");
    }
  });
  ctx.events.on("network:disconnected", () => {
    downed = false; selfTeamId = 0; recentCallouts.clear(); stopHeartbeat();
    audio.stopChannel("injury-stim"); audio.stopChannel("injury-crawl");
  });
}
