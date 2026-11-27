export const manifest = {
  id: "tutorial-guide",
  requires: ["cloudflare-session", "speech-settings"],
};

function controlHintsFor(profile = "auto") {
  switch (profile) {
    case "touch-gestures":
      return {
        moveForward: "Поставь один палец на экран и веди его вверх от точки касания.",
        strafe: "Веди один палец влево или вправо от точки касания.",
        sprint: "Отведи один палец вверх подальше от точки касания — персонаж сам перейдёт на бег.",
        fire: "Коснись экрана одновременно тремя пальцами.",
        reload: "Коротко коснись экрана двумя пальцами.",
        switchWeapon: "Сделай смах двумя пальцами вверх",
        fireShort: "касанием тремя пальцами",
        deployParachute: "сделай два быстрых касания одним пальцем.",
        steerParachute: "веди одним пальцем влево или вправо.",
        groundRun: "Отведи один палец вверх подальше, чтобы побежать.",
        doNotPressParachute: "Ничего не нажимай и не касайся экрана.",
        openMap: "Сделай смах двумя пальцами вниз или нажми кнопку Карта вверху экрана.",
        openMapShort: "открой Карту смахом двумя пальцами вниз",
        interact: "Сделай одно короткое касание одним пальцем.",
        interactShort: "одним коротким касанием",
        applyArmor: "Сделай двойное касание двумя пальцами.",
        useStimulant: "сделай тройное касание двумя пальцами.",
        extraStims: "В обычном матче в магазине можно купить быстрый стимулятор на одну секунду и турбо-стимулятор на шестьсот здоровья.",
        shopAndCar: "подходи к магазину на карте и открывай его коротким касанием одним пальцем — там можно купить винтовку, снайперку, быстрые и турбо-стимуляторы, броню или выкупить павших напарников с высадкой на парашюте. Также на карте есть машины, в которые можно садиться коротким касанием, аирдропы, ящик Джаггернаута и поза паркура тройным касанием одним пальцем в прыжке.",
      };
    case "touch-buttons":
      return {
        moveForward: "На сенсорном экране используй кнопку Вперёд.",
        strafe: "На сенсорном экране используй кнопку Влево или Вправо.",
        sprint: "На сенсорном экране включи кнопку Бег и двигайся кнопкой Вперёд.",
        fire: "На сенсорном экране нажми кнопку Огонь.",
        reload: "На сенсорном экране нажми кнопку Перезарядка.",
        switchWeapon: "Нажимай кнопку Следующее оружие",
        fireShort: "кнопкой Огонь",
        deployParachute: "на сенсорном экране нажми кнопку Парашют.",
        steerParachute: "используй кнопки Влево или Вправо.",
        groundRun: "Включи кнопку Бег и двигайся кнопкой Вперёд.",
        doNotPressParachute: "Ничего не нажимай, особенно кнопку Парашют.",
        openMap: "На сенсорном экране открой кнопку Карта.",
        openMapShort: "открой Карту",
        interact: "На сенсорном экране нажми кнопку Взаимодействовать.",
        interactShort: "кнопкой Взаимодействовать",
        applyArmor: "На сенсорном экране нажми кнопку Бронепластина.",
        useStimulant: "нажми кнопку Стимулятор.",
        extraStims: "В обычном матче в магазине также можно купить быстрый стимулятор на одну секунду и турбо-стимулятор на шестьсот здоровья.",
        shopAndCar: "подходи к магазину на карте и нажимай кнопку Взаимодействовать — там можно купить винтовку, снайперку, быстрые и турбо-стимуляторы, броню или выкупить павших напарников с высадкой на парашюте. Также на карте есть машины, в которые можно садиться кнопкой Взаимодействовать, аирдропы, ящик Джаггернаута и поза паркура кнопкой Войти в позу.",
      };
    case "keyboard":
      return {
        moveForward: "На клавиатуре удерживай стрелку вверх.",
        strafe: "На клавиатуре удерживай стрелку влево или вправо.",
        sprint: "Удерживай стрелку вверх и Shift.",
        fire: "На клавиатуре нажми X.",
        reload: "На клавиатуре нажми R.",
        switchWeapon: "Удерживай Z и нажимай стрелки влево или вправо",
        fireShort: "клавишей X",
        deployParachute: "на клавиатуре нажми Пробел.",
        steerParachute: "удерживай стрелку влево или вправо.",
        groundRun: "Удерживай стрелку вверх и Shift.",
        doNotPressParachute: "Ничего не нажимай, особенно Пробел.",
        openMap: "На клавиатуре нажми M.",
        openMapShort: "открой Карту клавишей M",
        interact: "На клавиатуре нажми E.",
        interactShort: "клавишей E",
        applyArmor: "На клавиатуре нажми B.",
        useStimulant: "нажми N.",
        extraStims: "В обычном матче в магазине также можно купить быстрый стимулятор на одну секунду клавишей U и турбо-стимулятор на шестьсот здоровья клавишей T.",
        shopAndCar: "подходи к магазину на карте клавишей E — там можно купить винтовку, снайперку, быстрые и турбо-стимуляторы, броню или выкупить павших напарников с высадкой на парашюте. Также на карте есть машины, в которые можно садиться клавишей E, аирдропы, ящик Джаггернаута и поза паркура клавишей C в прыжке.",
      };
    case "gamepad-playstation":
      return {
        moveForward: "На джойстике PlayStation отклони левый стик вперёд.",
        strafe: "Отклони левый стик влево или вправо.",
        sprint: "Отклони левый стик вперёд и удерживай Крестик.",
        fire: "Нажми курок R2.",
        reload: "Нажми Квадрат.",
        switchWeapon: "Нажимай L1 или R1",
        fireShort: "курком R2",
        deployParachute: "нажми Крестик.",
        steerParachute: "отклони левый стик влево или вправо.",
        groundRun: "Отклони левый стик вперёд и удерживай Крестик.",
        doNotPressParachute: "Ничего не нажимай, особенно Крестик.",
        openMap: "Нажми кнопку Share для Карты или выбирай цели крестовиной влево-вправо и подтверждай крестовиной вниз.",
        openMapShort: "нажми Share для Карты",
        interact: "Коротко нажми Треугольник.",
        interactShort: "коротким нажатием Треугольника",
        applyArmor: "Удерживай Треугольник полсекунды до короткой вибрации, затем отпусти.",
        useStimulant: "коротко нажми крестовину вверх.",
        extraStims: "В обычном матче в магазине также можно купить быстрый стимулятор на одну секунду и турбо-стимулятор на шестьсот здоровья на курок L2.",
        shopAndCar: "подходи к магазину на карте и коротко нажимай Треугольник — там можно купить винтовку, снайперку, быстрые и турбо-стимуляторы, броню или выкупить павших напарников с высадкой на парашюте. Также на карте есть машины, в которые можно садиться Треугольником, аирдропы, ящик Джаггернаута и поза паркура кнопкой Кружок в прыжке.",
      };
    case "gamepad-standard":
      return {
        moveForward: "На геймпаде отклони левый стик вперёд.",
        strafe: "Отклони левый стик влево или вправо.",
        sprint: "Отклони левый стик вперёд и удерживай кнопку A.",
        fire: "Нажми правый курок RT.",
        reload: "Нажми кнопку X.",
        switchWeapon: "Нажимай LB или RB",
        fireShort: "правым курком RT",
        deployParachute: "нажми кнопку A.",
        steerParachute: "отклони левый стик влево или вправо.",
        groundRun: "Отклони левый стик вперёд и удерживай кнопку A.",
        doNotPressParachute: "Ничего не нажимай, особенно кнопку A.",
        openMap: "Нажми кнопку View для Карты или выбирай цели крестовиной влево-вправо и подтверждай крестовиной вниз.",
        openMapShort: "нажми View для Карты",
        interact: "Коротко нажми кнопку Y.",
        interactShort: "коротким нажатием Y",
        applyArmor: "Удерживай кнопку Y полсекунды до короткой вибрации, затем отпусти.",
        useStimulant: "коротко нажми крестовину вверх.",
        extraStims: "В обычном матче в магазине также можно купить быстрый стимулятор на одну секунду и турбо-стимулятор на шестьсот здоровья на левый курок LT.",
        shopAndCar: "подходи к магазину на карте и коротко нажимай кнопку Y — там можно купить винтовку, снайперку, быстрые и турбо-стимуляторы, броню или выкупить павших напарников с высадкой на парашюте. Также на карте есть машины, в которые можно садиться кнопкой Y, аирдропы, ящик Джаггернаута и поза паркура кнопкой B в прыжке.",
      };
    default:
      return {
        moveForward: "На клавиатуре удерживай стрелку вверх. На сенсорном экране используй кнопку Вперёд.",
        strafe: "На клавиатуре удерживай стрелку влево или вправо. На сенсорном экране используй кнопку Влево или Вправо.",
        sprint: "Удерживай движение вперёд и Shift и пробеги примерно десять метров. На сенсорном экране включи Бег и двигайся вперёд.",
        fire: "На клавиатуре нажми X. На сенсорном экране нажми Огонь.",
        reload: "Нажми R на клавиатуре или кнопку Перезарядка на сенсорном экране.",
        switchWeapon: "Удерживай Z и нажимай стрелки влево или вправо, либо нажимай Следующее оружие",
        fireShort: "клавишей X или кнопкой Огонь",
        deployParachute: "на клавиатуре нажми пробел, на сенсорном экране нажми Парашют.",
        steerParachute: "плавно поверни влево или вправо.",
        groundRun: "Удерживай движение вперёд и Shift.",
        doNotPressParachute: "Ничего не нажимай, особенно пробел.",
        openMap: "На клавиатуре нажми M, на сенсорном экране открой кнопку Карта.",
        openMapShort: "открой Карту",
        interact: "На клавиатуре нажми E. На сенсорном экране нажми Взаимодействовать.",
        interactShort: "кнопкой взаимодействия",
        applyArmor: "На клавиатуре нажми B или нажми Бронепластина.",
        useStimulant: "нажми N или кнопку Стимулятор.",
        extraStims: "В обычном матче в магазине также можно купить быстрый стимулятор на одну секунду клавишей U и турбо-стимулятор на шестьсот здоровья клавишей T.",
        shopAndCar: "подходи к магазину на карте клавишей E — там можно купить винтовку, снайперку, быстрые и турбо-стимуляторы, броню или выкупить павших напарников с высадкой на парашюте. Также на карте есть машины, в которые можно садиться клавишей E, аирдропы, ящик Джаггернаута и поза паркура клавишей C в прыжке.",
      };
  }
}

