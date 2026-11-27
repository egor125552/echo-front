export const manifest = {
  id: "gamepad-input",
  requires: ["keyboard-input", "cloudflare-session"],
};

export const GAMEPAD_DEADZONE = 0.16;
export const GAMEPAD_TRIGGER_DEADZONE = 0.08;
export const GAMEPAD_CHANGE_INTERVAL_MS = 34;
export const GAMEPAD_AXIS_EPSILON = 0.025;
export const GAMEPAD_ARMOR_HOLD_MS = 380;
export const GAMEPAD_SQUAD_HOLD_MS = 420;
export const GAMEPAD_SPECIAL_HOLD_MS = 380;

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
  const connected = Array.from(pads ?? []).filter((pad) => Boolean(pad) && pad.connected !== false);
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
  help.textContent = "Геймпад: левый стик — движение (в суперпрыжке тоже поворачивает тело и курс полёта), правый стик — поворот камеры и персонажа. Крестик (A) — бег при удержании пешком, в воздухе и в суперпрыжке — раскрыть парашют. Квадрат (X) — прыжок; в костюме «Электрический Лукашенко» удержание Квадрата запускает суперпрыжок вверх и далеко вперёд, отпускание переводит в свободный полёт (в полёте: Квадрат или R2 — удар вниз со взрывом, Крестик — парашют, или просто лети до приземления). Кружок (B) — присесть или укрыться за машиной и стеной (в прыжке — поза паркура, под куполом — срезать парашют, при наведении мини-ядерки — отменить запуск). Треугольник (Y) — короткое нажатие открывает двери, ящики или магазин, поднимает напарника или сажает в машину; удержание Треугольника (Y) на полсекунды с последующим отпусканием запускает надевание бронепластин. Крестовина вверх коротко — стимулятор (в нокауте срабатывает сразу без задержки), удержание крестовины вверх — переключить режим электро-автомата (Шок, Цепная молния, Перегрузка). L2 пешком — турбо-стимулятор (600 HP). Крестовина влево коротко — предыдущая цель навигации, удержание крестовины влево — поставить мину под ноги. Крестовина вправо коротко — следующая цель навигации, удержание крестовины вправо — навести мини-ядерку (при наведении L1 и R1 или крестовина влево-вправо меняют дальность включая «Под себя 4 м», R2 — запуск, Кружок — отмена). Крестовина вниз коротко — включить или выключить маршрут, удержание крестовины вниз — меню команд напарникам, инвентаря и Спецарсенала. Нажатие правого стика (R3) — автоповорот к цели навигации (в воздухе — статус полёта). Кнопка Share/View — карта, Options/Menu — меню игры. L1 и R1 — смена оружия, R2 — огонь.";
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
  let latestSpecialOps = null;
  let latestMode = null;
  let latestTutorialPhase = null;
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
  let squareHoldStartedAt = null;
  let squareElectroTriggered = false;
  let squareDeferredTap = false;
  let dpadDownHoldStartedAt = null;
  let dpadDownSquadTriggered = false;
  let dpadLeftHoldStartedAt = null;
  let dpadLeftMineTriggered = false;
  let dpadRightHoldStartedAt = null;
  let dpadRightNukeTriggered = false;
  let dpadUpHoldStartedAt = null;
  let dpadUpElectroTriggered = false;
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
  let minePressed = false;
  let nukePressed = false;
  let nukeCycleDelta = 0;
  let nukeCancelPressed = false;
  let electroModePressed = false;
  let electroJumpPressed = false;
  let electroJumpHeld = false;
  let electroJumpReleased = false;
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
      const effectType = actuator.type && actuator.type !== "trigger-rumble"
        ? actuator.type
        : "dual-rumble";
      Promise.resolve(actuator.playEffect(effectType, {
        startDelay: 0,
        duration: Math.max(85, Number(options.duration) || 105),
        weakMagnitude: Number(options.weak) || 0.68,
        strongMagnitude: Number(options.strong) || 0.86,
      })).catch(() => {});
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
    dpadDownHoldStartedAt = null;
    dpadDownSquadTriggered = false;
    dpadLeftHoldStartedAt = null;
    dpadLeftMineTriggered = false;
    squareHoldStartedAt = null;
    squareElectroTriggered = false;
    squareDeferredTap = false;
    dpadRightHoldStartedAt = null;
    dpadRightNukeTriggered = false;
    dpadUpHoldStartedAt = null;
    dpadUpElectroTriggered = false;
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
    minePressed = false;
    nukePressed = false;
    nukeCycleDelta = 0;
    nukeCancelPressed = false;
    electroModePressed = false;
    electroJumpPressed = false;
    electroJumpHeld = false;
    electroJumpReleased = false;
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

    const isElectroSuit = Boolean(latestSpecialOps?.electroLukashenko);
    const electroPhase = latestSpecialOps?.electroJumpPhase || "ready";
    const electroAirborne = electroPhase === "rising" || electroPhase === "gliding";
    const electroFuelMs = Number(latestSpecialOps?.electroJumpFuelMs) || 0;

    // Cross/A is contextual: sprint while held on foot, deploy/redeploy parachute in air OR from Electro Super-Jump!
    if (cross.pressed && (latestParachute?.airborne || electroAirborne) && !driving) {
      parachutePressed = true;
      pulseGamepadConfirm({ duration: 95, weak: 0.65, strong: 0.8 });
      emitChanged("gamepad:cross:parachute", true);
    }

    // Circle/B: cancels active Mini-Nuke aim, cuts an open canopy, or crouches/parkour pose.
    if (circle.pressed && !driving) {
      if (latestSpecialOps?.nukeAiming) {
        nukeCancelPressed = true;
        pulseGamepadConfirm({ duration: 75, weak: 0.45, strong: 0.45 });
        emitChanged("gamepad:circle:nuke-cancel", true);
      } else {
        if (latestParachute?.deployed) parachutePressed = true;
        else posePressed = true;
        emitChanged("gamepad:circle", true);
      }
    }

    // Square/X:
    // - On ground in Electro-Lukashenko suit: HOLD Square (>=240ms) -> rocket UP (to 600m) + accelerate FAR FORWARD (up to 15s fuel);
    //   RELEASE Square at any time -> immediately start falling (gliding); short tap -> normal jump!
    // - While falling ("gliding") in Electro-Lukashenko:
    //   * HOLD Square (>=220ms, while 15s fuel remains) -> re-ignite upward & forward thrust!
    //   * Short tap Square (<220ms) -> Meteor Slam straight DOWN!
    //   * Cross (X/A) -> Open Parachute straight from flight!
    // - While rising: releasing Square cuts thrust immediately -> fall; tapping again if not holding slams.
    if (square.pressed && !driving) {
      if (electroPhase === "gliding") {
        if (electroFuelMs > 120) {
          squareHoldStartedAt = now;
          squareElectroTriggered = false;
          squareDeferredTap = true;
        } else {
          electroJumpPressed = true;
          squareHoldStartedAt = null;
          squareElectroTriggered = false;
          squareDeferredTap = false;
          pulseGamepadConfirm({ duration: 130, weak: 0.9, strong: 1.0 });
          emitChanged("gamepad:square:electro-slam", true);
        }
      } else if (electroPhase === "rising") {
        electroJumpPressed = true;
        electroJumpHeld = false;
        squareHoldStartedAt = null;
        squareElectroTriggered = false;
        squareDeferredTap = false;
        pulseGamepadConfirm({ duration: 130, weak: 0.9, strong: 1.0 });
        emitChanged("gamepad:square:electro-slam", true);
      } else if (isElectroSuit && !latestParachute?.airborne) {
        squareHoldStartedAt = now;
        squareElectroTriggered = false;
        squareDeferredTap = true;
      } else {
        jumpPressed = true;
        if (latestMode === "tdm" || latestTutorialPhase === "reload") {
          reload = true;
        }
        emitChanged("gamepad:square:jump", true);
      }
    } else if (square.down && !driving && squareHoldStartedAt != null) {
      const thresholdMs = electroPhase === "gliding" ? 220 : 240;
      if (!squareElectroTriggered && now - squareHoldStartedAt >= thresholdMs) {
        squareElectroTriggered = true;
        squareDeferredTap = false;
        electroJumpHeld = true;
        if (electroPhase !== "gliding") {
          electroJumpPressed = true;
        }
        pulseGamepadConfirm({ duration: 140, weak: 0.85, strong: 0.96 });
        emitChanged(electroPhase === "gliding" ? "gamepad:square:electro-reboost" : "gamepad:square:electro-jump", true);
      } else if (squareElectroTriggered) {
        electroJumpHeld = true;
      }
    } else if (square.released) {
      const wasHeldBoost = squareElectroTriggered;
      electroJumpHeld = false;
      if (!driving && wasHeldBoost) {
        electroJumpReleased = true;
        emitChanged("gamepad:square:electro-jump-release", true);
      } else if (!driving && squareDeferredTap && !wasHeldBoost) {
        if (electroPhase === "gliding") {
          electroJumpPressed = true;
          pulseGamepadConfirm({ duration: 130, weak: 0.9, strong: 1.0 });
          emitChanged("gamepad:square:electro-slam", true);
        } else {
          jumpPressed = true;
          emitChanged("gamepad:square:jump", true);
        }
      }
      squareHoldStartedAt = null;
      squareElectroTriggered = false;
      squareDeferredTap = false;
    } else if (!square.down && electroJumpHeld) {
      electroJumpHeld = false;
      electroJumpReleased = true;
      emitChanged("gamepad:square:electro-jump-release", true);
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

    const menusOpen = Boolean(ctx.services.has("menus") && ctx.services.get("menus")?.open);
    const aimingNuke = Boolean(latestSpecialOps?.nukeAiming) && !driving && !menusOpen;

    if (l1.pressed && !driving) {
      if (aimingNuke) {
        nukeCycleDelta = -1;
        pulseGamepadConfirm({ duration: 65, weak: 0.5, strong: 0.55 });
        emitChanged("gamepad:l1:nuke-distance-prev", true);
      } else {
        selectDelta = -1;
        emitChanged("gamepad:l1", true);
      }
    }
    if (r1.pressed && !driving) {
      if (aimingNuke) {
        nukeCycleDelta = 1;
        pulseGamepadConfirm({ duration: 65, weak: 0.5, strong: 0.55 });
        emitChanged("gamepad:r1:nuke-distance-next", true);
      } else {
        selectDelta = 1;
        emitChanged("gamepad:r1", true);
      }
    }

    // D-Pad Up:
    // - When downed or without electro-rifle: immediate stimulant on press (zero delay!).
    // - On foot with electro-rifle: short tap (<380ms) uses stimulant; hold (>=380ms) switches electro-rifle mode.
    if (menusOpen || driving) {
      dpadUpHoldStartedAt = null;
      dpadUpElectroTriggered = false;
    } else if (dpadUp.pressed) {
      const canCycleElectro = Boolean(latestSpecialOps?.hasElectroRifle || latestSpecialOps?.hasCannon) && !latestSelf?.downed;
      if (!canCycleElectro) {
        stimulantPressed = true;
        pulseGamepadConfirm({ duration: 90, weak: 0.62, strong: 0.78 });
        emitChanged("gamepad:dpad-up:stimulant", true);
        dpadUpHoldStartedAt = null;
        dpadUpElectroTriggered = false;
      } else {
        dpadUpHoldStartedAt = now;
        dpadUpElectroTriggered = false;
      }
    } else if (dpadUp.down && dpadUpHoldStartedAt != null) {
      if (!dpadUpElectroTriggered && (now - dpadUpHoldStartedAt) >= GAMEPAD_SPECIAL_HOLD_MS) {
        dpadUpElectroTriggered = true;
        electroModePressed = true;
        pulseGamepadConfirm({ duration: 110, weak: 0.76, strong: 0.92 });
        emitChanged("gamepad:dpad-up:electro-mode", true);
      }
    } else if (dpadUp.released) {
      const wasShortTap = dpadUpHoldStartedAt != null && !dpadUpElectroTriggered;
      dpadUpHoldStartedAt = null;
      dpadUpElectroTriggered = false;
      if (wasShortTap) {
        stimulantPressed = true;
        pulseGamepadConfirm({ duration: 90, weak: 0.62, strong: 0.78 });
        emitChanged("gamepad:dpad-up:stimulant", true);
      }
    }

    // L2 on foot: Use Turbo Stimulant (600 HP)
    if (l2.pressed && !driving && !latestParachute?.airborne) {
      turboStimulantPressed = true;
      pulseGamepadConfirm({ duration: 110, weak: 0.72, strong: 0.88 });
      emitChanged("gamepad:l2:turbo-stimulant", true);
    }

    // D-Pad Left: Short tap -> prev nav target (or closer nuke distance when aiming); Hold (>=380ms) -> Plant Mine!
    if (menusOpen) {
      dpadLeftHoldStartedAt = null;
      dpadLeftMineTriggered = false;
    } else if (dpadLeft.pressed) {
      dpadLeftHoldStartedAt = now;
      dpadLeftMineTriggered = false;
    } else if (dpadLeft.down && dpadLeftHoldStartedAt != null && !driving) {
      if (!dpadLeftMineTriggered && (now - dpadLeftHoldStartedAt) >= GAMEPAD_SPECIAL_HOLD_MS) {
        dpadLeftMineTriggered = true;
        minePressed = true;
        pulseGamepadConfirm({ duration: 120, weak: 0.78, strong: 0.95 });
        emitChanged("gamepad:dpad-left:mine", true);
      }
    } else if (dpadLeft.released) {
      const wasShortTap = dpadLeftHoldStartedAt != null && !dpadLeftMineTriggered;
      dpadLeftHoldStartedAt = null;
      dpadLeftMineTriggered = false;
      if (wasShortTap) {
        if (aimingNuke) {
          nukeCycleDelta = -1;
          pulseGamepadConfirm({ duration: 65, weak: 0.5, strong: 0.55 });
          emitChanged("gamepad:dpad-left:nuke-distance-prev", true);
        } else {
          navigationPrevPressed = true;
          emitChanged("gamepad:dpad-left:nav-prev", true);
        }
      }
    }

    // D-Pad Right: Short tap -> next nav target (or farther nuke distance when aiming); Hold (>=380ms) -> Aim/Launch Mini-Nuke!
    if (menusOpen) {
      dpadRightHoldStartedAt = null;
      dpadRightNukeTriggered = false;
    } else if (dpadRight.pressed) {
      dpadRightHoldStartedAt = now;
      dpadRightNukeTriggered = false;
    } else if (dpadRight.down && dpadRightHoldStartedAt != null && !driving) {
      if (!dpadRightNukeTriggered && (now - dpadRightHoldStartedAt) >= GAMEPAD_SPECIAL_HOLD_MS) {
        dpadRightNukeTriggered = true;
        nukePressed = true;
        pulseGamepadConfirm({ duration: 135, weak: 0.85, strong: 1.0 });
        emitChanged("gamepad:dpad-right:nuke", true);
      }
    } else if (dpadRight.released) {
      const wasShortTap = dpadRightHoldStartedAt != null && !dpadRightNukeTriggered;
      dpadRightHoldStartedAt = null;
      dpadRightNukeTriggered = false;
      if (wasShortTap) {
        if (aimingNuke) {
          nukeCycleDelta = 1;
          pulseGamepadConfirm({ duration: 65, weak: 0.5, strong: 0.55 });
          emitChanged("gamepad:dpad-right:nuke-distance-next", true);
        } else {
          navigationNextPressed = true;
          emitChanged("gamepad:dpad-right:nav-next", true);
        }
      }
    }

    // D-Pad Down: Short tap toggles active navigation route; Hold (~420ms) opens Squad & Inventory menu.
    if (menusOpen) {
      dpadDownHoldStartedAt = null;
      dpadDownSquadTriggered = false;
    } else if (dpadDown.pressed) {
      dpadDownHoldStartedAt = now;
      dpadDownSquadTriggered = false;
    } else if (dpadDown.down && dpadDownHoldStartedAt != null) {
      if (!dpadDownSquadTriggered && (now - dpadDownHoldStartedAt) >= GAMEPAD_SQUAD_HOLD_MS) {
        dpadDownSquadTriggered = true;
        pulseGamepadConfirm({ duration: 115, weak: 0.72, strong: 0.9 });
        if (typeof input.triggerVirtualAction === "function") {
          input.triggerVirtualAction("squad-menu");
        }
        emitChanged("gamepad:dpad-down:squad-menu", true);
      }
    } else if (dpadDown.released) {
      const wasShortTap = dpadDownHoldStartedAt != null && !dpadDownSquadTriggered;
      dpadDownHoldStartedAt = null;
      dpadDownSquadTriggered = false;
      if (wasShortTap) {
        navigationTogglePressed = true;
        emitChanged("gamepad:dpad-down:nav-toggle", true);
      }
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
      minePressed: Boolean(sampled.minePressed || minePressed),
      nukePressed: Boolean(sampled.nukePressed || nukePressed),
      nukeCycleDelta: Number(sampled.nukeCycleDelta) || nukeCycleDelta,
      nukeCancelPressed: Boolean(sampled.nukeCancelPressed || nukeCancelPressed),
      electroModePressed: Boolean(sampled.electroModePressed || electroModePressed),
      electroJumpPressed: Boolean(sampled.electroJumpPressed || electroJumpPressed),
      electroJumpHeld: Boolean(sampled.electroJumpHeld || electroJumpHeld),
      electroJumpReleased: Boolean(sampled.electroJumpReleased || electroJumpReleased),
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
    minePressed = false;
    nukePressed = false;
    nukeCycleDelta = 0;
    nukeCancelPressed = false;
    electroModePressed = false;
    electroJumpPressed = false;
    electroJumpReleased = false;
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
    latestSpecialOps = snapshot?.specialOps ?? null;
    latestMode = snapshot?.mode ?? network?.mode ?? latestMode;
    latestTutorialPhase = snapshot?.tutorial?.enabled ? (snapshot.tutorial.phase ?? null) : null;
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
    latestSpecialOps = null;
    latestMode = null;
    latestTutorialPhase = null;
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
