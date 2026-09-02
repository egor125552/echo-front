export const manifest = {
  id: "keyboard-camera-turn",
  version: "1.0.1",
  requires: ["keyboard-input"],
};

function appleKeyboardPlatform() {
  const platform = String(
    navigator.userAgentData?.platform
      ?? navigator.platform
      ?? navigator.userAgent
      ?? "",
  ).toLowerCase();
  return /mac|iphone|ipad|ipod/.test(platform);
}

function ensureAccessibleHelp(applePlatform) {
  if (document.getElementById("keyboard-camera-controls-help")) return;
  const headings = [...document.querySelectorAll("#game-panel h3")];
  const heading = headings.find((node) => node.textContent?.trim() === "Управление") ?? headings[0];
  if (!heading) return;
  const help = document.createElement("p");
  help.id = "keyboard-camera-controls-help";
  help.textContent = applePlatform
    ? "Поворот взгляда с клавиатуры: удерживайте Command и стрелку влево или вправо. Без Command эти стрелки по-прежнему двигают персонажа вбок."
    : "Поворот взгляда с клавиатуры: удерживайте Alt и стрелку влево или вправо. Без Alt эти стрелки по-прежнему двигают персонажа вбок.";
  heading.insertAdjacentElement("afterend", help);
}

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const originalSample = input.sample.bind(input);
  const applePlatform = appleKeyboardPlatform();
  const modifierCodes = new Set(
    applePlatform
      ? ["MetaLeft", "MetaRight"]
      : ["AltLeft", "AltRight"],
  );
  const pressedModifiers = new Set();

  ensureAccessibleHelp(applePlatform);

  function modifierDown() {
    return pressedModifiers.size > 0;
  }

  function notify(reason) {
    ctx.events.emit("input:changed", { reason });
  }

  input.sample = () => {
    const sampled = originalSample();
    if (!modifierDown()) return sampled;

    // ArrowLeft/ArrowRight are ordinary strafe in keyboard-input. While the
    // platform camera modifier is held, feed that exact axis into `turn`
    // instead. The server then uses the same HUMAN_TURN_SPEED path as the
    // gamepad right stick, rather than a second camera implementation.
    const horizontal = Math.max(-1, Math.min(1, Number(sampled.strafe) || 0));
    return {
      ...sampled,
      strafe: 0,
      turn: horizontal,
    };
  };

  window.addEventListener("keydown", (event) => {
    if (!modifierCodes.has(event.code)) return;
    if (pressedModifiers.has(event.code)) return;
    pressedModifiers.add(event.code);
    notify(`camera-modifier:${event.code}:down`);
  }, { capture: true });

  window.addEventListener("keyup", (event) => {
    if (!modifierCodes.has(event.code)) return;
    if (!pressedModifiers.delete(event.code)) return;
    notify(`camera-modifier:${event.code}:up`);
  }, { capture: true });

  function reset(reason) {
    if (!pressedModifiers.size) return;
    pressedModifiers.clear();
    notify(`camera-modifier:${reason}`);
  }

  window.addEventListener("blur", () => reset("blur"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset("hidden");
  });
}
