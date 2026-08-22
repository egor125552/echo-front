export function createKeyboardInput(sendInput) {
  const state = {
    forward: 0,
    strafe: 0,
  };

  const pressed = new Set();

  function rebuild() {
    state.forward = (pressed.has("ArrowUp") ? 1 : 0) + (pressed.has("ArrowDown") ? -1 : 0);
    state.strafe = (pressed.has("ArrowRight") ? 1 : 0) + (pressed.has("ArrowLeft") ? -1 : 0);
    sendInput({
      forward: Math.max(-1, Math.min(1, state.forward)),
      strafe: Math.max(-1, Math.min(1, state.strafe)),
    });
  }

  function keyDown(event) {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    pressed.add(event.key);
    rebuild();
  }

  function keyUp(event) {
    if (!pressed.has(event.key)) return;
    pressed.delete(event.key);
    rebuild();
  }

  window.addEventListener("keydown", keyDown, { passive: false });
  window.addEventListener("keyup", keyUp);

  return function dispose() {
    window.removeEventListener("keydown", keyDown);
    window.removeEventListener("keyup", keyUp);
    pressed.clear();
  };
}
