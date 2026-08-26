export const manifest = {
  id: "parachute-input",
  requires: ["keyboard-input", "cloudflare-session"],
};

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const originalSample = input.sample.bind(input);
  let parachutePressed = false;

  function trigger(reason) {
    if (!network.connected) return;
    parachutePressed = true;
    ctx.events.emit("input:changed", { reason });
  }

  input.sample = () => {
    const sampled = originalSample();
    const pressed = parachutePressed;
    parachutePressed = false;
    return { ...sampled, parachutePressed: pressed };
  };

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat || !network.connected) return;
    event.preventDefault();
    trigger("key:Space:down");
  }, { capture: true, passive: false });

  const button = document.querySelector('[data-touch-action="parachute"]');
  button?.addEventListener("click", (event) => {
    event.preventDefault();
    trigger("touch:parachute");
  });
}
