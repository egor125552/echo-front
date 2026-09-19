export const manifest = {
  id: "tutorial-guide",
  requires: ["cloudflare-session", "speech-settings"],
};

const TEAM_MESSAGES = {
  "move-forward": "Учебный командный бой. Сначала обычная ходьба. Иди вперёд примерно пять метров, пока я не дам следующую подсказку. На клавиатуре удерживай стрелку вверх. На сенсорном экране используй кнопку Вперёд.",
  strafe: "Хорошо. Теперь пройди боком примерно три метра влево или вправо. На клавиатуре удерживай стрелку влево или вправо.",
  sprint: "Теперь бег. Удерживай движение вперёд и Shift и пробеги примерно десять метров. На сенсорном экране включи Бег и двигайся вперёд.",
  fire: "Пробежка закончена. Теперь сделай один выстрел. На клавиатуре нажми X. На сенсорном экране нажми Огонь.",
  "hit-enemy": "Теперь попади по боту. Когда пуля попадёт, ты услышишь отдельный звук подтверждения попадания.",
  "eliminate-enemy": "Попадание есть. Теперь продолжай стрелять по этому противнику, пока не уничтожишь его. Так ты услышишь разницу между обычным попаданием и подтверждением убийства.",
  reload: "Противник уничтожен. Пустой магазин теперь перезаряжается автоматически. Для продолжения обучения нажми R на клавиатуре или кнопку Перезарядка на сенсорном экране.",
  "receive-hit": "Теперь ничего не нажимай. Другой учебный бот один раз попадёт в тебя. Послушай звук входящего попадания. Сразу после реального урона бот снова станет пассивным.",
};

const BATTLE_ROYALE_MESSAGES = {
  waiting: "Сейчас начнётся учебная высадка.",
  "deploy-parachute": "Слышишь сильный поток воздуха. Это свободное падение. Раскрой парашют вручную: на клавиатуре нажми пробел, на сенсорном экране нажми Парашют.",
  "steer-parachute": "Купол раскрылся. Шум воздуха изменился, а звук ткани и строп подтверждает раскрытие. Теперь плавно поверни влево или вправо.",
  land: "Поворот получился. Теперь просто продолжай снижение. Перед землёй парашют сам начнёт посадочное торможение.",
  "ground-run": "Посадка завершена. Теперь пробеги небольшой участок. Удерживай движение вперёд и Shift. Я продолжу только после нескольких настоящих беговых шагов.",
  "automatic-parachute": "Теперь отдельная демонстрация аварийного парашюта. Тебя снова подняло в воздух. Ничего не нажимай, особенно пробел. Игра сама раскроет купол, когда запас высоты станет опасно мал.",
  "automatic-parachute-land": "Автоматическое аварийное раскрытие сработало. Запомни этот звук: если в начале падения ты вообще не раскрыл парашют, игра страхует тебя перед землёй. Теперь дождись посадки.",
  "select-navigation": "Теперь навигация. На клавиатуре нажми M, чтобы выбрать цель, затем Enter, чтобы построить маршрут. На сенсорном экране используй кнопки выбора цели и Маршрут.",
  "follow-navigation": "Маршрут построен. Двигайся по звуковым подсказкам. Навигация будет сообщать направление и расстояние.",
  "select-crate": "Теперь выбери в навигации любой ящик и запусти маршрут к нему.",
  "follow-crate": "Маршрут к ящику запущен. Дойди до него по звуковым подсказкам.",
  "interact-first-crate": "Ты у ящика. Открой его. На клавиатуре нажми E. На сенсорном экране нажми Взаимодействовать.",
  "follow-second-crate": "Нужный второй ящик выбран. Дойди до него по навигации.",
  "interact-second-crate": "Ты у второго ящика. Открой его кнопкой взаимодействия.",
  "select-rifle": "Теперь у тебя есть пистолет и автомат. Переключись на автомат. На клавиатуре удерживай Z и нажми стрелку вправо или влево.",
  "armor-break": "Сейчас учебный бот будет стрелять только по тебе. Не отвечай огнём. Слушай попадания в броню и дождись отдельного звука разрушения брони. После этого бот сразу замолчит.",
  "apply-armor": "Броня разрушена. Чтобы восстановить её, поставь бронепластину. На клавиатуре нажми B. Во время установки можно двигаться, но стрельба прервёт установку. Одного нажатия хватит для всех доступных пластин.",
  "injury-demo": "Броня восстановлена. Теперь бот снова будет стрелять и остановится только когда ты перейдёшь в состояние тяжёлого ранения. Ничего не нажимай и слушай, как меняются звуки урона.",
  "use-stimulant": "Ты тяжело ранен. Сейчас можно только ползти, а без помощи здоровье будет постепенно уходить. Для самостоятельного подъёма используй стимулятор: нажми N или кнопку Стимулятор. После запуска не двигайся шесть секунд, иначе лечение прервётся.",
};

function teamCompletionMessage(damage = {}) {
  if ((Number(damage.armorAbsorbed) || 0) > 0) {
    return "Это был удар по броне. Броня приняла урон, и бот сразу перестал стрелять. Командная часть обучения завершена. Сейчас перейдём к учебной королевской битве.";
  }
  return "Это был урон по здоровью. Бот сразу перестал стрелять. Командная часть обучения завершена. Сейчас перейдём к учебной королевской битве.";
}

