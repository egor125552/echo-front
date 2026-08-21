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

  window.addEventListener("keydown", (event) => {
    if (!enabled) return;
    if (handled.has(event.code)) event.preventDefault();
    if (!pressed.has(event.code)) {
      if (event.code === "KeyX") firePressed = true;
      if (event.code === "KeyR") reload = true;
      if (pressed.has("KeyZ") && event.code === "ArrowLeft") selectDelta = -1;
      if (pressed.has("KeyZ") && event.code === "ArrowRight") selectDelta = 1;
    }
    pressed.add(event.code);
  }, { passive: false });

  window.addEventListener("keyup", (event) => {
    if (handled.has(event.code) && enabled) event.preventDefault();
    pressed.delete(event.code);
  }, { passive: false });

  window.addEventListener("blur", () => pressed.clear());

  ctx.services.provide("input", {
    enable() {
      enabled = true;
    },
    disable() {
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
