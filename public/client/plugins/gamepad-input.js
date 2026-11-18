export const manifest = {
  id: "gamepad-input",
  requires: ["keyboard-input", "cloudflare-session"],
};

export const GAMEPAD_DEADZONE = 0.16;
export const GAMEPAD_TRIGGER_DEADZONE = 0.08;
export const GAMEPAD_CHANGE_INTERVAL_MS = 34;
export const GAMEPAD_AXIS_EPSILON = 0.025;
export const GAMEPAD_ARMOR_HOLD_MS = 380;

function clampAxis(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function shapeAxis(value, exponent = 1.45) {
  const numeric = clampAxis(value);
  const magnitude = Math.abs(numeric);
  if (magnitude <= GAMEPAD_DEADZONE) return 0;
  const normalized = (magnitude - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE);
  return Math.sign(numeric) * Math.pow(normalized, exponent);
}

function shapeTrigger(value) {
  const numeric = clamp01(value);
  if (numeric <= GAMEPAD_TRIGGER_DEADZONE) return 0;
  return (numeric - GAMEPAD_TRIGGER_DEADZONE) / (1 - GAMEPAD_TRIGGER_DEADZONE);
}

function buttonValue(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  if (!button) return 0;
  return Math.max(Number(button.value) || 0, button.pressed ? 1 : 0);
}

function buttonDown(gamepad, index, threshold = 0.5) {
  return buttonValue(gamepad, index) >= threshold;
}

function selectGamepad() {
  const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
  const connected = Array.from(pads ?? []).filter(Boolean);
  return connected.find((pad) => pad.mapping === "standard") ?? connected[0] ?? null;
}

function ensureAccessibleHelp() {
  if (typeof document === "undefined" || typeof document.getElementById !== "function" || typeof document.querySelectorAll !== "function") return;
  if (document.getElementById("gamepad-controls-help")) return;
  const rawHeadings = document.querySelectorAll("#game-panel h3");
  const headings = rawHeadings ? Array.from(rawHeadings) : [];
  const heading = headings.find((node) => node.textContent?.trim() === "Управление") ?? headings[0];
  if (!heading || typeof document.createElement !== "function") return;
  const help = document.createElement("p");
  help.id = "gamepad-controls-help";
  help.textContent = "Геймпад: левый стик — движение, правый стик — поворот камеры и персонажа. Крестик (A) — бег при удержании пешком, в воздухе — раскрыть парашют. Квадрат (X) — прыжок. Кружок (B) — отпустить тело в прыжке или срезать открытый парашют. Треугольник (Y) — короткое нажатие открывает двери, ящики или магазин, поднимает напарника или сажает в машину; удержание Треугольника (Y) на полсекунды с последующим отпусканием запускает надевание бронепластин. Крестовина вверх — стимулятор (в нокауте сразу берёт быстрый 1-секундный стимулятор, если куплен), L2 пешком — турбо-стимулятор (600 HP). Крестовина влево и вправо — выбор цели навигации, крестовина вниз — включить или выключить ведение по маршруту. Нажатие правого стика (R3) — автоповорот к цели навигации (в воздухе — статус полёта). Кнопка Share/View — карта, Options/Menu — меню игры. L1 и R1 — смена оружия, R2 — огонь.";
  heading.insertAdjacentElement?.("afterend", help);
}

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const originalSample = input.sample.bind(input);

  let frameId = 0;
  let activeIndex = null;
  let lastNotifyAt = -Infinity;
  let pendingAnalogNotify = false;
  let latestParachute = null;
  let latestSelf = null;
  let driving = false;
  let analog = {
    moveForward: 0,
    strafe: 0,
    turn: 0,
    crossHeld: false,
    leftStickHeld: false,
    leftTrigger: 0,
    rightTrigger: 0,
  };
  let previousButtons = new Map();
  let triangleHoldStartedAt = null;
  let triangleArmorTriggered = false;
  let triangleDeferredTap = false;
  let firePressed = false;
  let reload = false;
  let selectDelta = 0;
  let interactPressed = false;
  let interactHeld = false;
  let interactReleased = false;
  let platePressed = false;
  let stimulantPressed = false;
  let turboStimulantPressed = false;
  let parachutePressed = false;
  let posePressed = false;
  let jumpPressed = false;
  let navigationNextPressed = false;
  let navigationPrevPressed = false;
  let navigationTogglePressed = false;
  let navigationFacePressed = false;

  ensureAccessibleHelp();

  function canStartArmorPlating() {
    if (driving || latestParachute?.airborne) return false;
    if (!latestSelf || !latestSelf.alive || latestSelf.downed || latestSelf.plating || latestSelf.armorPlating) return false;
    const armor = Number(latestSelf.armor) || 0;
    const armorMax = Number(latestSelf.armorMax) || 150;
    const reserve = Number(latestSelf.armorReserve ?? latestSelf.armorPlates) || 0;
    return reserve > 0 && armor < armorMax;
  }

  function pulseGamepadConfirm(options = { duration: 105, weak: 0.68, strong: 0.86 }) {
    if (ctx.services.has("haptic-feedback")) {
      void ctx.services.get("haptic-feedback").rumbleGamepad?.(options);
      return;
    }
    const pad = selectGamepad();
    const actuator = pad?.vibrationActuator;
    if (actuator && typeof actuator.playEffect === "function") {
      void actuator.playEffect(actuator.type || "dual-rumble", {
        startDelay: 0,
        duration: Math.max(85, Number(options.duration) || 105),
        weakMagnitude: Number(options.weak) || 0.68,
        strongMagnitude: Number(options.strong) || 0.86,
      });
    }
  }

  function emitChanged(reason, immediate = false) {
    if (network && !network.connected) return;
    const now = performance.now();
    if (immediate || now - lastNotifyAt >= GAMEPAD_CHANGE_INTERVAL_MS) {
      lastNotifyAt = now;
      pendingAnalogNotify = false;
      ctx.events.emit("input:changed", { reason });
      return;
    }
    pendingAnalogNotify = true;
  }

  function buttonEdge(gamepad, index) {
    const down = buttonDown(gamepad, index);
    const before = previousButtons.get(index) ?? false;
    previousButtons.set(index, down);
    return { down, pressed: down && !before, released: !down && before };
  }

  function effectiveState(state = analog) {
    if (driving) {
      return {
        forward: clampAxis(state.rightTrigger - state.leftTrigger),
        strafe: state.strafe,
        turn: state.turn,
        sprint: state.leftStickHeld,
        fireHeld: false,
      };
    }

    return {
      forward: state.moveForward,
      strafe: state.strafe,
      turn: state.turn,
      sprint: (state.crossHeld || state.leftStickHeld) && !latestParachute?.airborne,
      fireHeld: state.rightTrigger >= 0.12,
    };
  }

  function setDriving(next, reason = "snapshot") {
    const value = Boolean(next);
    if (driving === value) return;
    driving = value;
    firePressed = false;
    triangleHoldStartedAt = null;
    triangleArmorTriggered = false;
    triangleDeferredTap = false;
    if (interactHeld) {
      interactHeld = false;
      interactReleased = true;
    }
    ctx.events.emit("input:fire-stop", { source: "gamepad", reason: `vehicle:${reason}` });
    emitChanged(`gamepad:vehicle:${value ? "entered" : "exited"}`, true);
  }

  function reset(reason = "reset") {
    const before = effectiveState();
    const hadState = Math.abs(before.forward) > 0.001
      || Math.abs(before.strafe) > 0.001
      || Math.abs(before.turn) > 0.001
      || before.sprint
      || before.fireHeld
      || interactHeld;
    analog = {
      moveForward: 0,
      strafe: 0,
      turn: 0,
      crossHeld: false,
      leftStickHeld: false,
      leftTrigger: 0,
      rightTrigger: 0,
    };
    previousButtons = new Map();
    activeIndex = null;
    triangleHoldStartedAt = null;
    triangleArmorTriggered = false;
    triangleDeferredTap = false;
    firePressed = false;
    reload = false;
    selectDelta = 0;
    interactPressed = false;
    if (interactHeld) interactReleased = true;
    interactHeld = false;
    platePressed = false;
    stimulantPressed = false;
    turboStimulantPressed = false;
    parachutePressed = false;
    posePressed = false;
    jumpPressed = false;
    navigationNextPressed = false;
    navigationPrevPressed = false;
    navigationTogglePressed = false;
    navigationFacePressed = false;
    pendingAnalogNotify = false;
    ctx.events.emit("input:gamepad-turn", { turn: 0, reason });
    if (hadState) emitChanged(`gamepad:${reason}`, true);
  }

  function updateAnalog(gamepad) {
    const before = effectiveState();
    const previous = analog;
    const next = {
      moveForward: -shapeAxis(gamepad.axes?.[1] ?? 0, 1.35),
      strafe: shapeAxis(gamepad.axes?.[0] ?? 0, 1.35),
      turn: shapeAxis(gamepad.axes?.[2] ?? 0, 1.6),
      crossHeld: buttonDown(gamepad, 0),
      leftStickHeld: buttonDown(gamepad, 10),
      leftTrigger: shapeTrigger(buttonValue(gamepad, 6)),
      rightTrigger: shapeTrigger(buttonValue(gamepad, 7)),
    };

    if (Math.abs(next.turn - previous.turn) >= 0.005) {
      ctx.events.emit("input:gamepad-turn", { turn: next.turn, reason: "right-stick" });
    }

    analog = next;
    const after = effectiveState(next);

    if (!driving && !before.fireHeld && after.fireHeld) {
      firePressed = true;
      ctx.events.emit("input:fire-start", { source: "gamepad" });
    } else if (!driving && before.fireHeld && !after.fireHeld) {
      ctx.events.emit("input:fire-stop", { source: "gamepad" });
    }

    const changed = Math.abs(after.forward - before.forward) >= GAMEPAD_AXIS_EPSILON
      || Math.abs(after.strafe - before.strafe) >= GAMEPAD_AXIS_EPSILON
      || Math.abs(after.turn - before.turn) >= GAMEPAD_AXIS_EPSILON
      || after.sprint !== before.sprint
      || after.fireHeld !== before.fireHeld;
    const centered = Math.abs(after.forward) < 0.001
      && Math.abs(after.strafe) < 0.001
      && Math.abs(after.turn) < 0.001;
    const wasCentered = Math.abs(before.forward) < 0.001
      && Math.abs(before.strafe) < 0.001
      && Math.abs(before.turn) < 0.001;

    if (changed) emitChanged("gamepad:analog", centered && !wasCentered);
  }

  function updateButtons(gamepad) {
    const now = performance.now();
    const cross = buttonEdge(gamepad, 0);
    const circle = buttonEdge(gamepad, 1);
    const square = buttonEdge(gamepad, 2);
    const triangle = buttonEdge(gamepad, 3);
    const l1 = buttonEdge(gamepad, 4);
    const r1 = buttonEdge(gamepad, 5);
    const l2 = buttonEdge(gamepad, 6);
    const selectBtn = buttonEdge(gamepad, 8);
    const startBtn = buttonEdge(gamepad, 9);
    const r3 = buttonEdge(gamepad, 11);
    const dpadUp = buttonEdge(gamepad, 12);
    const dpadDown = buttonEdge(gamepad, 13);
    const dpadLeft = buttonEdge(gamepad, 14);
    const dpadRight = buttonEdge(gamepad, 15);

    // Cross/A is contextual: sprint while held on foot, deploy/redeploy in air.
    if (cross.pressed && latestParachute?.airborne && !driving) {
      parachutePressed = true;
      emitChanged("gamepad:cross:parachute", true);
    }

    // Circle/B explicitly cuts an open canopy; on foot/jump it triggers parkour ragdoll pose.
    if (circle.pressed && !driving) {
      if (latestParachute?.deployed) parachutePressed = true;
      else posePressed = true;
      emitChanged("gamepad:circle", true);
    }

    // Square/X is the dedicated jump button (weapons reload automatically).
    if (square.pressed && !driving) {
      jumpPressed = true;
      emitChanged("gamepad:square:jump", true);
    }

    // Triangle/Y:
    // - Holding Triangle for ~380ms starts putting on armor plates (if damaged & plates available),
    //   allowing the player to release Triangle immediately while plating continues automatically.
    // - Short tap (<380ms, or immediate when armor plating is not applicable) triggers interact
    //   (doors, crates, vehicles, reviving downed teammates) and supports continuous crate push while held.
    if (triangle.pressed) {
      triangleHoldStartedAt = now;
      triangleArmorTriggered = false;
      if (!driving) {
        interactHeld = true;
        interactReleased = false;
      }
      if (canStartArmorPlating()) {
        triangleDeferredTap = true;
      } else {
        triangleDeferredTap = false;
        interactPressed = true;
        emitChanged("gamepad:triangle:interact", true);
      }
    } else if (triangle.down && triangleHoldStartedAt != null) {
      const heldMs = now - triangleHoldStartedAt;
      if (!triangleArmorTriggered && heldMs >= GAMEPAD_ARMOR_HOLD_MS && canStartArmorPlating()) {
        triangleArmorTriggered = true;
        triangleDeferredTap = false;
        platePressed = true;
        pulseGamepadConfirm({ duration: 115, weak: 0.74, strong: 0.92 });
        emitChanged("gamepad:triangle:armor-plate", true);
      }
    } else if (triangle.released) {
      const shouldTap = triangleDeferredTap && !triangleArmorTriggered;
      triangleHoldStartedAt = null;
      triangleArmorTriggered = false;
      triangleDeferredTap = false;
      if (interactHeld) {
        interactHeld = false;
        interactReleased = true;
      }
      if (shouldTap) {
        interactPressed = true;
        emitChanged("gamepad:triangle:tap-interact", true);
      } else if (interactReleased) {
        emitChanged("gamepad:triangle:release", true);
      }
    }

    if (l1.pressed && !driving) {
      selectDelta = -1;
      emitChanged("gamepad:l1", true);
    }
    if (r1.pressed && !driving) {
      selectDelta = 1;
      emitChanged("gamepad:r1", true);
    }

    // D-Pad Up: Use stimulant (heal on foot or self-revive when downed; prefers bought 1s stim when downed)
    if (dpadUp.pressed && !driving) {
      stimulantPressed = true;
      pulseGamepadConfirm({ duration: 90, weak: 0.62, strong: 0.78 });
      emitChanged("gamepad:dpad-up:stimulant", true);
    }

    // L2 on foot: Use Turbo Stimulant (600 HP)
    if (l2.pressed && !driving && !latestParachute?.airborne) {
      turboStimulantPressed = true;
      pulseGamepadConfirm({ duration: 110, weak: 0.72, strong: 0.88 });
      emitChanged("gamepad:l2:turbo-stimulant", true);
    }

    // D-Pad Left / Right: Cycle navigation targets backward / forward
    if (dpadLeft.pressed) {
      navigationPrevPressed = true;
      emitChanged("gamepad:dpad-left:nav-prev", true);
    }
    if (dpadRight.pressed) {
      navigationNextPressed = true;
      emitChanged("gamepad:dpad-right:nav-next", true);
    }

    // D-Pad Down: Toggle active navigation route guidance
    if (dpadDown.pressed) {
      navigationTogglePressed = true;
      emitChanged("gamepad:dpad-down:nav-toggle", true);
    }

    // R3 (Right Stick Click): Parachute status in air, or auto-face navigation target on ground
    if (r3.pressed) {
      if (latestParachute?.airborne) {
        input.triggerVirtualAction?.("parachute-status");
      } else {
        navigationFacePressed = true;
        input.triggerVirtualAction?.("navigation-face");
        emitChanged("gamepad:r3:nav-face", true);
      }
    }

    // Select / Share / View (button 8): Parachute status in air, or toggle Map on ground
    if (selectBtn.pressed) {
      if (latestParachute?.airborne) {
        input.triggerVirtualAction?.("parachute-status");
      } else if (typeof input.triggerVirtualAction === "function") {
        input.triggerVirtualAction("map");
      } else if (ctx.services.has("overlay-manager")) {
        ctx.services.get("overlay-manager")?.toggle?.("map");
      }
    }

    // Start / Options / Menu (button 9): Toggle Game Menu
    if (startBtn.pressed) {
      if (typeof input.triggerVirtualAction === "function") {
        input.triggerVirtualAction("menu");
      } else if (ctx.services.has("overlay-manager")) {
        ctx.services.get("overlay-manager")?.toggle?.("menu");
      }
    }
  }

  function sampleGamepadState() {
    const inactive = document?.hidden
      || (typeof document?.hasFocus === "function" && !document.hasFocus());
    if (inactive) {
      if (activeIndex != null) reset("inactive");
      return;
    }

    const gamepad = selectGamepad();
    if (!gamepad) {
      if (activeIndex != null) reset("disconnected");
      return;
    }

    const padIdx = gamepad.index ?? 0;
    if (activeIndex !== padIdx) {
      reset("switched");
      activeIndex = padIdx;
      ctx.events.emit("gamepad:connected", {
        index: padIdx,
        id: gamepad.id,
        mapping: gamepad.mapping,
      });
    }

    updateAnalog(gamepad);
    updateButtons(gamepad);

    if (pendingAnalogNotify && performance.now() - lastNotifyAt >= GAMEPAD_CHANGE_INTERVAL_MS) {
      emitChanged("gamepad:analog-throttled", true);
    }
  }

  function poll() {
    if (typeof window?.requestAnimationFrame === "function") {
      frameId = window.requestAnimationFrame(poll);
    }
    sampleGamepadState();
  }

  input.sample = () => {
    sampleGamepadState();
    const sampled = originalSample();
    const effective = effectiveState();
    const result = {
      ...sampled,
      forward: clampAxis((Number(sampled.forward) || 0) + effective.forward),
      strafe: clampAxis((Number(sampled.strafe) || 0) + effective.strafe),
      turn: clampAxis((Number(sampled.turn) || 0) + effective.turn),
      sprint: Boolean(sampled.sprint || effective.sprint),
      fireHeld: Boolean(sampled.fireHeld || effective.fireHeld),
      firePressed: Boolean(sampled.firePressed || firePressed),
      reload: Boolean(sampled.reload || reload),
      selectDelta: Number(sampled.selectDelta) || selectDelta,
      interactPressed: Boolean(sampled.interactPressed || interactPressed),
      interactHeld: Boolean(sampled.interactHeld || interactHeld),
      interactReleased: Boolean(sampled.interactReleased || interactReleased),
      platePressed: Boolean(sampled.platePressed || platePressed),
      stimulantPressed: Boolean(sampled.stimulantPressed || stimulantPressed),
      turboStimulantPressed: Boolean(sampled.turboStimulantPressed || turboStimulantPressed),
      parachutePressed: Boolean(sampled.parachutePressed || parachutePressed),
      posePressed: Boolean(sampled.posePressed || posePressed),
      jumpPressed: Boolean(sampled.jumpPressed || jumpPressed),
      navigationNextPressed: Boolean(sampled.navigationNextPressed || navigationNextPressed),
      navigationPrevPressed: Boolean(sampled.navigationPrevPressed || navigationPrevPressed),
      navigationTogglePressed: Boolean(sampled.navigationTogglePressed || navigationTogglePressed),
      navigationFacePressed: Boolean(sampled.navigationFacePressed || navigationFacePressed),
    };
    firePressed = false;
    reload = false;
    selectDelta = 0;
    interactPressed = false;
    interactReleased = false;
    platePressed = false;
    stimulantPressed = false;
    turboStimulantPressed = false;
    parachutePressed = false;
    posePressed = false;
    jumpPressed = false;
    navigationNextPressed = false;
    navigationPrevPressed = false;
    navigationTogglePressed = false;
    navigationFacePressed = false;
    return result;
  };

  ctx.events.on("game:snapshot", (snapshot) => {
    const pid = network?.playerId ?? snapshot?.playerId ?? (snapshot?.entities?.length === 1 ? snapshot.entities[0].id : undefined);
    const self = snapshot?.entities?.find((entity) => entity.id === pid);
    latestSelf = self ?? null;
    latestParachute = self?.parachute ?? null;
    const selfDriving = (snapshot?.vehicles ?? []).some(
      (vehicle) => vehicle?.driverId === pid,
    );
    setDriving(selfDriving, "snapshot");
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (!network?.playerId || payload.entityId !== network.playerId) return;
    if (packet.event === "vehicle:entered") setDriving(true, "event");
    if (packet.event === "vehicle:exited" || packet.event === "vehicle:driver-lost") {
      setDriving(false, "event");
    }
  });

  ctx.events.on("network:disconnected", () => {
    driving = false;
    latestSelf = null;
    latestParachute = null;
    reset("network-disconnected");
  });

  window?.addEventListener?.("gamepaddisconnected", (event) => {
    if (event.gamepad?.index === activeIndex) reset("disconnected");
  });
  window?.addEventListener?.("blur", () => reset("blur"));
  document?.addEventListener?.("visibilitychange", () => {
    if (document.hidden) reset("hidden");
  });

  frameId = typeof window?.requestAnimationFrame === "function" ? window.requestAnimationFrame(poll) : 0;

  ctx.services.provide("gamepad", {
    get connected() { return activeIndex != null; },
    get index() { return activeIndex; },
    get driving() { return driving; },
    get state() { return { ...analog, ...effectiveState() }; },
    stop() {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      reset("stopped");
    },
  });
}