export function secondCrateMessage(tutorial = {}, profile = "auto") {
  const hints = controlHintsFor(profile);
  return tutorial.neededLoot === "armor"
    ? `В первом ящике был автомат. Теперь найди через навигацию ящик с бронёй: ${hints.openMapShort}, выбери его и запусти маршрут.`
    : `В первом ящике была броня. Теперь найди через навигацию ящик с автоматом: ${hints.openMapShort}, выбери его и запусти маршрут.`;
}

export function teamCompletionMessage(damage = {}) {
  if ((Number(damage.armorAbsorbed) || 0) > 0) {
    return "Это был удар по броне. Броня приняла урон, и бот сразу перестал стрелять. Командная часть обучения завершена. Сейчас перейдём к учебной королевской битве.";
  }
  return "Это был урон по здоровью. Бот сразу перестал стрелять. Командная часть обучения завершена. Сейчас перейдём к учебной королевской битве.";
}

export function completionMessage(profile = "auto") {
  const hints = controlHintsFor(profile);
  return `Обучение завершено. Ты освоил движение, стрельбу из пистолета, автомата, винтовки и снайперки, перезарядку, ручной и аварийный парашют, навигацию, сбор добычи, бронепластины и подъём стимулятором. В настоящей королевской битве собирай доллары из ящиков и ${hints.shopAndCar} Следи за безопасной зоной — игра заранее подскажет направление голосом. Сейчас я верну тебя в меню выбора режима.`;
}