function secondCrateMessage(tutorial = {}) {
  return tutorial.neededLoot === "armor"
    ? "В первом ящике был автомат. Теперь найди через навигацию ящик с бронёй, выбери его и запусти маршрут."
    : "В первом ящике была броня. Теперь найди через навигацию ящик с автоматом, выбери его и запусти маршрут.";
}

function completionMessage() {
  return "Обучение завершено. Ты освоил движение, уничтожение противника, перезарядку, ручной и аварийный автоматический парашют, навигацию, поиск добычи, выбор автомата, разрушение и восстановление брони, тяжёлое ранение и самостоятельный подъём стимулятором. В королевской битве следи за безопасной зоной. Когда зона начнёт сжиматься или ты окажешься снаружи, игра сообщит об этом голосом и подскажет направление к безопасной области. Сейчас я верну тебя в меню выбора режима.";
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const status = document.querySelector("#tutorial-status");
  let active = false;
  let lastPhase = null;
  let lastIncomingDamage = null;
  let lastTutorial = null;
  let pendingAfterSpeech = null;
  let pendingAfterSpeechTimer = null;

  function clearPendingAfterSpeech() {
    if (pendingAfterSpeechTimer != null) clearTimeout(pendingAfterSpeechTimer);
    pendingAfterSpeechTimer = null;
    pendingAfterSpeech = null;
  }

  function estimatedSpeechMs(text) {
    const words = String(text).trim().split(/\s+/).filter(Boolean).length;
    const rate = Math.max(0.7, Number(speech.rate) || 1);
    return Math.max(2500, Math.min(22000, Math.round((words * 430) / rate + 1400)));
  }

  function present(text, { afterSpeech = null } = {}) {
    if (!text || !active) return;
    clearPendingAfterSpeech();
    if (status) {
      status.hidden = false;
      status.textContent = "";
      requestAnimationFrame(() => { status.textContent = text; });
    }
    if (typeof afterSpeech === "function") {
      pendingAfterSpeech = afterSpeech;
      pendingAfterSpeechTimer = setTimeout(() => {
        const callback = pendingAfterSpeech;
        clearPendingAfterSpeech();
        callback?.();
      }, estimatedSpeechMs(text));
    }
    speech.say(text, { interrupt: true });
  }

  function presentPhase(tutorial) {
    const phase = tutorial?.phase;
    if (!active || !phase || phase === lastPhase) return;
    lastPhase = phase;

    if (tutorial.mode === "battle-royale") {
      if (phase === "select-second-crate") {
        present(secondCrateMessage(tutorial));
        return;
      }
      if (phase === "complete") {
        present(completionMessage(), {
          afterSpeech: () => ctx.events.emit("tutorial:battle-royale-section-complete", {}),
        });
        return;
      }
      present(BATTLE_ROYALE_MESSAGES[phase]);
      return;
    }

    if (phase === "team-complete") {
      present(teamCompletionMessage(lastIncomingDamage ?? {}), {
        afterSpeech: () => ctx.events.emit("tutorial:team-section-complete", {}),
      });
      return;
    }
    present(TEAM_MESSAGES[phase]);
  }

  ctx.events.on("speech:state", ({ reason } = {}) => {
    if (reason !== "ended" || typeof pendingAfterSpeech !== "function") return;
    const callback = pendingAfterSpeech;
    clearPendingAfterSpeech();
    callback();
  });

  ctx.events.on("network:welcome", ({ tutorial = false } = {}) => {
    active = Boolean(tutorial);
    lastPhase = null;
    lastIncomingDamage = null;
    lastTutorial = null;
    clearPendingAfterSpeech();
    if (!active && status) {
      status.hidden = true;
      status.textContent = "";
    }
  });

  ctx.events.on("game:event", (packet) => {
    if (!active) return;
    const payload = packet?.payload ?? {};

    if (
      packet?.event === "navigation:selected"
      && payload.entityId === network.playerId
      && ["select-navigation", "select-crate", "select-second-crate"].includes(lastPhase)
    ) {
      const distance = Math.max(0, Math.round(Number(payload.distanceMeters ?? payload.distance) || 0));
      present(`Выбрано: ${payload.targetName || "цель"}. ${distance} метров. Нажми Enter, чтобы построить маршрут.`);
      return;
    }

    if (
      packet?.event === "navigation:started"
      && lastPhase === "select-second-crate"
      && payload.targetKind === "crate"
    ) {
      const neededLoot = lastTutorial?.neededLoot ?? null;
      if (neededLoot && payload.targetLoot && payload.targetLoot !== neededLoot) {
        present(
          neededLoot === "armor"
            ? "Это ящик с автоматом. Для этого шага нужен ящик с бронёй. Выбери следующую цель."
            : "Это ящик с бронёй. Для этого шага нужен ящик с автоматом. Выбери следующую цель.",
        );
      }
      return;
    }

    if (packet?.event !== "combat:damage") return;
    if (payload.targetId !== network.playerId) return;
    const applied = (Number(payload.healthApplied) || 0) + (Number(payload.armorAbsorbed) || 0);
    if (applied <= 0) return;
    lastIncomingDamage = {
      healthApplied: Number(payload.healthApplied) || 0,
      armorAbsorbed: Number(payload.armorAbsorbed) || 0,
    };
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    if (!active || !snapshot?.tutorial?.enabled) return;
    lastTutorial = snapshot.tutorial;
    presentPhase(snapshot.tutorial);
  });
}
