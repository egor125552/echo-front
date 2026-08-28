export const manifest = {
  id: "parkour-input",
  requires: ["keyboard-input", "cloudflare-session"],
};

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const originalSample = input.sample.bind(input);
  let posePressed = false;

  function trigger(reason) {
    if (!network.connected) return false;
    posePressed = true;
    ctx.events.emit("input:changed", { reason });
    return true;
  }

  input.sample = () => {
    const sampled = originalSample();
    const pressed = posePressed;
    posePressed = false;
    return { ...sampled, posePressed: pressed };
  };

  window.addEventListener("keydown", (event) => {
    if (!network.connected || event.repeat || event.code !== "KeyC") return;
    event.preventDefault();
    trigger("key:KeyC:pose");
  }, { capture: true, passive: false });

  const button = document.querySelector('[data-touch-action="parkour-pose"]');
  button?.addEventListener("click", (event) => {
    event.preventDefault();
    trigger("touch:parkour-pose");
  });
}
