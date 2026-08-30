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
    <p id="accessible-game-menu-help">Стрелки вверх и вниз — выбрать пункт. Enter — открыть или подтвердить. Escape — назад.</p>
    <ul id="accessible-game-menu-list" role="listbox"></ul>
    <p id="accessible-game-menu-status" role="status" aria-live="assertive" aria-atomic="true"></p>
  `;
  document.body.append(section);
  return {
    section,
    title: section.querySelector("#accessible-game-menu-title"),
    list: section.querySelector("#accessible-game-menu-list"),
    status: section.querySelector("#accessible-game-menu-status"),
  };
}

function createMobileButtons() {
  const controls = document.querySelector("#touch-controls");
  if (!controls) return {};
  const row = document.createElement("div");
  row.className = "touch-actions";
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
  let gamepadFrame = 0;
  let previousPadButtons = new Map();
  let twoFingerTimer = null;
  let twoFingerStart = null;

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
      li.id = `accessible-menu-item-${itemIndex}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", itemIndex === index ? "true" : "false");
      li.textContent = item.label;
      ui.list.append(li);
    });
    ui.list.setAttribute("aria-activedescendant", items.length ? `accessible-menu-item-${index}` : "");
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
    ui.section.hidden = !open;
    if (open) {
      input.disable();
      ctx.events.emit("input:gamepad-turn", { turn: 0, reason: "menu-open" });
    } else if (network.connected) {
      input.enable();
    }
    ctx.events.emit("ui:menu", { open, id: screen?.id ?? null });
  }

  function closeMenu({ announceClose = true } = {}) {
    if (!open) return;
    screen = null;
    stack = [];
    index = 0;
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
    return {
      id: "main",
      title: "Главное меню",
      items: [
        { label: "Друзья", action: () => show(friendsScreen(), { push: true }) },
        { label: "Продолжить игру", action: () => closeMenu() },
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
    const pending = pendingNavigation;
    pendingNavigation = null;
    if (!pending) return base;
    return {
      ...base,
      navigationSelectTargetId: pending.targetId,
      navigationTogglePressed: Boolean(pending.activate),
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
      // Enter only confirms a choice inside the new menu system.
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

  function padButton(gamepad, index) {
    return Boolean(gamepad?.buttons?.[index]?.pressed || (Number(gamepad?.buttons?.[index]?.value) || 0) >= 0.5);
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
    if (open || event.touches.length !== 2) return;
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
    if (open && screen?.id === "map") {
      const selectedId = selectedItem()?.targetId;
      screen = mapScreen();
      if (selectedId) {
        const found = currentItems().findIndex((item) => item.targetId === selectedId);
        if (found >= 0) index = found;
      }
    }
  });

  ctx.events.on("network:disconnected", () => {
    latestSnapshot = null;
    cancelTwoFingerHold();
    closeMenu({ announceClose: false });
  });

  ctx.services.provide("menus", {
    openMain,
    openMap,
    close: closeMenu,
    get open() { return open; },
    get screen() { return screen?.id ?? null; },
  });

  gamepadFrame = requestAnimationFrame(pollGamepad);
}
