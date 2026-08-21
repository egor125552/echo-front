export const manifest = {
  id: "keyboard-input",
  requires: [],
};

export async function setup(ctx) {
  const pressed = new Set();
  let enabled = false;
  let firePressed = false;
  let reload = false;
  let selectDelta = 0;

  const handled = new Set([
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "ShiftLeft", "ShiftRight", "KeyX", "KeyZ", "KeyR",
  ]);

  function stopFireIfNeeded() {
    if (!pressed.has("KeyX")) return;
    pressed.delete("KeyX");
    if (enabled) ctx.events.emit("input:fire-stop", {});
  }

  window.addEventListener("keydown", (event) => {
    if (!enabled) return;
    if (handled.has(event.code)) event.preventDefault();
    if (!pressed.has(event.code)) {
      if (event.code === "KeyX") {
        firePressed = true;
        ctx.events.emit("input:fire-start", {});
      }
      if (event.code === "KeyR") reload = true;
      if (pressed.has("KeyZ") && event.code === "ArrowLeft") selectDelta = -1;
      if (pressed.has("KeyZ") && event.code === "ArrowRight") selectDelta = 1;
    }
    pressed.add(event.code);
  }, { capture: true, passive: false });

  window.addEventListener("keyup", (event) => {
    if (handled.has(event.code) && enabled) event.preventDefault();
    const wasPressed = pressed.delete(event.code);
    if (enabled && wasPressed && event.code === "KeyX") {
      ctx.events.emit("input:fire-stop", {});
    }
  }, { capture: true, passive: false });

  window.addEventListener("blur", () => {
    stopFireIfNeeded();
    pressed.clear();
  });

  ctx.services.provide("input", {
    enable() {
      enabled = true;
    },
    disable() {
      stopFireIfNeeded();
      enabled = false;
      pressed.clear();
    },
    sample() {
      const weaponModifier = pressed.has("KeyZ");
      const sample = {
        forward: (pressed.has("ArrowUp") ? 1 : 0) - (pressed.has("ArrowDown") ? 1 : 0),
        turn: weaponModifier ? 0 : (pressed.has("ArrowRight") ? 1 : 0) - (pressed.has("ArrowLeft") ? 1 : 0),
        sprint: pressed.has("ShiftLeft") || pressed.has("ShiftRight"),
        fireHeld: pressed.has("KeyX"),
        firePressed,
        reload,
        selectDelta,
      };
      firePressed = false;
      reload = false;
      selectDelta = 0;
      return sample;
    },
  });
}