export function navigationSelectedMessage(payload = {}, profile = "auto") {
  const name = payload.targetName || "цель";
  const distance = Math.max(0, Math.round(Number(payload.distanceMeters ?? payload.distance) || 0));
  switch (profile) {
    case "touch-gestures":
      return `Выбрано: ${name}. ${distance} метров. Если маршрут уже включён, двигайся по звуковым подсказкам. Иначе сделай смах двумя пальцами вниз, чтобы открыть Карту, и подтверди цель.`;
    case "touch-buttons":
      return `Выбрано: ${name}. ${distance} метров. Если маршрут уже включён, двигайся по звуковым подсказкам. Иначе на сенсорном экране нажми Маршрут или открой Карту и подтверди цель.`;
    case "gamepad-playstation":
    case "gamepad-standard":
      return `Выбрано: ${name}. ${distance} метров. Если маршрут уже включён, двигайся по звуковым подсказкам. Иначе нажми крестовину вниз коротко, чтобы включить маршрут.`;
    case "keyboard":
      return `Выбрано: ${name}. ${distance} метров. Если маршрут уже включён, двигайся по звуковым подсказкам. Иначе на клавиатуре нажми Enter или открой Карту клавишей M.`;
    default:
      return `Выбрано: ${name}. ${distance} метров. Если маршрут уже включён, двигайся по звуковым подсказкам. Иначе на клавиатуре нажми Enter, а на сенсорном экране нажми Маршрут.`;
  }
}

