export const manifest = {
  id: "parachute-input",
  requires: ["keyboard-input", "cloudflare-session"],
};

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const originalSample = input.sample.bind(input);
  let parachutePressed = false;

  input.sample = () => {
    const sampled = originalSample();
    const pressed = parachutePressed;
    parachutePressed = false;
    return { ...sampled, parachutePressed: pressed };
  };

  window.addEventListener("keydown", (event) => {
    if (event.code !== "KeyP" || event.repeat || !network.connected) return;
    event.preventDefault();
    parachutePressed = true;
    ctx.events.emit("input:changed", { reason: "key:KeyP:down" });
  }, { capture: true, passive: false });
}
