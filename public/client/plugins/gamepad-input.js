export const manifest = {
  id: "gamepad-input",
  requires: ["keyboard-input", "cloudflare-session"],
};

export const GAMEPAD_DEADZONE = 0.16;
export const GAMEPAD_CHANGE_INTERVAL_MS = 34;
export const GAMEPAD_AXIS_EPSILON = 0.025;

function clampAxis(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

function shapeAxis(value, exponent = 1.45) {
  const numeric = clampAxis(value);
  const magnitude = Math.abs(numeric);
  if (magnitude <= GAMEPAD_DEADZONE) return 0;
  const normalized = (magnitude - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE);
  return Math.sign(numeric) * Math.pow(normalized, exponent);
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
  help.textContent = "Геймпад: левый стик — движение, правый стик — поворот камеры и направления персонажа. Нажатие левого стика — бег, а в машине ручник. Правый курок — огонь, а при управлении машиной используется существующее нитро. Крестик или A — прыжок, а в падении раскрыть или снова раскрыть парашют. Кружок или B — отпустить тело в обычном прыжке, а с раскрытым парашютом срезать купол. Треугольник или Y — взаимодействовать и входить или выходить из машины. Квадрат или X — перезарядка. L1 и R1 — предыдущее и следующее оружие.";
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
  let analog = { forward: 0, strafe: 0, turn: 0, sprint: false, fireHeld: false };
  let previousButtons = new Map();
  let firePressed = false;
  let reload = false;
  let selectDelta = 0;
  let interactPressed = false;
  let parachutePressed = false;
  let posePressed = false;

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

  function reset(reason = "reset") {
    const hadState = Math.abs(analog.forward) > 0.001
      || Math.abs(analog.strafe) > 0.001
      || Math.abs(analog.turn) > 0.001
      || analog.sprint
      || analog.fireHeld;
    analog = { forward: 0, strafe: 0, turn: 0, sprint: false, fireHeld: false };
    previousButtons = new Map();
    activeIndex = null;
    firePressed = false;
    reload = false;
    selectDelta = 0;
    interactPressed = false;
    parachutePressed = false;
    posePressed = false;
    pendingAnalogNotify = false;
    ctx.events.emit("input:gamepad-turn", { turn: 0, reason });
    if (hadState) emitChanged(`gamepad:${reason}`, true);
  }

  function updateAnalog(gamepad) {
    const next = {
      forward: -shapeAxis(gamepad.axes?.[1] ?? 0, 1.35),
      strafe: shapeAxis(gamepad.axes?.[0] ?? 0, 1.35),
      turn: shapeAxis(gamepad.axes?.[2] ?? 0, 1.6),
      sprint: buttonDown(gamepad, 10),
      fireHeld: buttonValue(gamepad, 7) >= 0.12,
    };

    const changed = Math.abs(next.forward - analog.forward) >= GAMEPAD_AXIS_EPSILON
      || Math.abs(next.strafe - analog.strafe) >= GAMEPAD_AXIS_EPSILON
      || Math.abs(next.turn - analog.turn) >= GAMEPAD_AXIS_EPSILON
      || next.sprint !== analog.sprint
      || next.fireHeld !== analog.fireHeld;
    const centered = Math.abs(next.forward) < 0.001
      && Math.abs(next.strafe) < 0.001
      && Math.abs(next.turn) < 0.001;
    const wasCentered = Math.abs(analog.forward) < 0.001
      && Math.abs(analog.strafe) < 0.001
      && Math.abs(analog.turn) < 0.001;

    if (Math.abs(next.turn - analog.turn) >= 0.005) {
      ctx.events.emit("input:gamepad-turn", { turn: next.turn, reason: "right-stick" });
    }

    if (!analog.fireHeld && next.fireHeld) {
      firePressed = true;
      ctx.events.emit("input:fire-start", { source: "gamepad" });
    } else if (analog.fireHeld && !next.fireHeld) {
      ctx.events.emit("input:fire-stop", { source: "gamepad" });
    }

    analog = next;
    if (changed) emitChanged("gamepad:analog", centered && !wasCentered);
  }

  function updateButtons(gamepad) {
    const cross = buttonEdge(gamepad, 0);
    const circle = buttonEdge(gamepad, 1);
    const square = buttonEdge(gamepad, 2);
    const triangle = buttonEdge(gamepad, 3);
    const l1 = buttonEdge(gamepad, 4);
    const r1 = buttonEdge(gamepad, 5);

    if (cross.pressed) {
      parachutePressed = true;
      emitChanged("gamepad:cross", true);
    }

    if (circle.pressed) {
      if (latestParachute?.deployed) parachutePressed = true;
      else posePressed = true;
      emitChanged("gamepad:circle", true);
    }

    if (square.pressed) {
      reload = true;
      emitChanged("gamepad:square", true);
    }
    if (triangle.pressed) {
      interactPressed = true;
      emitChanged("gamepad:triangle", true);
    }

    if (l1.pressed) {
      selectDelta = -1;
      emitChanged("gamepad:l1", true);
    }
    if (r1.pressed) {
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
    const result = {
      ...sampled,
      forward: clampAxis((Number(sampled.forward) || 0) + analog.forward),
      strafe: clampAxis((Number(sampled.strafe) || 0) + analog.strafe),
      turn: clampAxis((Number(sampled.turn) || 0) + analog.turn),
      sprint: Boolean(sampled.sprint || analog.sprint),
      fireHeld: Boolean(sampled.fireHeld || analog.fireHeld),
      firePressed: Boolean(sampled.firePressed || firePressed),
      reload: Boolean(sampled.reload || reload),
      selectDelta: Number(sampled.selectDelta) || selectDelta,
      interactPressed: Boolean(sampled.interactPressed || interactPressed),
      parachutePressed: Boolean(sampled.parachutePressed || parachutePressed),
      posePressed: Boolean(sampled.posePressed || posePressed),
    };
    firePressed = false;
    reload = false;
    selectDelta = 0;
    interactPressed = false;
    parachutePressed = false;
    posePressed = false;
    return result;
  };

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    latestParachute = self?.parachute ?? null;
  });
  ctx.events.on("network:disconnected", () => reset("network-disconnected"));

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
    get state() { return { ...analog }; },
    stop() {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      reset("stopped");
    },
  });
}
