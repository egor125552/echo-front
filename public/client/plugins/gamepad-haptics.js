export const manifest = {
  id: "gamepad-haptics",
  requires: ["cloudflare-session", "haptic-feedback"],
};

export async function setup(ctx) {
  const haptics = ctx.services.get("haptic-feedback");

  ctx.services.provide("gamepad-haptics", {
    rumble(options) {
      return haptics.rumbleGamepad(options);
    },
    supported() {
      return haptics.gamepadSupported();
    },
  });
}
