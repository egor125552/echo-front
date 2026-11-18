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
    <p id="accessible-game-menu-help">Каждый пункт меню — кнопка. Можно нажать пальцем или двойным касанием VoiceOver. Стрелки вверх и вниз выбирают пункт, Enter подтверждает, Escape возвращает назад. В режиме жестов проведите вправо по пустому месту меню, чтобы вернуться к игре.</p>
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
  row.append(menu, map);
  controls.prepend(row);

  const legacyNext = controls.querySelector('[data-navigation-action="next"]');
  const legacyToggle = controls.querySelector('[data-navigation-action="toggle"]');
  if (legacyNext) legacyNext.hidden = true;
  if (legacyToggle) legacyToggle.hidden = true;
  return { menu, map };
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
  let gamepadFrame = 0;
  let previousPadButtons = new Map();
  let twoFingerTimer = null;
  let twoFingerStart = null;
  let focusBeforeMenu = null;
  let menuSwipeStart = null;

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
      button.addEventListener("focus", () => { index = itemIndex; });
      button.addEventListener("click", () => {
        index = itemIndex;
        void item.action?.();
      });
      li.append(button);
      ui.list.append(li);
    });
    // Each menu entry is a native button, so both taps and VoiceOver activation
    // execute the action rather than merely changing a listbox selection.
    ui.list.querySelector(`[data-menu-index="${index}"]`)?.focus({ preventScroll: true });
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
    if (page) page.inert = open;
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

  function mainScreen() {
    const hasEnemyAi = typeof ctx.services?.has === "function" && ctx.services.has("enemy-ai-settings");
    const enemyAi = hasEnemyAi
      ? ctx.services.get("enemy-ai-settings")
      : network;
    const isAi = (enemyAi?.mode ?? enemyAi?.enemyAiMode) === "ai";
    const items = [
      { label: "Друзья", action: () => show(friendsScreen(), { push: true }) },
      {
        label: `Режим ботов: ${isAi ? "Боты с ИИ (враги и напарники)" : "Обычные боты"}`,
        action: () => {
          const next = isAi ? "standard" : "ai";
          if (typeof enemyAi?.setMode === "function") enemyAi.setMode(next);
          else network.setEnemyAiMode?.(next);
          announce(next === "ai"
            ? "Включён режим: боты с ИИ (враги и напарники)."
            : "Включён режим: обычные боты.");
          screen = mainScreen();
          index = 2;
          render();
        },
      },
    ];
    if (isRoomHost()) {
      items.push({ label: "Настройки комнаты", action: () => show(roomSettingsScreen(), { push: true }) });
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
    const marksmanOwned = Boolean(shopState.marksmanOwned ?? self?.weapons?.includes?.("marksman"));
    const sniperOwned = Boolean(shopState.sniperOwned ?? self?.weapons?.includes?.("sniper"));
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
      label: `Вызвать сброс Джаггернаута (600 брони, 700 здоровья, гора стимуляторов — стягивает всех врагов) — ${juggernautDropCost} долларов`,
      action: () => queueBuy("juggernaut-drop"),
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

  function openMain() {
    if (!network.connected) return;
    stack = [];
    show(mainScreen());
  }

  function openMap() {
    if (!network.connected) return;
    if (network.mode !== "battle-royale") {
      announce("Карта навигации доступна в королевской битве.");
      return;
    }
    stack = [];
    show(mapScreen());
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
    pendingNavigation = null;
    pendingRoomRule = null;
    pendingShopBuy = null;
    return {
      ...base,
      ...(navigation ? {
        navigationSelectTargetId: navigation.targetId,
        navigationTogglePressed: Boolean(base.navigationTogglePressed || navigation.activate),
      } : {}),
      ...(roomRule ? { socialRoomRule: roomRule } : {}),
      ...(shopBuy ? { shopBuy } : {}),
    };
  };

  window.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) return;
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
    if (!open && event.code === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!open) return;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "KeyM"].includes(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (event.repeat && event.code === "Enter") return;
    if (event.code === "ArrowUp") move(-1);
    else if (event.code === "ArrowDown") move(1);
    else if (event.code === "ArrowLeft" || event.code === "Escape") goBack();
    else if (event.code === "ArrowRight" || event.code === "Enter") activate();
    else if (event.code === "KeyM") closeMenu();
  }, { capture: true, passive: false });

  window.addEventListener("keyup", (event) => {
    if (!open && event.code !== "KeyM" && event.code !== "Enter") return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "KeyM"].includes(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true, passive: false });

  mobile.menu?.addEventListener("click", () => open ? closeMenu() : openMain());
  mobile.map?.addEventListener("click", openMap);
  ui.resume.addEventListener("click", closeMenu);

  ctx.events.on("input:touch", ({ control, down } = {}) => {
    if (!down) return;
    if (control === "map") openMap();
    else if (control === "menu") openMain();
    else if (control === "shop") openShop();
  });
  ctx.events.on("gesture:action", ({ action } = {}) => {
    if (action === "map") openMap();
    else if (action === "menu") openMain();
  });
  ctx.events.on("game:event", (packet) => {
    const p = packet?.payload ?? {};
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

  // Gestures on empty menu space allow full navigation in fullscreen gesture mode:
  // swipe up/down moves selection, tap activates, swipe left goes back, swipe right closes.
  ui.section.addEventListener("touchstart", (event) => {
    menuSwipeStart = null;
    if (!open || document.documentElement.dataset.touchMode !== "gestures"
      || event.touches.length !== 1 || event.target?.closest?.("button, a, input, select, textarea, summary")) return;
    const touch = event.touches[0];
    menuSwipeStart = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      time: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
  }, { passive: true });
  ui.section.addEventListener("touchend", (event) => {
    if (!menuSwipeStart || !open) return;
    const touch = [...(event.changedTouches ?? [])].find((item) => item.identifier === menuSwipeStart.id);
    if (touch) {
      const dx = touch.clientX - menuSwipeStart.x;
      const dy = touch.clientY - menuSwipeStart.y;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const duration = Math.max(0, now - (menuSwipeStart.time ?? now));
      if (dx >= 90 && Math.abs(dy) <= 65) {
        event.preventDefault?.();
        closeMenu();
      } else if (dx <= -70 && Math.abs(dy) <= 65) {
        event.preventDefault?.();
        goBack();
      } else if (dy <= -45 && Math.abs(dx) <= 65) {
        event.preventDefault?.();
        move(-1);
      } else if (dy >= 45 && Math.abs(dx) <= 65) {
        event.preventDefault?.();
        move(1);
      } else if (Math.hypot(dx, dy) <= 20 && duration <= 280) {
        event.preventDefault?.();
        activate();
      }
    }
    menuSwipeStart = null;
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

    if (!open) {
      if (optionsPressed) openMain();
      else if (viewPressed) openMap();
      return;
    }

    ctx.events.emit("input:gamepad-turn", { turn: 0, reason: "menu-open" });
    if (optionsPressed || bPressed) goBack();
    else if (viewPressed && screen?.id === "map") closeMenu();
    else if (upPressed) move(-1);
    else if (downPressed) move(1);
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
    if (Array.from(event.touches).some((touch) => isTypingTarget(touch.target))) return;
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
    cancelTwoFingerHold();
    closeMenu({ announceClose: false });
  });

  ctx.services.provide("menus", {
    openMain,
    openMap,
    openShop,
    close: closeMenu,
    get open() { return open; },
    get screen() { return screen?.id ?? null; },
    get isRoomHost() { return isRoomHost(); },
  });

  gamepadFrame = requestAnimationFrame(pollGamepad);
}
