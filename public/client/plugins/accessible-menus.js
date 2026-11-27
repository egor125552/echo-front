export const manifest = {
  id: "accessible-menus",
  requires: ["keyboard-input", "cloudflare-session", "speech-settings", "social-profile-client"],
};

const TWO_FINGER_HOLD_MS = 650;
const TWO_FINGER_MOVE_CANCEL_PX = 28;

function distance2(a, b) {
  return Math.hypot((Number(a?.x) || 0) - (Number(b?.x) || 0), (Number(a?.z) || 0) - (Number(b?.z) || 0));
}

function isTypingTarget(target) {
  return target instanceof Element
    && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isInteractivePageControl(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("#accessible-game-menu")) return false;
  if (target.closest("#settings-panel, #technical-tools, #help-panel, #about-panel, dialog")) return true;
  return Boolean(target.closest("input, textarea, select, button, a, summary, label, [contenteditable='true']"));
}

function neutralizeGameplay(sample = {}) {
  return {
    ...sample,
    forward: 0,
    strafe: 0,
    turn: 0,
    sprint: false,
    fireHeld: false,
    firePressed: false,
    reload: false,
    selectDelta: 0,
    platePressed: false,
    stimulantPressed: false,
    fastStimulantPressed: false,
    turboStimulantPressed: false,
    interactPressed: false,
    parachutePressed: false,
    posePressed: false,
    crouchPressed: false,
    minePressed: false,
    nukePressed: false,
    nukeCycleDelta: 0,
    nukeCancelPressed: false,
    electroModePressed: false,
    electroJumpPressed: false,
    electroJumpHeld: false,
    electroJumpReleased: false,
    jumpPressed: false,
    navigationNextPressed: false,
    navigationTogglePressed: false,
  };
}

function createMenuUi() {
  const section = document.createElement("section");
  section.id = "accessible-game-menu";
  section.hidden = true;
  section.setAttribute("role", "dialog");
  section.setAttribute("aria-modal", "true");
  section.setAttribute("aria-labelledby", "accessible-game-menu-title");
  section.innerHTML = `
    <h2 id="accessible-game-menu-title">Меню</h2>
    <p id="accessible-game-menu-help">Каждый пункт меню — кнопка. Можно нажать пальцем или двойным касанием VoiceOver. В режиме жестов смах вверх и вниз по всему меню перелистывает пункты, короткое касание выбирает активный пункт, смах влево возвращает назад, смах вправо возвращает в игру.</p>
    <button id="accessible-game-menu-resume" type="button">Вернуться в игру</button>
    <ul id="accessible-game-menu-list"></ul>
    <p id="accessible-game-menu-status" role="status" aria-live="assertive" aria-atomic="true"></p>
  `;
  document.body.append(section);
  return {
    section,
    title: section.querySelector("#accessible-game-menu-title"),
    list: section.querySelector("#accessible-game-menu-list"),
    resume: section.querySelector("#accessible-game-menu-resume"),
    status: section.querySelector("#accessible-game-menu-status"),
  };
}

