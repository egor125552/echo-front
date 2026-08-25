import { ENGINE_DIAGNOSTICS_CONTROL } from "./config/engine-diagnostics.js";
import { MatchRoom } from "./server/match-room.js";
import { normalizeGameMode } from "./server/game.js";

export { MatchRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "echo-front",
        diagnosticsEnabled: ENGINE_DIAGNOSTICS_CONTROL.enabled,
        diagnosticsRevision: ENGINE_DIAGNOSTICS_CONTROL.revision,
      });
    }

    if (url.pathname === "/api/diagnostics") {
      if (!ENGINE_DIAGNOSTICS_CONTROL.enabled) {
        return Response.json({ ok: false, diagnosticsEnabled: false }, {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      }
      const rawRoom = (url.searchParams.get("room") || "public").slice(0, 64);
      const mode = normalizeGameMode(url.searchParams.get("mode"));
      const room = env.MATCH_ROOM.getByName(`${mode}:${rawRoom}`);
      return room.fetch(request);
    }

    if (url.pathname === "/api/play") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket required", { status: 426 });
      }
      const rawRoom = (url.searchParams.get("room") || "public").slice(0, 64);
      const mode = normalizeGameMode(url.searchParams.get("mode"));
      const room = env.MATCH_ROOM.getByName(`${mode}:${rawRoom}`);
      return room.fetch(request);
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