export function tutorialMessageFor(mode, phase, {
  profile = "auto",
  tutorial = {},
  lastIncomingDamage = null,
  announcedEarlyAutoDeploy = false,
} = {}) {
  const hints = controlHintsFor(profile);

  if (mode === "battle-royale") {
    if (phase === "select-second-crate") return secondCrateMessage(tutorial, profile);
    if (phase === "complete") return completionMessage(profile);

    const earlyAutoNotice = "Ты не успел раскрыть парашют вручную, поэтому сработала автоматическая аварийная высадка — в королевской битве она сама страхует тебя перед землёй.";

    switch (phase) {
      case "waiting":
        return "Сейчас начнётся учебная высадка.";
      case "deploy-parachute":
        return `Слышишь сильный поток воздуха. Это свободное падение. Раскрой парашют вручную: ${hints.deployParachute}`;
      case "steer-parachute":
        if (tutorial.autoDeployedEarly) {
          return `${earlyAutoNotice} Если успеешь до посадки, ${hints.steerParachute} либо просто дождись приземления.`;
        }
        return `Купол раскрылся. Шум воздуха изменился, а звук ткани и строп подтверждает раскрытие. Теперь плавно поверни влево или вправо: ${hints.steerParachute}`;
      case "land":
        return "Поворот получился. Теперь просто продолжай снижение. Перед землёй парашют сам начнёт посадочное торможение.";
      case "ground-run": {
        const prefix = tutorial.autoDeployedEarly && !announcedEarlyAutoDeploy ? `${earlyAutoNotice} ` : "";
        return `${prefix}Посадка завершена. Теперь пробеги небольшой участок. ${hints.groundRun} Я продолжу только после нескольких настоящих беговых шагов.`;
      }
      case "automatic-parachute":
        return `Теперь отдельная демонстрация аварийного парашюта. Когда я закончу эту фразу, игра снова поднимет тебя в воздух. ${hints.doNotPressParachute} Игра сама раскроет купол, когда запас высоты станет опасно мал.`;
      case "automatic-parachute-land":
        return "Автоматическое аварийное раскрытие сработало. Запомни этот звук: если в начале падения ты вообще не раскрыл парашют, игра страхует тебя перед землёй. Теперь дождись посадки.";
      case "select-navigation":
        return `Теперь навигация. ${hints.openMap} Выбери цель из списка и подтверди её: маршрут включится сразу.`;
      case "follow-navigation":
        return "Маршрут построен. Двигайся по звуковым подсказкам. Навигация будет сообщать направление и расстояние.";
      case "select-crate":
        return `Теперь выбери в навигации любой ящик (${hints.openMapShort}) и запусти маршрут к нему.`;
      case "follow-crate":
        return "Маршрут к ящику запущен. Дойди до него по звуковым подсказкам.";
      case "interact-first-crate":
        return `Ты у ящика. Открой его. ${hints.interact}`;
      case "follow-second-crate":
        return "Нужный второй ящик выбран. Дойди до него по навигации.";
      case "interact-second-crate":
        return `Ты у второго ящика. Открой его ${hints.interactShort}.`;
      case "select-rifle":
        return `Теперь у тебя есть пистолет и автомат. В настоящей королевской битве в ящиках и магазинах также встречаются дальнобойная винтовка, снайперка и редкие аирдропы. Сейчас переключись на автомат: ${hints.switchWeapon}, пока не услышишь Автомат.`;
      case "armor-break":
        return "Сейчас учебный бот будет стрелять только по тебе. Не отвечай огнём. Слушай попадания в броню и дождись отдельного звука разрушения брони. После этого бот сразу замолчит.";
      case "apply-armor":
        return `Броня разрушена. Чтобы восстановить её, поставь бронепластину. ${hints.applyArmor} Во время установки можно двигаться, но стрельба прервёт установку. Одного запуска хватит для всех доступных пластин.`;
      case "injury-demo":
        return "Броня восстановлена. Теперь бот снова будет стрелять и остановится только когда ты перейдёшь в состояние тяжёлого ранения. Ничего не нажимай и слушай, как меняются звуки урона.";
      case "use-stimulant":
        return `Ты тяжело ранен. Сейчас можно только ползти, а без помощи здоровье будет постепенно уходить. Для самостоятельного подъёма используй стимулятор: ${hints.useStimulant} После запуска не двигайся шесть секунд, иначе лечение прервётся. ${hints.extraStims}`;
      default:
        return null;
    }
  }

  if (phase === "team-complete") return teamCompletionMessage(lastIncomingDamage ?? {});

  switch (phase) {
    case "move-forward":
      return `Учебный командный бой. Сначала обычная ходьба. Иди вперёд примерно пять метров, пока я не дам следующую подсказку. ${hints.moveForward}`;
    case "strafe":
      return `Хорошо. Теперь пройди боком примерно три метра влево или вправо. ${hints.strafe}`;
    case "sprint":
      return profile === "auto"
        ? `Теперь бег. ${hints.sprint}`
        : `Теперь бег. Пробеги примерно десять метров. ${hints.sprint}`;
    case "fire":
      return `Пробежка закончена. Теперь сделай один выстрел. ${hints.fire}`;
    case "hit-enemy":
      return "Теперь попади по боту. Когда пуля попадёт, ты услышишь отдельный звук подтверждения попадания.";
    case "eliminate-enemy":
      return "Попадание есть. Теперь продолжай стрелять по этому противнику, пока не уничтожишь его. Так ты услышишь разницу между обычным попаданием и подтверждением убийства.";
    case "reload":
      return `Противник уничтожен. Пустой магазин теперь перезаряжается автоматически. Для продолжения обучения выполни ручную перезарядку: ${hints.reload}`;
    case "select-marksman":
      return `Отлично. Теперь познакомимся с дальнобойным оружием. Тебе выдана винтовка. Она бьёт на дистанцию до девяноста метров, наносит высокий урон и усиленно пробивает броню. Переключись на винтовку: ${hints.switchWeapon}, пока не услышишь Винтовка.`;
    case "fire-marksman":
      return `Винтовка в руках. Сделай один выстрел ${hints.fireShort} и запомни её мощный отчётливый звук.`;
    case "select-sniper":
      return `Хорошо. Теперь тебе выдана снайперка. Она стреляет на дистанцию до ста пятидесяти метров и одним попаданием раскалывает бронепластины противника. Переключись на Снайперку тем же способом: ${hints.switchWeapon}.`;
    case "fire-sniper":
      return `Снайперка готова. Сделай один выстрел ${hints.fireShort}. После каждого выстрела затвор досылает патрон примерно секунду, поэтому прицеливайся спокойно и точно.`;
    case "receive-hit":
      return "Отлично, с винтовкой и снайперкой разобрались. Теперь ничего не нажимай. Другой учебный бот один раз попадёт в тебя. Послушай звук входящего попадания. Сразу после реального урона бот снова станет пассивным.";
    default:
      return null;
  }
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const controlProfileService = ctx.services.has?.("control-profile")
    ? ctx.services.get("control-profile")
    : null;
  const status = document.querySelector("#tutorial-status");
  let active = false;
  let lastPhase = null;
  let lastIncomingDamage = null;
  let lastTutorial = null;
  let announcedEarlyAutoDeploy = false;
  let pendingAfterSpeech = null;
  let pendingSpeechGeneration = null;
  let pendingAfterSpeechTimer = null;

  function activeControlProfile() {
    return controlProfileService?.effectiveProfile ?? "auto";
  }

  function clearPendingAfterSpeech() {
    if (pendingAfterSpeechTimer != null) clearTimeout(pendingAfterSpeechTimer);
    pendingAfterSpeechTimer = null;
    pendingAfterSpeech = null;
    pendingSpeechGeneration = null;
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
    if (typeof afterSpeech === "function") pendingSpeechGeneration = speech.requestGeneration;
  }

  function presentPhase(tutorial, { force = false, prefix = "" } = {}) {
    const phase = tutorial?.phase;
    if (!active || !phase || (!force && phase === lastPhase)) return;
    lastPhase = phase;
    const profile = activeControlProfile();

    if (tutorial.mode === "battle-royale") {
      if (tutorial.routeCancelled && ["select-navigation", "select-crate", "select-second-crate"].includes(phase)) {
        const next = tutorialMessageFor("battle-royale", phase, { profile, tutorial });
        present(`${prefix}Маршрут отключён. Выбери нужную цель заново. ${next}`);
        return;
      }
      if (tutorial.routeLost && ["select-navigation", "select-crate", "select-second-crate"].includes(phase)) {
        const next = tutorialMessageFor("battle-royale", phase, { profile, tutorial });
        present(`${prefix}Предыдущая цель больше недоступна. Выбери другую цель через Карту. ${next}`);
        return;
      }
      if (phase === "complete") {
        present(`${prefix}${completionMessage(profile)}`, {
          afterSpeech: () => ctx.events.emit("tutorial:battle-royale-section-complete", {}),
        });
        return;
      }

      const text = tutorialMessageFor("battle-royale", phase, {
        profile,
        tutorial,
        announcedEarlyAutoDeploy,
      });
      if ((phase === "steer-parachute" || phase === "ground-run") && tutorial.autoDeployedEarly) {
        announcedEarlyAutoDeploy = true;
      }

      if (phase === "automatic-parachute") {
        present(`${prefix}${text}`, {
          afterSpeech: () => network.send("tutorial:speech-complete", { phase }),
        });
      } else {
        present(`${prefix}${text}`);
      }
      return;
    }

    if (phase === "team-complete") {
      present(`${prefix}${teamCompletionMessage(lastIncomingDamage ?? {})}`, {
        afterSpeech: () => ctx.events.emit("tutorial:team-section-complete", {}),
      });
      return;
    }

    const text = tutorialMessageFor("tdm", phase, { profile, tutorial, lastIncomingDamage });
    present(text ? `${prefix}${text}` : null);
  }

  ctx.events.on("speech:state", ({ reason, requestGeneration } = {}) => {
    if (reason !== "ended" || typeof pendingAfterSpeech !== "function"
      || pendingSpeechGeneration == null || requestGeneration !== pendingSpeechGeneration) return;
    const callback = pendingAfterSpeech;
    clearPendingAfterSpeech();
    callback();
  });

  ctx.events.on("network:welcome", ({ tutorial = false } = {}) => {
    active = Boolean(tutorial);
    lastPhase = null;
    lastIncomingDamage = null;
    lastTutorial = null;
    announcedEarlyAutoDeploy = false;
    clearPendingAfterSpeech();
    if (!active && status) {
      status.hidden = true;
      status.textContent = "";
    }
  });

  ctx.events.on("control-profile:changed", ({ announce = false } = {}) => {
    if (!active || !announce || !lastTutorial?.phase) return;
    if (lastTutorial.phase === "complete" || lastTutorial.phase === "team-complete") return;
    presentPhase(lastTutorial, {
      force: true,
      prefix: "Режим управления обновлён. ",
    });
  });

  ctx.events.on("game:event", (packet) => {
    if (!active) return;
    const payload = packet?.payload ?? {};

    if (packet?.event === "injury:stim-cancelled"
      && payload.entityId === network.playerId && lastPhase === "use-stimulant") {
      present(payload.reason === "no-room-to-stand"
        ? "Здесь недостаточно места, чтобы встать. Стимулятор сохранён. Отползи на свободное место и используй его снова."
        : "Подъём прерван. Стимулятор сохранён. Остановись и попробуй снова.");
      return;
    }

    if (
      packet?.event === "navigation:selected"
      && payload.entityId === network.playerId
      && ["select-navigation", "select-crate", "select-second-crate"].includes(lastPhase)
    ) {
      present(navigationSelectedMessage(payload, activeControlProfile()));
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
