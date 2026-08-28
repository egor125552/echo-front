export const manifest = {
  id: "network-diagnostics-journal",
  version: "1.0.0",
  requires: ["cloudflare-session", "play-journal"],
};

export async function setup(ctx) {
  const journal = ctx.services.get("play-journal");
  ctx.events.on("network:diagnostics", (packet = {}) => {
    journal.marker("network-diagnostics", packet);
  });
}
