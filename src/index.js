import { ENGINE_DIAGNOSTICS_CONTROL } from "./config/engine-diagnostics.js";
import { ENGINE_CONTROL } from "./config/engine-control.js";
import { ENGINE_COMMAND_REQUEST } from "./config/engine-command-request.js";
import { MatchRoom } from "./server/match-room.js";
import { createEchoFrontGame, normalizeGameMode } from "./server/game.js";

export { MatchRoom };

function errorText(error) {
  const message = String(error?.message ?? error ?? "Unknown server error");
  return message.slice(0, 1000);
}

function errorStack(error) {
  return error?.stack ? String(error.stack).slice(0, 5000) : null;
}

function assertProbeSnapshot(snapshot, mode, playerId, label) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error(`Runtime probe received invalid ${label} snapshot for ${mode}`);
  }
  if (!Array.isArray(snapshot.entities)) {
    throw new Error(`Runtime probe ${label} snapshot has no entity list for ${mode}`);
  }
  if (!snapshot.entities.some((entity) => entity?.id === playerId)) {
    throw new Error(`Runtime probe ${label} snapshot does not contain the connected player for ${mode}`);
  }
  if (mode === "battle-royale" && snapshot.mode !== "battle-royale") {
    throw new Error(`Runtime probe ${label} snapshot has wrong Battle Royale mode`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "echo-front",
        diagnosticsEnabled: ENGINE_DIAGNOSTICS_CONTROL.enabled,
        diagnosticsRevision: ENGINE_DIAGNOSTICS_CONTROL.revision,
        engineControlEnabled: ENGINE_CONTROL.enabled,
        engineControlRevision: ENGINE_CONTROL.revision,
        engineCommandRequestId: ENGINE_COMMAND_REQUEST.id,
      });
    }

    if (url.pathname === "/api/runtime-probe") {
      const headers = { "Cache-Control": "no-store" };
      const mode = normalizeGameMode(url.searchParams.get("mode"));
      let game = null;
      let phase = "create-game";
      try {
        game = await createEchoFrontGame({ mode });

        const probePlayerId = crypto.randomUUID();
        phase = "connect-human";
        game.api.connectHuman(probePlayerId);

        phase = "initial-snapshot";
        const initialSnapshot = typeof game.api.snapshotFor === "function"
          ? game.api.snapshotFor(probePlayerId)
          : game.api.snapshot();
        assertProbeSnapshot(initialSnapshot, mode, probePlayerId, "initial");

        phase = "first-input";
        game.api.handleInput(probePlayerId, {
          forward: 0,
          strafe: 0,
          turn: 0,
          sprint: false,
          fireHeld: false,
        }, Date.now());

        phase = "first-step";
        game.api.step?.(0.05, Date.now());

        phase = "post-input-snapshot";
        const nextSnapshot = typeof game.api.snapshotFor === "function"
          ? game.api.snapshotFor(probePlayerId)
          : game.api.snapshot();
        assertProbeSnapshot(nextSnapshot, mode, probePlayerId, "post-input");

        phase = "complete";
        return Response.json({ ok: true, mode, phase }, { headers });
      } catch (error) {
        return Response.json({
          ok: false,
          mode,
          phase,
          error: errorText(error),
          errorName: String(error?.name ?? "Error").slice(0, 80),
          errorStack: errorStack(error),
        }, { status: 500, headers });
      } finally {
        try { await game?.host?.stop?.(); } catch {}
      }
    }

    if (url.pathname === "/api/play-error") {
      const rawRoom = (url.searchParams.get("room") || "public").slice(0, 64);
      const mode = normalizeGameMode(url.searchParams.get("mode"));
      const room = env.MATCH_ROOM.getByName(`${mode}:${rawRoom}`);
      return room.fetch(request);
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

    if (url.pathname === "/api/engine-command") {
      const headers = { "Cache-Control": "no-store" };
      if (!ENGINE_CONTROL.enabled) {
        return Response.json({ ok: false, engineControlEnabled: false }, { status: 404, headers });
      }
      if (request.method !== "POST") {
        return Response.json({ ok: false, error: "POST required" }, { status: 405, headers });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ ok: false, error: "Invalid JSON request" }, { status: 400, headers });
      }
      if (Number(body?.requestId) !== ENGINE_COMMAND_REQUEST.id || ENGINE_COMMAND_REQUEST.id < 1) {
        return Response.json({ ok: false, error: "Unknown engine request" }, { status: 409, headers });
      }
      const rawRoom = String(ENGINE_COMMAND_REQUEST.room || "public").slice(0, 64);
      const mode = normalizeGameMode(ENGINE_COMMAND_REQUEST.mode);
      const room = env.MATCH_ROOM.getByName(`${mode}:${rawRoom}`);
      const iteration = Math.max(0, Math.floor(Number(body?.iteration) || 0));
      const forwarded = new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: ENGINE_COMMAND_REQUEST.id, iteration }),
      });
      return room.fetch(forwarded);
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