function createMobileButtons() {
  const controls = document.querySelector("#touch-controls");
  if (!controls) return {};
  const row = document.createElement("div");
  row.className = "touch-actions touch-menu-actions";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Меню и карта");
  const menu = document.createElement("button");
  menu.type = "button";
  menu.textContent = "Меню";
  menu.dataset.accessibleMenu = "main";
  const map = document.createElement("button");
  map.type = "button";
  map.textContent = "Карта";
  map.dataset.accessibleMenu = "map";
  const squad = document.createElement("button");
  squad.type = "button";
  squad.textContent = "Отряд и инвентарь";
  squad.dataset.accessibleMenu = "squad";
  row.append(menu, map, squad);
  controls.prepend(row);

  const legacyNext = controls.querySelector('[data-navigation-action="next"]');
  const legacyToggle = controls.querySelector('[data-navigation-action="toggle"]');
  if (legacyNext) legacyNext.hidden = true;
  if (legacyToggle) legacyToggle.hidden = true;
  return { menu, map, squad };
}

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const social = ctx.services.get("social-profile");
  const ui = createMenuUi();
  const mobile = createMobileButtons();
  const originalSample = input.sample.bind(input);

  let latestSnapshot = null;
  let open = false;
  let screen = null;
  let index = 0;
  let stack = [];
  let pendingNavigation = null;
  let pendingRoomRule = null;
  let pendingShopBuy = null;
  let pendingSquadOrder = null;
  let pendingInventoryAction = null;
  let pendingSpecialAction = null;
  const parcelItems = new Map(); // itemId -> quantity
  const parcelRecipients = new Set(); // squadmate entityId
  let suppressDownUntilRelease = false;
  let gamepadFrame = 0;
  let previousPadButtons = new Map();
  let twoFingerTimer = null;
  let twoFingerStart = null;
  let focusBeforeMenu = null;
  let menuSwipeStart = null;
  let suppressMenuClickUntil = 0;

  function nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function announce(text, { interrupt = true } = {}) {
    const value = String(text ?? "").trim();
    if (!value) return;
    ui.status.textContent = "";
    requestAnimationFrame(() => { ui.status.textContent = value; });
    speech.say(value, { interrupt });
  }

  function currentItems() {
    return Array.isArray(screen?.items) ? screen.items : [];
  }

  function selectedItem() {
    return currentItems()[index] ?? null;
  }

  function itemSpeech(item = selectedItem()) {
    if (!item) return "Список пуст.";
    const items = currentItems();
    return `${item.label}. ${index + 1} из ${items.length}.`;
  }

  function render({ announceTitle = false } = {}) {
    if (!screen) return;
    const items = currentItems();
    if (index >= items.length) index = Math.max(0, items.length - 1);
    ui.title.textContent = screen.title;
    ui.list.replaceChildren();
    items.forEach((item, itemIndex) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.dataset.menuIndex = String(itemIndex);
      if (itemIndex === index) button.setAttribute("aria-current", "true");
      button.addEventListener("focus", () => {
        index = itemIndex;
        for (const el of ui.list.querySelectorAll("button")) {
          if (el === button) el.setAttribute("aria-current", "true");
          else el.removeAttribute("aria-current");
        }
      });
      button.addEventListener("click", () => {
        if (nowMs() < suppressMenuClickUntil) return;
        index = itemIndex;
        void item.action?.();
      });
      li.append(button);
      ui.list.append(li);
    });
    // Each menu entry is a native button, so both taps and VoiceOver activation
    // execute the action rather than merely changing a listbox selection.
    const activeButton = ui.list.querySelector(`[data-menu-index="${index}"]`);
    activeButton?.focus({ preventScroll: true });
    activeButton?.scrollIntoView?.({ block: "nearest" });
    if (announceTitle) {
      announce(items.length ? `${screen.title}. ${itemSpeech()}` : `${screen.title}. Список пуст.`);
    } else if (items.length) {
      announce(itemSpeech());
    }
  }

  function setModal(value) {
    const next = Boolean(value);
    if (open === next) return;
    open = next;
    if (open) focusBeforeMenu = document.activeElement;
    ui.section.hidden = !open;
    const page = document.querySelector("main");
    if (page) {
      page.inert = open;
      if (open) page.setAttribute("aria-hidden", "true");
      else page.removeAttribute("aria-hidden");
    }
    if (open) {
      input.disable();
      ctx.events.emit("input:gamepad-turn", { turn: 0, reason: "menu-open" });
    } else {
      if (network.connected) input.enable();
      if (focusBeforeMenu?.isConnected && typeof focusBeforeMenu.focus === "function") {
        try { focusBeforeMenu.focus({ preventScroll: true }); }
        catch { focusBeforeMenu.focus(); }
      }
      focusBeforeMenu = null;
    }
    ctx.events.emit("ui:menu", { open, id: screen?.id ?? null });
  }

  function closeMenu({ announceClose = true } = {}) {
    if (!open) return;
    screen = null;
    stack = [];
    index = 0;
    menuSwipeStart = null;
    setModal(false);
    if (announceClose) announce("Меню закрыто.");
  }

  function show(next, { push = false } = {}) {
    if (push && screen) stack.push({ screen, index });
    screen = next;
    index = 0;
    setModal(true);
    render({ announceTitle: true });
  }

  function goBack() {
    if (!open) return;
    const previous = stack.pop();
    if (!previous) {
      closeMenu();
      return;
    }
    screen = previous.screen;
    index = previous.index;
    render({ announceTitle: true });
  }

  function roomSocial() {
    return latestSnapshot?.social ?? null;
  }

  function isRoomHost() {
    const state = roomSocial();
    return Boolean(state?.isHost || (state?.hostId && state.hostId === network.playerId));
  }

  function friendRamProtectionEnabled() {
    return roomSocial()?.rules?.friendRamProtection !== false;
  }

  function nearbyPlayers() {
    const self = latestSnapshot?.entities?.find((entity) => entity.id === network.playerId) ?? null;
    return (latestSnapshot?.entities ?? [])
      .filter((entity) => entity && entity.id !== network.playerId && !entity.bot && entity.alive !== false)
      .map((entity) => ({
        id: entity.id,
        name: String(entity.name || "Игрок"),
        distance: self ? distance2(self, entity) : Infinity,
      }))
      .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, "ru"));
  }

  function settingsScreen() {
    const hasHaptics = typeof ctx.services?.has === "function" && ctx.services.has("haptic-feedback");
    const haptics = hasHaptics ? ctx.services.get("haptic-feedback") : null;
    const hasTouchSettings = typeof ctx.services?.has === "function" && ctx.services.has("touch-control-settings");
    const touchSettings = hasTouchSettings ? ctx.services.get("touch-control-settings") : null;
    const hasEnemyAi = typeof ctx.services?.has === "function" && ctx.services.has("enemy-ai-settings");
    const enemyAi = hasEnemyAi ? ctx.services.get("enemy-ai-settings") : network;
    const speechEnabled = Boolean(speech?.enabled);
    const speechRate = Number(speech?.rate) || 1.7;
    const hapticsEnabled = haptics ? Boolean(haptics.enabled) : true;
    const hapticsPercent = Math.round((Number(haptics?.intensity) || 1) * 100);
    const touchMode = touchSettings?.mode ?? document.documentElement.dataset.touchMode ?? "buttons";
    const isAi = (enemyAi?.mode ?? enemyAi?.enemyAiMode) === "ai";

    const refreshSettings = (focusIndex, message) => {
      screen = settingsScreen();
      index = focusIndex;
      render();
      if (message) announce(message);
    };

    const items = [
      {
        label: `Игровая озвучка: ${speechEnabled ? "включена" : "выключена"}`,
        action: () => {
          const next = !Boolean(speech?.enabled);
          if (typeof speech?.setEnabled === "function") {
            speech.setEnabled(next, { announce: false });
          } else {
            const box = document.querySelector("#speech-enabled");
            if (box) {
              box.checked = next;
              box.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
          screen = settingsScreen();
          index = 0;
          render();
          if (next) announce("Игровая озвучка включена.");
        },
      },
      {
        label: `Скорость речи: ${speechRate.toFixed(1)}× (нажмите, чтобы изменить)`,
        action: () => {
          const current = Number(speech?.rate) || 1.7;
          const next = current >= 2.45 ? 0.9 : Math.min(2.5, Math.round((current + 0.2) * 10) / 10);
          if (typeof speech?.setRate === "function") {
            speech.setRate(next);
          } else {
            const slider = document.querySelector("#speech-rate");
            if (slider) {
              slider.value = String(next);
              slider.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          refreshSettings(1, `Скорость речи ${next.toFixed(1)}.`);
        },
      },
      {
        label: "Проверить игровой голос",
        action: () => {
          speech.say("Проверка игровой озвучки. Скорость речи настроена.", { interrupt: true });
        },
      },
    ];

    if (haptics) {
      const hapticsToggleIndex = items.length;
      items.push({
        label: `Вибрация: ${hapticsEnabled ? "включена" : "выключена"}`,
        action: () => {
          const next = !Boolean(haptics.enabled);
          haptics.setEnabled?.(next);
          refreshSettings(hapticsToggleIndex, `Вибрация ${next ? "включена" : "выключена"}.`);
        },
      });
      const hapticsStrengthIndex = items.length;
      items.push({
        label: `Сила вибрации: ${hapticsPercent}% (нажмите, чтобы изменить)`,
        action: () => {
          const current = Math.round((Number(haptics.intensity) || 1) * 100);
          const nextPercent = current >= 100 ? 20 : Math.min(100, current + 20);
          haptics.setIntensity?.(nextPercent / 100);
          refreshSettings(hapticsStrengthIndex, `Сила вибрации ${nextPercent} процентов.`);
        },
      });
      items.push({
        label: "Проверить вибрацию",
        action: () => {
          haptics.test?.("default");
          announce("Проверка вибрации.");
        },
      });
    }

    if (touchSettings) {
      const touchIndex = items.length;
      items.push({
        label: `Управление на iPhone: ${touchMode === "gestures" ? "Жесты на весь экран" : "Кнопки"}`,
        action: () => {
          const next = touchSettings.mode === "gestures" ? "buttons" : "gestures";
          touchSettings.setMode(next);
          refreshSettings(
            touchIndex,
            next === "gestures" ? "Включены жесты на весь экран." : "Включено управление кнопками.",
          );
        },
      });
    }

    const aiIndex = items.length;
    items.push({
      label: `Режим ботов: ${isAi ? "Боты с ИИ (враги и напарники)" : "Обычные боты"}`,
      action: () => {
        const next = isAi ? "standard" : "ai";
        if (typeof enemyAi?.setMode === "function") enemyAi.setMode(next);
        else network.setEnemyAiMode?.(next);
        refreshSettings(
          aiIndex,
          next === "ai"
            ? "Включён режим: боты с ИИ (враги и напарники)."
            : "Включён режим: обычные боты.",
        );
      },
    });

    items.push({ label: "Назад", action: goBack });

    return {
      id: "settings",
      title: "Настройки звука и управления",
      items,
    };
  }

  function mainScreen() {
    const hasEnemyAi = typeof ctx.services?.has === "function" && ctx.services.has("enemy-ai-settings");
    const enemyAi = hasEnemyAi
      ? ctx.services.get("enemy-ai-settings")
      : network;
    const isAi = (enemyAi?.mode ?? enemyAi?.enemyAiMode) === "ai";
    const items = [
      ...(network.mode === "battle-royale"
        ? [{ label: "Карта", action: () => show(mapScreen(), { push: true }) }]
        : []),
      { label: "Друзья", action: () => show(friendsScreen(), { push: true }) },
      ...(network.mode === "battle-royale"
        ? [{ label: "Отряд и инвентарь", action: () => show(squadHubScreen(), { push: true }) }]
        : []),
      { label: "Настройки звука и управления", action: () => show(settingsScreen(), { push: true }) },
      {
        id: "bot-mode",
        label: `Режим ботов: ${isAi ? "Боты с ИИ (враги и напарники)" : "Обычные боты"}`,
        action: () => {
          const next = isAi ? "standard" : "ai";
          if (typeof enemyAi?.setMode === "function") enemyAi.setMode(next);
          else network.setEnemyAiMode?.(next);
          announce(next === "ai"
            ? "Включён режим: боты с ИИ (враги и напарники)."
            : "Включён режим: обычные боты.");
          screen = mainScreen();
          const botIdx = screen.items.findIndex((item) => item.id === "bot-mode");
          index = botIdx >= 0 ? botIdx : 0;
          render();
        },
      },
    ];
    if (isRoomHost()) {
      items.push({ label: "Настройки комнаты", action: () => show(roomSettingsScreen(), { push: true }) });
    }
    const self = latestSnapshot?.entities?.find((entity) => entity.id === network.playerId) ?? null;
    const canRestartBr = network.mode === "battle-royale"
      && !network.tutorial
      && Boolean(self && (!self.alive || latestSnapshot?.spectator?.active || latestSnapshot?.match?.ended));
    if (canRestartBr) {
      items.unshift({
        label: "Начать новый матч",
        action: () => {
          closeMenu({ announceClose: false });
          ctx.events.emit("match:restart-requested", { mode: "battle-royale" });
        },
      });
    }
    items.unshift({ label: "Продолжить игру", action: () => closeMenu() });
    return {
      id: "main",
      title: "Главное меню",
      items,
    };
  }

  function roomSettingsScreen() {
    const enabled = friendRamProtectionEnabled();
    return {
      id: "room-settings",
      title: "Настройки комнаты. Вы главный организатор",
      items: [
        {
          label: `Защита друзей от тарана: ${enabled ? "включена" : "выключена"}`,
          action: () => {
            const next = !friendRamProtectionEnabled();
            pendingRoomRule = { key: "friendRamProtection", value: next };
            if (latestSnapshot?.social?.rules) latestSnapshot.social.rules.friendRamProtection = next;
            ctx.events.emit("input:changed", { reason: "social:room-rule:friendRamProtection" });
            announce(`Защита друзей от тарана ${next ? "включена" : "выключена"}.`);
            screen = roomSettingsScreen();
            index = 0;
            render();
          },
        },
        { label: "Назад", action: goBack },
      ],
    };
  }

  function friendsScreen() {
    return {
      id: "friends",
      title: "Друзья",
      items: [
        { label: "Игроки рядом", action: () => show(nearbyScreen(), { push: true }) },
        { label: `Мои друзья, ${social.friends.length}`, action: () => show(savedFriendsScreen(), { push: true }) },
        { label: "Назад", action: goBack },
      ],
    };
  }

  function nearbyScreen() {
    const players = nearbyPlayers();
    const available = players.filter((player) => !social.isFriend(player.id));
    return {
      id: "nearby",
      title: "Игроки рядом",
      items: available.length
        ? available.map((player) => ({
          label: `${player.name}. ${Math.max(0, Math.round(player.distance))} метров`,
          action: () => show({
            id: "nearby-player",
            title: player.name,
            items: [
              {
                label: "Добавить в друзья",
                action: async () => {
                  const added = await social.addFriend(player);
                  announce(added ? `${player.name} добавлен в друзья.` : `${player.name} уже в друзьях.`);
                  screen = nearbyScreen();
                  index = 0;
                  render({ announceTitle: true });
                },
              },
              { label: "Назад", action: goBack },
            ],
          }, { push: true }),
        }))
        : [{ label: "Нет игроков для добавления", action: () => announce("Игроков рядом для добавления нет.") }],
    };
  }

  function savedFriendsScreen() {
    const friends = social.friends;
    return {
      id: "saved-friends",
      title: "Мои друзья",
      items: friends.length
        ? friends.map((friend) => ({
          label: friend.name || "Игрок",
          action: () => show({
            id: "friend-actions",
            title: friend.name || "Игрок",
            items: [
              {
                label: "Удалить из друзей",
                action: async () => {
                  const removed = await social.removeFriend(friend.id);
                  announce(removed ? `${friend.name || "Игрок"} удалён из друзей.` : "Друг уже удалён.");
                  screen = savedFriendsScreen();
                  index = 0;
                  render({ announceTitle: true });
                },
              },
              { label: "Назад", action: goBack },
            ],
          }, { push: true }),
        }))
        : [{ label: "Список друзей пуст", action: () => announce("Список друзей пуст.") }],
    };
  }

  function mapScreen() {
    const items = Array.isArray(latestSnapshot?.navigation?.items)
      ? latestSnapshot.navigation.items
      : [];
    return {
      id: "map",
      title: "Карта",
      items: items.length
        ? items.map((target) => ({
          targetId: String(target.id),
          label: `${target.name || "Точка"}. ${Math.max(0, Math.round(Number(target.distance) || 0))} метров${target.outsideSafeZone ? ". За пределами безопасной зоны" : ""}`,
          action: () => {
            pendingNavigation = {
              targetId: String(target.id),
              activate: true,
            };
            ctx.events.emit("input:changed", { reason: "map:select" });
            announce(`Выбрано: ${target.name || "точка"}. Маршрут включён.`);
            closeMenu({ announceClose: false });
          },
        }))
        : [{ label: "Нет доступных точек", action: () => announce("На карте сейчас нет доступных точек.") }],
    };
  }

  function shopScreen() {
    const shopState = latestSnapshot?.shop ?? {};
    const self = latestSnapshot?.entities?.find((entity) => entity.id === network.playerId) ?? null;
    const cash = Math.max(0, Math.round(Number(shopState.cash ?? self?.cash) || 0));
    const nearbyShop = shopState.nearbyShop ?? null;
    const prices = shopState.prices ?? {};
    const buybackCost = Number(prices.buyback) || 1500;
    const fastCost = Number(prices.fastStimulant) || 900;
    const turboCost = Number(prices.turboStimulant) || 1800;
    const platesCost = Number(prices.armorPlates) || 600;
    const marksmanCost = Number(prices.marksman) || 700;
    const sniperCost = Number(prices.sniper) || 1100;
    const juggernautDropCost = Number(prices.juggernautDrop) || 2200;
    const minesCost = Number(prices.mines) || 450;
    const miniNukeCost = Number(prices.miniNuke) || 2500;
    const electroDropCost = Number(prices.electroDrop) || 3000;
    const cannonCost = Number(prices.cannon) || 1800;
    const specialOps = latestSnapshot?.specialOps ?? {};
    const marksmanOwned = Boolean(shopState.marksmanOwned ?? self?.weapons?.includes?.("marksman"));
    const sniperOwned = Boolean(shopState.sniperOwned ?? self?.weapons?.includes?.("sniper"));
    const cannonOwned = Boolean(shopState.cannonOwned ?? specialOps.hasCannon ?? self?.weapons?.includes?.("cannon"));
    const deadMates = Array.isArray(shopState.deadTeammates) ? shopState.deadTeammates : [];
    const turboPurchased = Number(shopState.turboPurchasedCount ?? self?.turboPurchasedCount) || 0;
    const turboLimit = Number(shopState.turboPurchaseLimit ?? self?.turboPurchaseLimit) || 3;
    const turboLeftToBuy = Math.max(0, turboLimit - turboPurchased);

    const queueBuy = (itemId, targetId = null) => {
      pendingShopBuy = {
        shopId: nearbyShop?.id ?? null,
        itemId,
        ...(targetId ? { targetId } : {}),
      };
      ctx.events.emit("input:changed", { reason: `shop:buy:${itemId}` });
    };

    const items = [];
    for (const mate of deadMates) {
      items.push({
        label: `Выкупить напарника (${mate.name || "Напарник"}) — ${buybackCost} долларов`,
        action: () => queueBuy("buyback", mate.id),
      });
    }
    items.push({
      label: `Вызвать сброс «Электрический Лукашенко» (800 HP, 800 брони, электро-автомат, мини-ядерка) — ${electroDropCost} долларов`,
      action: () => queueBuy("electro-drop"),
    });
    items.push({
      label: `Вызвать сброс Джаггернаута (600 брони, 700 здоровья, гора стимуляторов — стягивает всех врагов) — ${juggernautDropCost} долларов`,
      action: () => queueBuy("juggernaut-drop"),
    });
    items.push({
      label: cannonOwned
        ? `Ядра для эксклюзивной пушки «Смертонос» (+20 ядер) — ${cannonCost} долларов`
        : `Эксклюзивная пушка «Смертонос» (700 м, 5 режимов, запускает машины и врагов в воздух) — ${cannonCost} долларов`,
      action: () => queueBuy("cannon"),
    });
    items.push({
      label: `Мини-ядерка (+1000 ударов по выбранной точке, в запасе ${specialOps.miniNukes ?? 0}) — ${miniNukeCost} долларов`,
      action: () => queueBuy("mini-nuke"),
    });
    items.push({
      label: `Мины (+2 штуки, в запасе ${specialOps.mines ?? 0} из ${specialOps.maxMines ?? 6}) — ${minesCost} долларов`,
      action: () => queueBuy("mines"),
    });
    items.push({
      label: `Усиленный стимулятор (подъём за 1 секунду) — ${fastCost} долларов (в запасе ${self?.fastStimulants ?? 0})`,
      action: () => queueBuy("fast-stimulant"),
    });
    items.push({
      label: turboLeftToBuy > 0
        ? `Усиленный стимулятор турбо (600 здоровья, осталось купить ${turboLeftToBuy} из ${turboLimit}) — ${turboCost} долларов`
        : `Усиленный стимулятор турбо (лимит ${turboLimit} из ${turboLimit} исчерпан)`,
      action: () => {
        if (turboLeftToBuy <= 0) {
          announce(`Больше купить нельзя: достигнут предел ${turboLimit} из ${turboLimit}.`);
          return;
        }
        queueBuy("turbo-stimulant");
      },
    });
    items.push({
      label: `Комплект бронепластин (3 штуки) — ${platesCost} долларов`,
      action: () => queueBuy("armor-plates"),
    });
    items.push({
      label: marksmanOwned
        ? `Патроны для винтовки (+24) — ${marksmanCost} долларов`
        : `Винтовка — ${marksmanCost} долларов`,
      action: () => queueBuy("marksman"),
    });
    items.push({
      label: sniperOwned
        ? `Патроны для снайперки (+10) — ${sniperCost} долларов`
        : `Снайперка — ${sniperCost} долларов`,
      action: () => queueBuy("sniper"),
    });
    const activeBounty = shopState.activeBounty ?? null;
    items.push({
      label: activeBounty
        ? `Контракт «Охота за головами» (цель: ${activeBounty.targetName}, ${activeBounty.distance} м, награда +1000 долларов) — обновить бесплатно`
        : "Контракт «Охота за головами» (отметить ближайшего врага на карте, награда +1000 долларов) — бесплатно",
      action: () => queueBuy("bounty-contract"),
    });
    items.push({
      label: "Закрыть магазин",
      action: () => closeMenu(),
    });

    return {
      id: "shop",
      title: `${nearbyShop?.name || "Магазин"}. Баланс: ${cash} долларов`,
      items,
    };
  }

  function squadMenuData() {
    const data = latestSnapshot?.squadMenu ?? {};
    const inventory = data.inventory ?? { categories: [], items: [] };
    const squadmates = Array.isArray(data.squadmates) ? data.squadmates : [];
    return {
      categories: Array.isArray(inventory.categories) ? inventory.categories : [],
      items: Array.isArray(inventory.items) ? inventory.items : [],
      squadmates,
    };
  }

  function queueSquadOrder(order, targetIds = null) {
    pendingSquadOrder = {
      order,
      ...(Array.isArray(targetIds) && targetIds.length ? { targetIds } : {}),
    };
    ctx.events.emit("input:changed", { reason: `squad:order:${order}` });
  }

  function queueInventoryAction(action) {
    pendingInventoryAction = action;
    ctx.events.emit("input:changed", { reason: `inventory:${action?.type ?? "action"}` });
  }

  function queueSpecialAction(action) {
    pendingSpecialAction = action;
    ctx.events.emit("input:changed", { reason: `special:${action?.type ?? "action"}` });
  }

  function arsenalScreen() {
    const ops = latestSnapshot?.specialOps ?? {};
    const mines = Number(ops.mines) || 0;
    const maxMines = Number(ops.maxMines) || 6;
    const nukes = Number(ops.miniNukes) || 0;
    const hasElectro = Boolean(ops.hasElectroRifle);
    const modeLabel = ops.electroMode?.label || "Шок (ломает броню и подбрасывает)";
    const nukeDistLabel = ops.nukeDistance?.label || "Средне (215 метров — безопасно)";
    const items = [
      {
        label: `Поставить мину под ноги (осталось ${mines} из ${maxMines})`,
        action: () => {
          queueSpecialAction({ type: "plant-mine" });
          closeMenu({ announceClose: false });
        },
      },
      {
        label: ops.nukeAiming
          ? `Запустить мини-ядерку сейчас! Дистанция: ${nukeDistLabel}`
          : `Мини-ядерка: навести удар (радиус 185 м, осталось ${nukes})`,
        action: () => {
          queueSpecialAction({ type: ops.nukeAiming ? "nuke-launch" : "nuke-aim" });
          closeMenu({ announceClose: false });
        },
      },
      {
        label: "Запустить мини-ядерку: Под себя (4 м — смертельно опасно!)",
        action: () => {
          queueSpecialAction({ type: "nuke-launch", distanceMeters: 4 });
          closeMenu({ announceClose: false });
        },
      },
      {
        label: "Запустить мини-ядерку: Близко (115 м вперёд — край ударной волны)",
        action: () => {
          queueSpecialAction({ type: "nuke-launch", distanceMeters: 115 });
          closeMenu({ announceClose: false });
        },
      },
      {
        label: "Запустить мини-ядерку: Средне (215 м вперёд — безопасно)",
        action: () => {
          queueSpecialAction({ type: "nuke-launch", distanceMeters: 215 });
          closeMenu({ announceClose: false });
        },
      },
      {
        label: "Запустить мини-ядерку: Далеко (320 м вперёд)",
        action: () => {
          queueSpecialAction({ type: "nuke-launch", distanceMeters: 320 });
          closeMenu({ announceClose: false });
        },
      },
      ...(hasElectro
        ? [{
            label: `Сменить режим электро-автомата (сейчас: ${modeLabel})`,
            action: () => {
              queueSpecialAction({ type: "cycle-electro-mode" });
              closeMenu({ announceClose: false });
            },
          }]
        : [{
            label: "Электро-автомат (нет — найди в бункере Резиденции или закажи в магазине)",
            action: () => announce("Электро-автомата пока нет. Его можно забрать в бункере Резиденции или заказать сброс груза в магазине."),
          }]),
      ...(ops.hasCannon
        ? [
            {
              label: `Пушка «Смертонос»: сменить режим (сейчас: ${ops.cannonMode?.shortLabel || "Ударное ядро"})`,
              action: () => {
                queueSpecialAction({ type: "cycle-cannon-mode" });
                closeMenu({ announceClose: false });
              },
            },
            {
              label: "Смертонос — Режим 1: Стандартный (ударное ядро на 700 м)",
              action: () => {
                queueSpecialAction({ type: "set-cannon-mode", modeId: "standard" });
                closeMenu({ announceClose: false });
              },
            },
            {
              label: "Смертонос — Режим 2: Картечь-веер (7 ядер по толпе)",
              action: () => {
                queueSpecialAction({ type: "set-cannon-mode", modeId: "shrapnel" });
                closeMenu({ announceClose: false });
              },
            },
            {
              label: "Смертонос — Режим 3: Сквозной бронебой (пробивает стены и машины насквозь)",
              action: () => {
                queueSpecialAction({ type: "set-cannon-mode", modeId: "piercing" });
                closeMenu({ announceClose: false });
              },
            },
            {
              label: "Смертонос — Режим 4: Зарядный (удерживай огонь R2 и отпусти)",
              action: () => {
                queueSpecialAction({ type: "set-cannon-mode", modeId: "charged" });
                closeMenu({ announceClose: false });
              },
            },
            {
              label: "Смертонос — Режим 5: Залповый (5 тяжёлых ядер подряд)",
              action: () => {
                queueSpecialAction({ type: "set-cannon-mode", modeId: "salvo" });
                closeMenu({ announceClose: false });
              },
            },
          ]
        : [{
            label: "Пушка «Смертонос» (эксклюзив — магазин 1800 долларов, Джаггернаут или Электрический Лукашенко)",
            action: () => announce("Эксклюзивная пушка Смертонос доступна в магазине за 1800 долларов, а также в сбросах Джаггернаута и Электрического Лукашенко."),
          }]),
      { label: "Назад", action: goBack },
    ];
    return {
      id: "special-arsenal",
      title: `Спецарсенал. Мины: ${mines}, мини-ядерки: ${nukes}`,
      items,
    };
  }

  function bunkerPuzzleScreen(override = null) {
    const puzzle = override ?? latestSnapshot?.specialOps?.bunkerPuzzle ?? null;
    const stage = Number(puzzle?.stage) || 1;
    const totalStages = Number(puzzle?.totalStages) || 3;
    const hint = puzzle?.hint || "Подбери пару контактов по подсказке";
    const switches = Array.isArray(puzzle?.switches) && puzzle.switches.length
      ? puzzle.switches
      : [
          { id: 1, label: "Контакт 1 (север, низкий гул)" },
          { id: 2, label: "Контакт 2 (восток, искра)" },
          { id: 3, label: "Контакт 3 (юг, высокий писк)" },
          { id: 4, label: "Контакт 4 (запад, двойной щелчок)" },
        ];
    const items = switches.map((sw) => ({
      label: `Замкнуть ${sw.label}`,
      action: () => {
        queueSpecialAction({ type: "bunker-puzzle-step", switchId: sw.id });
      },
    }));
    items.push({ label: "Повторить подсказку", action: () => announce(`Этап ${stage} из ${totalStages}. ${hint}`) });
    items.push({ label: "Отойти от замка", action: () => closeMenu() });
    return {
      id: "bunker-puzzle",
      title: `Адаптивный замок бункера (${stage}/${totalStages}). ${hint}`,
      items,
    };
  }

  function quantityPresetsFor(item) {
    const available = Math.max(0, Math.floor(Number(item?.quantity) || 0));
    if (available <= 0) return [];
    const step = Math.max(1, Math.floor(Number(item?.unitStep) || 1));
    const values = [];
    const pushUnique = (qty, label) => {
      const clamped = Math.max(1, Math.min(available, Math.floor(qty)));
      if (values.some((entry) => entry.qty === clamped)) return;
      values.push({ qty: clamped, label });
    };
    if (step === 1) {
      pushUnique(1, "1 шт.");
      if (available >= 2) pushUnique(2, "2 шт.");
      if (available >= 3) pushUnique(3, "3 шт.");
      if (available >= 4) pushUnique(Math.floor(available / 2), `Половину (${Math.floor(available / 2)} шт.)`);
      if (available > 1) pushUnique(available, `Все (${available} шт.)`);
    } else {
      pushUnique(step, `${Math.min(available, step)} шт.`);
      if (available > step) pushUnique(step * 2, `${Math.min(available, step * 2)} шт.`);
      if (available >= step * 2) pushUnique(Math.floor(available / 2), `Половину (${Math.floor(available / 2)} шт.)`);
      if (available > step) pushUnique(available, `Все (${available} шт.)`);
    }
    return values;
  }

  function squadHubScreen() {
    const { items, squadmates } = squadMenuData();
    const aliveMates = squadmates.filter((m) => m.alive && !m.downed);
    const parcelCount = [...parcelItems.values()].reduce((acc, qty) => acc + qty, 0);
    const ops = latestSnapshot?.specialOps ?? {};
    return {
      id: "squad-hub",
      title: `Отряд и инвентарь. Напарников в строю: ${aliveMates.length}`,
      items: [
        {
          label: `Команды напарникам (${aliveMates.length} в строю)`,
          action: () => show(squadOrderScopeScreen(), { push: true }),
        },
        {
          label: `Инвентарь по категориям (${items.length} поз., без денег)`,
          action: () => show(inventoryCategoriesScreen(), { push: true }),
        },
        {
          label: `Спецарсенал: мины (${ops.mines ?? 0}), мини-ядерки (${ops.miniNukes ?? 0}), электро-автомат`,
          action: () => show(arsenalScreen(), { push: true }),
        },
        {
          label: parcelCount > 0
            ? `Собрать посылку нескольким напарникам (в посылке: ${parcelCount} шт.)`
            : "Собрать посылку нескольким напарникам",
          action: () => show(batchTransferScreen(), { push: true }),
        },
        {
          label: "Состояние напарников",
          action: () => show(squadStatusScreen(), { push: true }),
        },
        { label: "Вернуться в игру", action: () => closeMenu() },
      ],
    };
  }

  function squadOrderScopeScreen() {
    const { squadmates } = squadMenuData();
    const aliveMates = squadmates.filter((m) => m.alive && !m.downed);
    const items = [];
    if (!aliveMates.length) {
      items.push({
        label: "Нет живых напарников для выполнения команд",
        action: () => announce("Сейчас нет живых напарников."),
      });
    } else {
      items.push({
        label: `Всем напарникам (${aliveMates.length})`,
        action: () => show(squadOrderActionScreen(null, "Всем напарникам"), { push: true }),
      });
      for (const mate of aliveMates) {
        const distText = mate.distanceMeters != null ? `, ${Math.round(mate.distanceMeters)} м` : "";
        const coverText = mate.inCover && mate.coverLabel ? `, ${mate.coverLabel}` : "";
        items.push({
          label: `${mate.name}${distText}${coverText}`,
          action: () => show(squadOrderActionScreen([mate.id], mate.name), { push: true }),
        });
      }
    }
    items.push({ label: "Назад", action: goBack });
    return {
      id: "squad-order-scope",
      title: "Кому отдать команду",
      items,
    };
  }

  function squadOrderActionScreen(targetIds, scopeLabel) {
    const send = (order) => {
      queueSquadOrder(order, targetIds);
      closeMenu({ announceClose: false });
    };
    return {
      id: "squad-order-actions",
      title: `Команда: ${scopeLabel}`,
      items: [
        { label: "Идти туда (вперёд по направлению взгляда)", action: () => send("move") },
        { label: "Ко мне (следовать за мной)", action: () => send("follow") },
        { label: "В укрытие (присесть за машиной или стеной)", action: () => send("cover") },
        { label: "Атаковать свободно", action: () => send("attack") },
        { label: "Держать позицию", action: () => send("hold") },
        { label: "Назад", action: goBack },
      ],
    };
  }

  function squadStatusScreen() {
    const { squadmates } = squadMenuData();
    const items = squadmates.length
      ? squadmates.map((mate) => {
          const stance = mate.inCover && mate.coverLabel
            ? `присел ${mate.coverLabel}`
            : (mate.crouching ? "присел" : "стоит");
          const order = mate.orderLabel ? `, команда: ${mate.orderLabel}` : "";
          const dist = mate.distanceMeters != null ? `, ${Math.round(mate.distanceMeters)} м` : "";
          const stateText = mate.downed ? "в нокауте" : `здоровье ${mate.health}, броня ${mate.armor}, ${stance}`;
          return {
            label: `${mate.name}: ${stateText}${dist}${order}`,
            action: () => announce(`${mate.name}: ${stateText}${dist}${order}`),
          };
        })
      : [{ label: "Живых напарников сейчас нет", action: () => announce("Живых напарников сейчас нет.") }];
    items.push({ label: "Назад", action: goBack });
    return {
      id: "squad-status",
      title: "Состояние отряда",
      items,
    };
  }

  function inventoryCategoriesScreen() {
    const { categories } = squadMenuData();
    const items = [];
    if (!categories.length) {
      items.push({
        label: "Инвентарь пуст (деньги не выбрасываются и не передаются)",
        action: () => announce("В инвентаре нет предметов для сброса или передачи."),
      });
    } else {
      for (const category of categories) {
        const totalQty = category.items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
        items.push({
          label: `${category.label} (${category.items.length} поз., всего ${totalQty})`,
          action: () => show(inventoryCategoryItemsScreen(category.id, category.label), { push: true }),
        });
      }
    }
    items.push({
      label: "Собрать посылку нескольким напарникам",
      action: () => show(batchTransferScreen(), { push: true }),
    });
    items.push({ label: "Назад", action: goBack });
    return {
      id: "inventory-categories",
      title: "Инвентарь по категориям (без денег)",
      items,
    };
  }

  function inventoryCategoryItemsScreen(categoryId, categoryLabel) {
    const { categories } = squadMenuData();
    const category = categories.find((entry) => entry.id === categoryId);
    const list = category?.items ?? [];
    const items = list.length
      ? list.map((item) => ({
          label: `${item.label}: ${item.quantity} шт.`,
          action: () => show(inventoryItemActionsScreen(item.id), { push: true }),
        }))
      : [{ label: "В этой категории пусто", action: () => announce("В этой категории нет предметов.") }];
    items.push({ label: "Назад", action: goBack });
    return {
      id: `inventory-cat-${categoryId}`,
      categoryId,
      categoryLabel,
      title: `Категория: ${categoryLabel}`,
      items,
    };
  }

  function inventoryItemActionsScreen(itemId) {
    const { items: invItems, squadmates } = squadMenuData();
    const item = invItems.find((entry) => entry.id === itemId);
    const aliveMates = squadmates.filter((m) => m.alive && !m.downed);
    if (!item || item.quantity <= 0) {
      return {
        id: "inventory-item-empty",
        title: "Предмет закончился",
        items: [{ label: "Назад", action: goBack }],
      };
    }
    const items = [
      {
        label: "Выбросить на землю (выбрать количество)",
        action: () => show(inventoryQuantityScreen(item, "drop"), { push: true }),
      },
      ...(aliveMates.length
        ? [{
            label: "Передать напарнику (выбрать количество)",
            action: () => show(inventoryQuantityScreen(item, "transfer"), { push: true }),
          }]
        : [{
            label: "Передать напарнику (нет живых напарников)",
            action: () => announce("Нет живых напарников для передачи."),
          }]),
      {
        label: "Добавить в общую посылку (для нескольких напарников)",
        action: () => {
          const step = Math.max(1, Math.floor(Number(item.unitStep) || 1));
          const current = parcelItems.get(item.id) ?? 0;
          const next = Math.min(item.quantity, current + step);
          parcelItems.set(item.id, next);
          announce(`В посылке: ${item.label} — ${next} шт.`);
          show(batchTransferScreen(), { push: true });
        },
      },
      { label: "Назад", action: goBack },
    ];
    return {
      id: "inventory-item-actions",
      itemId: item.id,
      title: `${item.label} (в наличии ${item.quantity} шт.)`,
      items,
    };
  }

  function inventoryQuantityScreen(item, mode) {
    const presets = quantityPresetsFor(item);
    const items = presets.map((preset) => ({
      label: mode === "drop"
        ? `Выбросить: ${preset.label}`
        : `Передать: ${preset.label}`,
      action: () => {
        if (mode === "drop") {
          queueInventoryAction({ type: "drop", itemId: item.id, quantity: preset.qty });
          closeMenu({ announceClose: false });
        } else {
          show(inventoryRecipientPickerScreen(item, preset.qty), { push: true });
        }
      },
    }));
    items.push({ label: "Назад", action: goBack });
    return {
      id: `inventory-qty-${mode}`,
      title: `${mode === "drop" ? "Сколько выбросить" : "Сколько передать"}: ${item.label}`,
      items,
    };
  }

  function inventoryRecipientPickerScreen(item, quantity) {
    const { squadmates } = squadMenuData();
    const aliveMates = squadmates.filter((m) => m.alive && !m.downed);
    const items = [];
    if (aliveMates.length > 1) {
      items.push({
        label: `Разделить между всеми живыми напарниками (${aliveMates.length})`,
        action: () => {
          queueInventoryAction({
            type: "transfer",
            items: [{ itemId: item.id, quantity }],
            recipientIds: aliveMates.map((m) => m.id),
          });
          closeMenu({ announceClose: false });
        },
      });
    }
    for (const mate of aliveMates) {
      items.push({
        label: `Передать напарнику: ${mate.name} (здоровье ${mate.health}, броня ${mate.armor})`,
        action: () => {
          queueInventoryAction({
            type: "transfer",
            items: [{ itemId: item.id, quantity }],
            recipientIds: [mate.id],
          });
          closeMenu({ announceClose: false });
        },
      });
    }
    items.push({ label: "Назад", action: goBack });
    return {
      id: "inventory-recipient-picker",
      title: `Кому передать: ${item.label} (${quantity} шт.)`,
      items,
    };
  }

  function batchTransferScreen() {
    const { items: invItems, squadmates } = squadMenuData();
    const aliveMates = squadmates.filter((m) => m.alive && !m.downed);
    const invById = new Map(invItems.map((entry) => [entry.id, entry]));

    // Prune stale parcel items or dead recipients
    for (const [itemId, qty] of [...parcelItems.entries()]) {
      const stock = invById.get(itemId);
      if (!stock || stock.quantity <= 0) parcelItems.delete(itemId);
      else if (qty > stock.quantity) parcelItems.set(itemId, stock.quantity);
    }
    const aliveIds = new Set(aliveMates.map((m) => m.id));
    for (const id of [...parcelRecipients]) {
      if (!aliveIds.has(id)) parcelRecipients.delete(id);
    }
    if (!parcelRecipients.size && aliveMates.length) {
      for (const mate of aliveMates) parcelRecipients.add(mate.id);
    }

    const items = [];
    const packedList = [...parcelItems.entries()]
      .filter(([, qty]) => qty > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity, label: invById.get(itemId)?.label ?? itemId }));

    if (packedList.length && parcelRecipients.size) {
      const summary = packedList.map((entry) => `${entry.label} ×${entry.quantity}`).join(", ");
      items.push({
        label: `Передать посылку (${summary}) — получателей: ${parcelRecipients.size}`,
        action: () => {
          queueInventoryAction({
            type: "transfer",
            items: packedList.map(({ itemId, quantity }) => ({ itemId, quantity })),
            recipientIds: [...parcelRecipients],
          });
          parcelItems.clear();
          closeMenu({ announceClose: false });
        },
      });
    }

    if (aliveMates.length) {
      items.push({
        label: parcelRecipients.size === aliveMates.length
          ? `Получатели: выбраны все живые (${aliveMates.length}) — снять выбор`
          : `Выбрать всех живых напарников (${aliveMates.length})`,
        action: () => {
          if (parcelRecipients.size === aliveMates.length) parcelRecipients.clear();
          else aliveMates.forEach((m) => parcelRecipients.add(m.id));
          screen = batchTransferScreen();
          render();
          announce(`Выбрано получателей: ${parcelRecipients.size}.`);
        },
      });
      for (const mate of aliveMates) {
        const checked = parcelRecipients.has(mate.id);
        items.push({
          label: `${checked ? "[Выбран]" : "[Не выбран]"} ${mate.name} (здоровье ${mate.health}, броня ${mate.armor})`,
          action: () => {
            if (parcelRecipients.has(mate.id)) parcelRecipients.delete(mate.id);
            else parcelRecipients.add(mate.id);
            screen = batchTransferScreen();
            render();
            announce(`${mate.name}: ${parcelRecipients.has(mate.id) ? "выбран" : "снят"}.`);
          },
        });
      }
    } else {
      items.push({
        label: "Нет живых напарников для передачи посылки",
        action: () => announce("Нет живых напарников."),
      });
    }

    for (const invItem of invItems) {
      const step = Math.max(1, Math.floor(Number(invItem.unitStep) || 1));
      const inParcel = parcelItems.get(invItem.id) ?? 0;
      items.push({
        label: `${invItem.label}: в посылке ${inParcel} из ${invItem.quantity} (+${step}, до максимума сбросит в 0)`,
        action: () => {
          const next = inParcel >= invItem.quantity ? 0 : Math.min(invItem.quantity, inParcel + step);
          if (next <= 0) parcelItems.delete(invItem.id);
          else parcelItems.set(invItem.id, next);
          screen = batchTransferScreen();
          render();
          announce(`${invItem.label}: в посылке ${next} из ${invItem.quantity}.`);
        },
      });
    }

    if (packedList.length) {
      items.push({
        label: "Очистить посылку",
        action: () => {
          parcelItems.clear();
          screen = batchTransferScreen();
          index = 0;
          render();
          announce("Посылка очищена.");
        },
      });
    }
    items.push({ label: "Назад", action: goBack });

    return {
      id: "batch-transfer",
      title: `Посылка напарникам. Предметов: ${packedList.length}, получателей: ${parcelRecipients.size}`,
      items,
    };
  }

  function openMain() {
    const gameVisible = !document.querySelector("#game-panel")?.hidden;
    if (!network.connected && !gameVisible) return;
    stack = [];
    show(mainScreen());
  }

  function openMap() {
    const gameVisible = !document.querySelector("#game-panel")?.hidden;
    if (!network.connected && !gameVisible) return;
    if (network.mode !== "battle-royale") {
      announce("Карта навигации доступна в королевской битве.");
      return;
    }
    stack = [];
    show(mapScreen());
  }

  function openSquadMenu({ fromGamepadHold = false } = {}) {
    const gameVisible = !document.querySelector("#game-panel")?.hidden;
    if (!network.connected && !gameVisible) return;
    if (network.mode !== "battle-royale") {
      announce("Меню отряда и инвентаря доступно в королевской битве.");
      return;
    }
    if (fromGamepadHold) suppressDownUntilRelease = true;
    stack = [];
    show(squadHubScreen());
  }

  function openShop() {
    if (!network.connected || network.mode !== "battle-royale") return;
    if (!latestSnapshot?.shop?.nearbyShop) {
      announce("Магазин далеко. Выберите магазин в меню Карта и подойдите к нему.");
      return;
    }
    stack = [];
    show(shopScreen());
  }

  function move(delta) {
    const items = currentItems();
    if (!items.length) return;
    const next = index + delta;
    if (next < 0) {
      announce("Начало списка.");
      return;
    }
    if (next >= items.length) {
      announce("Конец списка.");
      return;
    }
    index = next;
    render();
  }

  function activate() {
    const item = selectedItem();
    if (!item?.action) return;
    void item.action();
  }

  input.sample = () => {
    const base = open ? neutralizeGameplay(originalSample()) : originalSample();
    const navigation = pendingNavigation;
    const roomRule = pendingRoomRule;
    const shopBuy = pendingShopBuy;
    const squadOrder = pendingSquadOrder;
    const inventoryAction = pendingInventoryAction;
    const specialAction = pendingSpecialAction;
    pendingNavigation = null;
    pendingRoomRule = null;
    pendingShopBuy = null;
    pendingSquadOrder = null;
    pendingInventoryAction = null;
    pendingSpecialAction = null;
    return {
      ...base,
      ...(navigation ? {
        navigationSelectTargetId: navigation.targetId,
        navigationTogglePressed: Boolean(base.navigationTogglePressed || navigation.activate),
      } : {}),
      ...(roomRule ? { socialRoomRule: roomRule } : {}),
      ...(shopBuy ? { shopBuy } : {}),
      ...(squadOrder ? { squadOrder } : {}),
      ...(inventoryAction ? { inventoryAction } : {}),
      ...(specialAction ? { specialAction } : {}),
    };
  };

  window.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) return;
    if (!open && isInteractivePageControl(event.target)) return;
    const gameActive = !document.querySelector("#game-panel")?.hidden;
    if (!gameActive) return;

    if (!open && event.code === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      openMain();
      return;
    }
    if (!open && event.code === "KeyM") {
      event.preventDefault();
      event.stopImmediatePropagation();
      openMap();
      return;
    }
    if (!open && event.code === "KeyI") {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSquadMenu();
      return;
    }
    if (!open && event.code === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!open) return;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "KeyM", "KeyI"].includes(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (event.repeat && event.code === "Enter") return;
    if (event.code === "ArrowUp") move(-1);
    else if (event.code === "ArrowDown") move(1);
    else if (event.code === "ArrowLeft" || event.code === "Escape") goBack();
    else if (event.code === "ArrowRight" || event.code === "Enter") activate();
    else if (event.code === "KeyM" || event.code === "KeyI") closeMenu();
  }, { capture: true, passive: false });

  window.addEventListener("keyup", (event) => {
    if (!open && isInteractivePageControl(event.target)) return;
    if (!open && event.code !== "KeyM" && event.code !== "KeyI" && event.code !== "Enter") return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "KeyM", "KeyI"].includes(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true, passive: false });

  mobile.menu?.addEventListener("click", () => open ? closeMenu() : openMain());
  mobile.map?.addEventListener("click", openMap);
  mobile.squad?.addEventListener("click", () => open && screen?.id === "squad-hub" ? closeMenu() : openSquadMenu());
  ui.resume.addEventListener("click", () => {
    if (nowMs() < suppressMenuClickUntil) return;
    closeMenu();
  });

  ctx.events.on("input:touch", ({ control, down } = {}) => {
    if (!down) return;
    if (control === "map") openMap();
    else if (control === "menu") openMain();
    else if (control === "shop") openShop();
    else if (control === "squad-menu") openSquadMenu({ fromGamepadHold: true });
  });
  ctx.events.on("gesture:action", ({ action } = {}) => {
    if (action === "map") openMap();
    else if (action === "menu") openMain();
    else if (action === "squad-menu") openSquadMenu();
  });
  ctx.events.on("game:event", (packet) => {
    const p = packet?.payload ?? {};
    if (packet?.event === "bunker:puzzle-opened" && p.entityId === network.playerId) {
      stack = [];
      show(bunkerPuzzleScreen({
        stage: p.stage,
        totalStages: p.totalStages,
        hint: p.hint,
      }));
      return;
    }
    if (packet?.event === "bunker:puzzle-step" && p.entityId === network.playerId) {
      if (p.text) announce(p.text);
      if (p.solved) {
        if (open && screen?.id === "bunker-puzzle") closeMenu({ announceClose: false });
      } else if (open && screen?.id === "bunker-puzzle") {
        screen = bunkerPuzzleScreen({
          stage: p.currentStage,
          totalStages: p.totalStages,
          hint: p.nextHint || latestSnapshot?.specialOps?.bunkerPuzzle?.hint || "",
        });
        ui.title.textContent = screen.title;
      }
      return;
    }
    if (packet?.event === "shop:open-requested" && p.entityId === network.playerId) {
      openShop();
      return;
    }
    if (packet?.event === "shop:purchased" && p.entityId === network.playerId) {
      announce(`Куплено: ${p.itemName}. Осталось ${p.balance} долларов.`);
      if (open && screen?.id === "shop") {
        screen = shopScreen();
        render();
      }
      return;
    }
    if (packet?.event === "shop:purchase-failed" && p.entityId === network.playerId) {
      const reasons = {
        "insufficient-funds": `Недостаточно долларов. Нужно ${p.required ?? ""} долларов.`,
        "limit-reached": `Достигнут предел покупок: ${p.limit ?? 3}.`,
        "capacity-full": "С собой уже максимум этого предмета.",
        "no-dead-teammate": "Все напарники сейчас живы.",
        "too-far": "Вы отошли от магазина.",
      };
      announce(reasons[p.reason] ?? "Покупка недоступна.");
    }
  });

  // Full-surface gestures across the open menu in fullscreen gesture mode:
  // swipe up/down moves selection even when starting on a menu button,
  // short tap activates the selected item, swipe left goes back, swipe right closes.
  ui.section.addEventListener("touchstart", (event) => {
    menuSwipeStart = null;
    if (!open || document.documentElement.dataset.touchMode !== "gestures"
      || event.touches.length !== 1) return;
    if (isTypingTarget(event.target)) return;
    const touch = event.touches[0];
    menuSwipeStart = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      time: nowMs(),
      moved: false,
      startedOnResume: Boolean(event.target instanceof Element && event.target.closest("#accessible-game-menu-resume")),
    };
  }, { passive: true });
  ui.section.addEventListener("touchmove", (event) => {
    if (!menuSwipeStart || !open) return;
    const touch = [...(event.touches ?? [])].find((item) => item.identifier === menuSwipeStart.id);
    if (!touch) return;
    const dist = Math.hypot(touch.clientX - menuSwipeStart.x, touch.clientY - menuSwipeStart.y);
    if (dist >= 14) {
      menuSwipeStart.moved = true;
      if (event.cancelable) event.preventDefault();
    }
  }, { passive: false });
  ui.section.addEventListener("touchend", (event) => {
    if (!menuSwipeStart || !open) return;
    const swipe = menuSwipeStart;
    menuSwipeStart = null;
    const touch = [...(event.changedTouches ?? [])].find((item) => item.identifier === swipe.id);
    if (!touch) return;
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    const now = nowMs();
    const duration = Math.max(0, now - (swipe.time ?? now));
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (dx >= 75 && absX >= absY) {
      if (event.cancelable) event.preventDefault();
      suppressMenuClickUntil = now + 450;
      closeMenu();
    } else if (dx <= -60 && absX >= absY) {
      if (event.cancelable) event.preventDefault();
      suppressMenuClickUntil = now + 450;
      goBack();
    } else if (dy <= -36 && absY > absX) {
      if (event.cancelable) event.preventDefault();
      suppressMenuClickUntil = now + 450;
      move(-1);
    } else if (dy >= 36 && absY > absX) {
      if (event.cancelable) event.preventDefault();
      suppressMenuClickUntil = now + 450;
      move(1);
    } else if (!swipe.moved && Math.hypot(dx, dy) <= 20 && duration <= 320) {
      if (event.cancelable) event.preventDefault();
      suppressMenuClickUntil = now + 450;
      if (swipe.startedOnResume) closeMenu();
      else activate();
    } else if (swipe.moved) {
      if (event.cancelable) event.preventDefault();
      suppressMenuClickUntil = now + 450;
    }
  }, { passive: false });
  ui.section.addEventListener("touchcancel", () => { menuSwipeStart = null; }, { passive: true });

  function padButton(gamepad, buttonIndex) {
    return Boolean(gamepad?.buttons?.[buttonIndex]?.pressed || (Number(gamepad?.buttons?.[buttonIndex]?.value) || 0) >= 0.5);
  }

  function padEdge(gamepad, buttonIndex) {
    const down = padButton(gamepad, buttonIndex);
    const before = previousPadButtons.get(buttonIndex) ?? false;
    previousPadButtons.set(buttonIndex, down);
    return down && !before;
  }

  function pollGamepad() {
    gamepadFrame = requestAnimationFrame(pollGamepad);
    const pads = typeof navigator.getGamepads === "function" ? Array.from(navigator.getGamepads() ?? []).filter(Boolean) : [];
    const gamepad = pads.find((pad) => pad.mapping === "standard") ?? pads[0] ?? null;
    if (!gamepad) {
      previousPadButtons.clear();
      return;
    }

    const viewPressed = padEdge(gamepad, 8);
    const optionsPressed = padEdge(gamepad, 9);
    const aPressed = padEdge(gamepad, 0);
    const bPressed = padEdge(gamepad, 1);
    const upPressed = padEdge(gamepad, 12);
    const downPressed = padEdge(gamepad, 13);
    const leftPressed = padEdge(gamepad, 14);
    const rightPressed = padEdge(gamepad, 15);

    const downIsHeld = padButton(gamepad, 13);
    if (!downIsHeld) suppressDownUntilRelease = false;

    if (!open) {
      if (optionsPressed) openMain();
      else if (viewPressed) openMap();
      return;
    }

    ctx.events.emit("input:gamepad-turn", { turn: 0, reason: "menu-open" });
    if (optionsPressed || bPressed) goBack();
    else if (viewPressed && screen?.id === "map") closeMenu();
    else if (upPressed) move(-1);
    else if (downPressed && !suppressDownUntilRelease) move(1);
    else if (leftPressed) goBack();
    else if (rightPressed || aPressed) activate();
  }

  function cancelTwoFingerHold() {
    if (twoFingerTimer != null) clearTimeout(twoFingerTimer);
    twoFingerTimer = null;
    twoFingerStart = null;
  }

  document.addEventListener("touchstart", (event) => {
    if (open || event.touches.length !== 2
      || document.documentElement.dataset.touchMode !== "gestures") return;
    if (Array.from(event.touches).some((touch) => isInteractivePageControl(touch.target))) return;
    const points = Array.from(event.touches).map((touch) => ({ x: touch.clientX, y: touch.clientY }));
    twoFingerStart = points;
    twoFingerTimer = setTimeout(() => {
      twoFingerTimer = null;
      twoFingerStart = null;
      openMain();
      announce("Главное меню. Жест удержания двумя пальцами.");
    }, TWO_FINGER_HOLD_MS);
  }, { capture: true, passive: true });

  document.addEventListener("touchmove", (event) => {
    if (!twoFingerStart || event.touches.length !== 2) {
      cancelTwoFingerHold();
      return;
    }
    const points = Array.from(event.touches);
    const moved = points.some((touch, i) => Math.hypot(
      touch.clientX - twoFingerStart[i].x,
      touch.clientY - twoFingerStart[i].y,
    ) > TWO_FINGER_MOVE_CANCEL_PX);
    if (moved) cancelTwoFingerHold();
  }, { capture: true, passive: true });

  document.addEventListener("touchend", cancelTwoFingerHold, { capture: true, passive: true });
  document.addEventListener("touchcancel", cancelTwoFingerHold, { capture: true, passive: true });

  ctx.events.on("game:snapshot", (snapshot) => {
    latestSnapshot = snapshot;
    if (!open) return;

    if (screen?.id === "map") {
      const selectedId = selectedItem()?.targetId;
      screen = mapScreen();
      if (selectedId) {
        const found = currentItems().findIndex((item) => item.targetId === selectedId);
        if (found >= 0) index = found;
      }
      return;
    }

    if (screen?.id === "room-settings") {
      if (!isRoomHost()) {
        screen = mainScreen();
        index = 0;
        announce("Вы больше не главный организатор комнаты.");
      } else {
        screen = roomSettingsScreen();
      }
    } else if (screen?.id === "shop") {
      if (!latestSnapshot?.shop?.nearbyShop) {
        closeMenu({ announceClose: false });
        announce("Вы отошли от магазина.");
      } else {
        screen = shopScreen();
        ui.title.textContent = screen.title;
      }
    }
  });

  ctx.events.on("network:disconnected", () => {
    latestSnapshot = null;
    pendingNavigation = null;
    pendingRoomRule = null;
    pendingShopBuy = null;
    pendingSquadOrder = null;
    pendingInventoryAction = null;
    pendingSpecialAction = null;
    parcelItems.clear();
    parcelRecipients.clear();
    cancelTwoFingerHold();
    closeMenu({ announceClose: false });
  });

  ctx.services.provide("menus", {
    openMain,
    openMap,
    openShop,
    openSquadMenu,
    close: closeMenu,
    get open() { return open; },
    get screen() { return screen?.id ?? null; },
    get isRoomHost() { return isRoomHost(); },
  });

  gamepadFrame = requestAnimationFrame(pollGamepad);
}
