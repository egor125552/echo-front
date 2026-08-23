export const manifest = {
  id: "keyboard-input",
  requires: [],
};

function clampAxis(value) {
  return Math.max(-1, Math.min(1, value));
}

export function shouldHandleControlClick(detail, now, suppressUntil) {
  return Number(detail) === 0 || Number(now) >= Number(suppressUntil || 0);
}

export function sampleKeyboardState(pressed, {
  firePressed = false,
  reload = false,
  selectDelta = 0,
} = {}) {
  const weaponModifier = pressed.has("KeyZ");
  return {
    forward: (pressed.has("ArrowUp") ? 1 : 0) - (pressed.has("ArrowDown") ? 1 : 0),
    strafe: weaponModifier
      ? 0
      : (pressed.has("ArrowRight") ? 1 : 0) - (pressed.has("ArrowLeft") ? 1 : 0),
    turn: 0,
    sprint: pressed.has("ShiftLeft") || pressed.has("ShiftRight"),
    fireHeld: pressed.has("KeyX"),
    firePressed,
    reload,
    selectDelta,
  };
}

export function sampleInputState(pressed, touch = {}, flags = {}) {
  const keyboard = sampleKeyboardState(pressed, flags);
  return {
    ...keyboard,
    forward: clampAxis(
      keyboard.forward + (touch.forward ? 1 : 0) - (touch.back ? 1 : 0),
    ),
    strafe: clampAxis(
      keyboard.strafe + (touch.right ? 1 : 0) - (touch.left ? 1 : 0),
    ),
    turn: 0,
    sprint: keyboard.sprint || Boolean(touch.sprint),
    fireHeld: keyboard.fireHeld || Boolean(touch.fireHeld),
  };
}

