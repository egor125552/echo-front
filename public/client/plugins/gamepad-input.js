export const manifest = {
  id: "gamepad-input",
  requires: ["keyboard-input", "cloudflare-session"],
};

export const GAMEPAD_DEADZONE = 0.16;
export const GAMEPAD_TRIGGER_DEADZONE = 0.08;
export const GAMEPAD_CHANGE_INTERVAL_MS = 34;
export const GAMEPAD_AXIS_EPSILON = 0.025;

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
  if (document.getElementById("gamepad-controls-help")) return;
  const headings = [...document.querySelectorAll("#game-panel h3")];
  const heading = headings.find((node) => node.textContent?.trim() === "Управление") ?? headings[0];
  if (!heading) return;
  const help = document.createElement("p");
  help.id = "gamepad-controls-help";
  help.textContent = "Геймпад: пешком левый стик — движение, правый стик — поворот камеры и направления персонажа. Крестик или A — бег при удержании, а во время парашютного падения раскрыть или снова раскрыть купол. Квадрат или X — прыжок. Кружок или B — отпустить тело во время обычного прыжка; с раскрытым парашютом — срезать купол. Правый курок — огонь. Треугольник или Y — взаимодействовать и входить или выходить из машины. L1 и R1 — предыдущее и следующее оружие. В машине левый стик поворачивает, правый курок — газ, левый курок — тормоз и задний ход после остановки, нажатие левого стика — ручник. Камера правым стиком работает так же, как пешком.";
  heading.insertAdjacentElement("afterend", help);
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
  let firePressed = false;
  let reload = false;
  let selectDelta = 0;
  let interactPressed = false;
  let parachutePressed = false;
  let posePressed = false;
  let jumpPressed = false;

  ensureAccessibleHelp();

  function emitChanged(reason, immediate = false) {
    if (!network.connected) return;
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
      sprint: state.crossHeld && !latestParachute?.airborne,
      fireHeld: state.rightTrigger >= 0.12,
    };
  }

  function setDriving(next, reason = "snapshot") {
    const value = Boolean(next);
    if (driving === value) return;
    driving = value;
    firePressed = false;
    ctx.events.emit("input:fire-stop", { source: "gamepad", reason: `vehicle:${reason}` });
    emitChanged(`gamepad:vehicle:${value ? "entered" : "exited"}`, true);
  }

  function reset(reason = "reset") {
    const before = effectiveState();
    const hadState = Math.abs(before.forward) > 0.001
      || Math.abs(before.strafe) > 0.001
      || Math.abs(before.turn) > 0.001
      || before.sprint
      || before.fireHeld;
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
    firePressed = false;
    reload = false;
    selectDelta = 0;
    interactPressed = false;
    parachutePressed = false;
    posePressed = false;
    jumpPressed = false;
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
    const cross = buttonEdge(gamepad, 0);
    const circle = buttonEdge(gamepad, 1);
    const square = buttonEdge(gamepad, 2);
    const triangle = buttonEdge(gamepad, 3);
    const l1 = buttonEdge(gamepad, 4);
    const r1 = buttonEdge(gamepad, 5);

    // Cross/A is contextual: it is sprint while held on foot, but during the
    // parachute phase it becomes the explicit deploy/redeploy button.
    if (cross.pressed && latestParachute?.airborne && !driving) {
      parachutePressed = true;
      emitChanged("gamepad:cross:parachute", true);
    }

    // Circle/B explicitly cuts an open canopy. During a normal jump the existing
    // parkour system interprets it as releasing the body into ragdoll/free fall.
    if (circle.pressed && !driving) {
      if (latestParachute?.deployed) parachutePressed = true;
      else posePressed = true;
      emitChanged("gamepad:circle", true);
    }

    // Square/X is now the dedicated jump button.
    if (square.pressed && !driving) {
      jumpPressed = true;
      emitChanged("gamepad:square:jump", true);
    }

    if (triangle.pressed) {
      interactPressed = true;
      emitChanged("gamepad:triangle", true);
    }

    if (l1.pressed && !driving) {
      selectDelta = -1;
      emitChanged("gamepad:l1", true);
    }
    if (r1.pressed && !driving) {
      selectDelta = 1;
      emitChanged("gamepad:r1", true);
    }
  }

  function poll() {
    frameId = window.requestAnimationFrame(poll);

    const inactive = document.hidden
      || (typeof document.hasFocus === "function" && !document.hasFocus());
    if (inactive) {
      if (activeIndex != null) reset("inactive");
      return;
    }

    const gamepad = selectGamepad();
    if (!gamepad) {
      if (activeIndex != null) reset("disconnected");
      return;
    }

    if (activeIndex !== gamepad.index) {
      reset("switched");
      activeIndex = gamepad.index;
      ctx.events.emit("gamepad:connected", {
        index: gamepad.index,
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

  input.sample = () => {
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
      parachutePressed: Boolean(sampled.parachutePressed || parachutePressed),
      posePressed: Boolean(sampled.posePressed || posePressed),
      jumpPressed: Boolean(sampled.jumpPressed || jumpPressed),
    };
    firePressed = false;
    reload = false;
    selectDelta = 0;
    interactPressed = false;
    parachutePressed = false;
    posePressed = false;
    jumpPressed = false;
    return result;
  };

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    latestParachute = self?.parachute ?? null;
    const selfDriving = (snapshot?.vehicles ?? []).some(
      (vehicle) => vehicle?.driverId === network.playerId,
    );
    setDriving(selfDriving, "snapshot");
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (payload.entityId !== network.playerId) return;
    if (packet.event === "vehicle:entered") setDriving(true, "event");
    if (packet.event === "vehicle:exited" || packet.event === "vehicle:driver-lost") {
      setDriving(false, "event");
    }
  });

  ctx.events.on("network:disconnected", () => {
    driving = false;
    reset("network-disconnected");
  });

  window.addEventListener("gamepaddisconnected", (event) => {
    if (event.gamepad?.index === activeIndex) reset("disconnected");
  });
  window.addEventListener("blur", () => reset("blur"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset("hidden");
  });

  frameId = window.requestAnimationFrame(poll);

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