export async function setup(ctx) {
  const pressed = new Set();
  const touch = {
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false,
    fireHeld: false,
  };
  let enabled = false;
  let firePressed = false;
  let reload = false;
  let selectDelta = 0;

  const clickSuppression = new WeakMap();
  const handled = new Set([
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "ShiftLeft", "ShiftRight", "KeyX", "KeyZ", "KeyR",
  ]);

  const opposite = {
    forward: "back",
    back: "forward",
    left: "right",
    right: "left",
  };

  const movementButtons = [...document.querySelectorAll("[data-touch-control]")];
  const actionButtons = [...document.querySelectorAll("[data-touch-action]")];

  function notifyChanged(reason) {
    if (enabled) ctx.events.emit("input:changed", { reason });
  }

  function suppressPointerFollowup(button) {
    clickSuppression.set(button, performance.now() + 600);
  }

  function handleControlClick(event, button) {
    return shouldHandleControlClick(
      event.detail,
      performance.now(),
      clickSuppression.get(button) ?? 0,
    );
  }

  function emitTouch(control, down) {
    if (enabled) ctx.events.emit("input:touch", { control, down });
  }

  function syncPressedState() {
    for (const button of movementButtons) {
      const control = button.dataset.touchControl;
      if (control === "stop") continue;
      button.setAttribute("aria-pressed", touch[control] ? "true" : "false");
    }
    for (const button of actionButtons) {
      const action = button.dataset.touchAction;
      if (action === "sprint") button.setAttribute("aria-pressed", touch.sprint ? "true" : "false");
      if (action === "fire") button.setAttribute("aria-pressed", touch.fireHeld ? "true" : "false");
    }
  }

  function setTouchDirection(control, down) {
    if (!(control in opposite)) return;
    const previous = touch[control];
    const oppositeControl = opposite[control];
    const oppositeWasDown = Boolean(touch[oppositeControl]);
    if (down) touch[oppositeControl] = false;
    touch[control] = down;
    if (previous === down && !oppositeWasDown) return;
    syncPressedState();
    if (oppositeWasDown) emitTouch(oppositeControl, false);
    emitTouch(control, down);
    notifyChanged(`touch:${control}:${down ? "down" : "up"}`);
  }

  function clearTouchMovement() {
    let changed = false;
    for (const control of ["forward", "back", "left", "right"]) {
      if (!touch[control]) continue;
      touch[control] = false;
      emitTouch(control, false);
      changed = true;
    }
    if (changed) {
      syncPressedState();
      notifyChanged("touch:stop");
    }
  }

  function stopFireIfNeeded() {
    const keyboardFire = pressed.delete("KeyX");
    const touchFire = touch.fireHeld;
    touch.fireHeld = false;
    if ((keyboardFire || touchFire) && enabled) ctx.events.emit("input:fire-stop", {});
    return keyboardFire || touchFire;
  }

  function resetPressed(reason) {
    const hadState = pressed.size > 0 || Object.values(touch).some(Boolean);
    stopFireIfNeeded();
    pressed.clear();
    for (const key of Object.keys(touch)) touch[key] = false;
    firePressed = false;
    reload = false;
    selectDelta = 0;
    syncPressedState();
    if (hadState) {
      ctx.events.emit("input:reset", { reason });
      notifyChanged(`reset:${reason}`);
    }
  }

  window.addEventListener("keydown", (event) => {
    if (!enabled) return;
    if (handled.has(event.code)) event.preventDefault();
    if (!handled.has(event.code)) return;

    if (!pressed.has(event.code)) {
      ctx.events.emit("input:key", { code: event.code, down: true });
      if (event.code === "KeyX") {
        firePressed = true;
        ctx.events.emit("input:fire-start", {});
      }
      if (event.code === "KeyR") reload = true;
      if (pressed.has("KeyZ") && event.code === "ArrowLeft") selectDelta = -1;
      if (pressed.has("KeyZ") && event.code === "ArrowRight") selectDelta = 1;
      pressed.add(event.code);
      notifyChanged(`key:${event.code}:down`);
      return;
    }

    pressed.add(event.code);
  }, { capture: true, passive: false });

  window.addEventListener("keyup", (event) => {
    if (!handled.has(event.code)) return;
    if (enabled) event.preventDefault();
    const wasPressed = pressed.delete(event.code);
    if (enabled && wasPressed) ctx.events.emit("input:key", { code: event.code, down: false });
    if (enabled && wasPressed && event.code === "KeyX") ctx.events.emit("input:fire-stop", {});

    if (event.code === "KeyZ") {
      pressed.delete("ArrowLeft");
      pressed.delete("ArrowRight");
    }

    if (wasPressed) notifyChanged(`key:${event.code}:up`);
  }, { capture: true, passive: false });

  window.addEventListener("blur", () => resetPressed("blur"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetPressed("hidden");
  });

  for (const button of movementButtons) {
    const control = button.dataset.touchControl;
    if (control === "stop") {
      button.addEventListener("click", (event) => {
        if (!enabled || !handleControlClick(event, button)) return;
        clearTouchMovement();
      });
      continue;
    }

    const release = (event) => {
      if (!touch[control]) return;
      suppressPointerFollowup(button);
      setTouchDirection(control, false);
      try { button.releasePointerCapture?.(event.pointerId); } catch {}
    };

    button.addEventListener("pointerdown", (event) => {
      if (!enabled) return;
      event.preventDefault();
      suppressPointerFollowup(button);
      try { button.setPointerCapture?.(event.pointerId); } catch {}
      setTouchDirection(control, true);
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("click", (event) => {
      if (!enabled || !handleControlClick(event, button)) return;
      event.preventDefault();
      setTouchDirection(control, !touch[control]);
    });
  }

  for (const button of actionButtons) {
    const action = button.dataset.touchAction;

    if (action === "fire") {
      const releaseFire = (event) => {
        if (!touch.fireHeld) return;
        suppressPointerFollowup(button);
        touch.fireHeld = false;
        syncPressedState();
        if (enabled) ctx.events.emit("input:fire-stop", {});
        notifyChanged("touch:fire:up");
        try { button.releasePointerCapture?.(event.pointerId); } catch {}
      };
      button.addEventListener("pointerdown", (event) => {
        if (!enabled) return;
        event.preventDefault();
        suppressPointerFollowup(button);
        try { button.setPointerCapture?.(event.pointerId); } catch {}
        touch.fireHeld = true;
        firePressed = true;
        syncPressedState();
        ctx.events.emit("input:fire-start", {});
        notifyChanged("touch:fire:down");
      });
      button.addEventListener("pointerup", releaseFire);
      button.addEventListener("pointercancel", releaseFire);
      button.addEventListener("click", (event) => {
        if (!enabled || !handleControlClick(event, button)) return;
        event.preventDefault();
        firePressed = true;
        ctx.events.emit("input:fire-start", {});
        ctx.events.emit("input:fire-stop", {});
        notifyChanged("touch:fire:click");
      });
      continue;
    }

    if (action === "sprint") {
      const releaseSprint = (event) => {
        if (!touch.sprint) return;
        suppressPointerFollowup(button);
        touch.sprint = false;
        syncPressedState();
        emitTouch("sprint", false);
        notifyChanged("touch:sprint:up");
        try { button.releasePointerCapture?.(event.pointerId); } catch {}
      };
      button.addEventListener("pointerdown", (event) => {
        if (!enabled) return;
        event.preventDefault();
        suppressPointerFollowup(button);
        try { button.setPointerCapture?.(event.pointerId); } catch {}
        touch.sprint = true;
        syncPressedState();
        emitTouch("sprint", true);
        notifyChanged("touch:sprint:down");
      });
      button.addEventListener("pointerup", releaseSprint);
      button.addEventListener("pointercancel", releaseSprint);
      button.addEventListener("click", (event) => {
        if (!enabled || !handleControlClick(event, button)) return;
        event.preventDefault();
        touch.sprint = !touch.sprint;
        syncPressedState();
        emitTouch("sprint", touch.sprint);
        notifyChanged(`touch:sprint:${touch.sprint ? "on" : "off"}`);
      });
      continue;
    }

    button.addEventListener("click", (event) => {
      if (!enabled || !handleControlClick(event, button)) return;
      if (action === "reload") reload = true;
      if (action === "weapon-prev") selectDelta = -1;
      if (action === "weapon-next") selectDelta = 1;
      emitTouch(action, true);
      notifyChanged(`touch:${action}`);
    });
  }

  syncPressedState();

  ctx.services.provide("input", {
    enable() {
      enabled = true;
    },
    disable() {
      resetPressed("disabled");
      enabled = false;
    },
    sample() {
      const sample = sampleInputState(pressed, touch, { firePressed, reload, selectDelta });
      firePressed = false;
      reload = false;
      selectDelta = 0;
      return sample;
    },
  });
}
