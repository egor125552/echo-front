import { DurableObject } from "cloudflare:workers";
import { ENGINE_DIAGNOSTICS_CONTROL } from "../config/engine-diagnostics.js";
import { createEchoFrontGame, normalizeGameMode } from "./game.js";
import { handleEngineControlRequest } from "./engine-control-route.js";
import {
  activeSocketCount,
  cleanupDeadline,
  normalizePlayerSessionId,
  reconnectExpired,
} from "./room-lifecycle.js";
import { advanceSimulation, SIMULATION_TICK_MS } from "./game-clock.js";

function monotonicNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function freshDiagnosticsStats() {
  return {
    tickCount: 0,
    snapshotBroadcasts: 0,
    eventBroadcasts: 0,
    eventPacketsBroadcast: 0,
    droppedMsTotal: 0,
    maxTickWallMs: 0,
    lastTickWallMs: 0,
    lastTickAt: null,
    lastSimulation: null,
    tickSamples: [],
  };
}

export class MatchRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    this.mode = null;
    this.gameLoopTimer = null;
    this.lastStepAt = Date.now();
    this.lastSnapshotAt = 0;
    this.disconnectedHumans = new Map();
    this.diagnosticsStats = freshDiagnosticsStats();

    ctx.blockConcurrencyWhile(async () => {
      const sockets = this.ctx.getWebSockets();
      if (!activeSocketCount(sockets)) return;
      const mode = normalizeGameMode(
        sockets.map((socket) => {
          try { return socket.deserializeAttachment()?.mode; } catch { return null; }
        }).find(Boolean),
      );
      await this.ensureGame(mode);
      for (const ws of sockets) {
        if (ws.readyState === 3) continue;
        const attachment = ws.deserializeAttachment();
        if (!attachment?.playerId) continue;
        try { this.game.api.connectHuman(attachment.playerId); } catch {}
      }
      this.startGameLoop();
    });
  }

  async ensureGame(mode = "tdm") {
    const normalized = normalizeGameMode(mode);
    if (this.game && this.mode !== normalized) {
      throw new Error(`Match room mode mismatch: ${this.mode} vs ${normalized}`);
    }
    if (!this.game) {
      this.mode = normalized;
      this.game = await createEchoFrontGame({ mode: normalized });
      this.lastStepAt = Date.now();
      this.lastSnapshotAt = 0;
      this.diagnosticsStats = freshDiagnosticsStats();
    }
    return this.game;
  }

  socketsForPlayer(playerId, excludedSocket = null) {
    return this.ctx.getWebSockets().filter((socket) => {
      if (!socket || socket === excludedSocket || socket.readyState === 3) return false;
      try { return socket.deserializeAttachment()?.playerId === playerId; } catch { return false; }
    });
  }

  cleanupDisconnectedHumans(now = Date.now()) {
    if (!this.game) return;
    for (const [playerId, disconnectedAt] of this.disconnectedHumans) {
      if (this.socketsForPlayer(playerId).length) {
        this.disconnectedHumans.delete(playerId);
        continue;
      }
      if (!reconnectExpired(disconnectedAt, now)) continue;
      this.game.api.disconnectHuman(playerId);
      this.disconnectedHumans.delete(playerId);
    }
  }

  startGameLoop() {
    if (this.gameLoopTimer || !this.game) return;
    this.lastStepAt = Date.now();
    this.gameLoopTimer = setInterval(() => this.runGameLoopTick(), SIMULATION_TICK_MS);
  }

  stopGameLoop() {
    if (this.gameLoopTimer) clearInterval(this.gameLoopTimer);
    this.gameLoopTimer = null;
  }

  recordTickDiagnostics(now, startedAt, result) {
    const wallMs = Math.max(0, monotonicNow() - startedAt);
    const stats = this.diagnosticsStats;
    stats.tickCount += 1;
    stats.lastTickAt = now;
    stats.lastTickWallMs = wallMs;
    stats.maxTickWallMs = Math.max(stats.maxTickWallMs, wallMs);
    stats.droppedMsTotal += result.droppedMs;
    stats.lastSimulation = {
      simulatedMs: result.simulatedMs,
      droppedMs: result.droppedMs,
      steps: result.steps,
    };
    stats.tickSamples.push({
      at: now,
      wallMs: Number(wallMs.toFixed(3)),
      simulatedMs: result.simulatedMs,
      droppedMs: result.droppedMs,
      steps: result.steps,
      sockets: activeSocketCount(this.ctx.getWebSockets()),
    });
    const max = Math.max(10, ENGINE_DIAGNOSTICS_CONTROL.maxTickSamples || 120);
    if (stats.tickSamples.length > max) stats.tickSamples.splice(0, stats.tickSamples.length - max);
  }

  runGameLoopTick() {
    if (!this.game) return;
    if (!activeSocketCount(this.ctx.getWebSockets())) {
      this.stopGameLoop();
      return;
    }
    const now = Date.now();
    const startedAt = monotonicNow();
    try {
      this.cleanupDisconnectedHumans(now);
      const result = advanceSimulation(this.game, this.lastStepAt, now);
      this.lastStepAt = result.lastStepAt;
      this.recordTickDiagnostics(now, startedAt, result);
      if (result.droppedMs > 0) {
        console.warn(JSON.stringify({
          event: "echo-front-simulation-catchup-capped",
          droppedMs: result.droppedMs,
          simulatedMs: result.simulatedMs,
        }));
      }
      this.broadcastEvents();
      this.broadcastSnapshot();
    } catch (error) {
      console.error(JSON.stringify({
        event: "echo-front-game-loop-error",
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  diagnosticsResponse(requestUrl) {
    const headers = { "Cache-Control": "no-store" };
    if (!this.game) {
      return Response.json({
        ok: true,
        diagnosticsEnabled: true,
        roomActive: false,
        mode: this.mode,
        sockets: activeSocketCount(this.ctx.getWebSockets()),
        room: this.diagnosticsStats,
      }, { headers });
    }
    const entityId = requestUrl.searchParams.get("entity") || null;
    return Response.json({
      ok: true,
      diagnosticsEnabled: true,
      roomActive: true,
      mode: this.mode,
      sockets: activeSocketCount(this.ctx.getWebSockets()),
      disconnectedHumans: this.disconnectedHumans.size,
      loopRunning: Boolean(this.gameLoopTimer),
      lastStepAt: this.lastStepAt,
      lastSnapshotAt: this.lastSnapshotAt,
      room: this.diagnosticsStats,
      game: this.game.diagnostics({ entityId }),
    }, { headers });
  }

  async fetch(request) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/api/diagnostics") return this.diagnosticsResponse(requestUrl);
    if (requestUrl.pathname === "/api/engine-command") return handleEngineControlRequest(this, request);

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

    const mode = normalizeGameMode(requestUrl.searchParams.get("mode"));
    await this.ctx.storage.deleteAlarm();
    await this.ensureGame(mode);
    this.cleanupDisconnectedHumans();

    const requestedPlayerId = normalizePlayerSessionId(requestUrl.searchParams.get("player"));
    const playerId = requestedPlayerId ?? crypto.randomUUID();
    const previousSockets = this.socketsForPlayer(playerId);

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId, mode });
    this.disconnectedHumans.delete(playerId);

    const joined = this.game.api.connectHuman(playerId);
    const initialSnapshot = typeof this.game.api.snapshotFor === "function"
      ? this.game.api.snapshotFor(playerId)
      : this.game.api.snapshot();
    server.send(JSON.stringify({
      type: "welcome",
      playerId,
      team: joined.team,
      mode,
      resumed: Boolean(joined.resumed),
      snapshot: initialSnapshot,
    }));

    for (const oldSocket of previousSockets) {
      try { oldSocket.close(4001, "Reconnected"); } catch {}
    }

    this.startGameLoop();
    this.broadcastSnapshot(true);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string") return;
    const attachment = ws.deserializeAttachment();
    await this.ensureGame(attachment?.mode ?? "tdm");
    let data;
    try { data = JSON.parse(message); } catch { return; }
    const playerId = attachment?.playerId;
    if (!playerId) return;
    const now = Date.now();
    if (data.type === "input") this.game.api.handleInput(playerId, data.input ?? {}, now);
    this.startGameLoop();
    this.broadcastEvents();
  }

  markSocketDisconnected(ws) {
    const playerId = ws.deserializeAttachment()?.playerId;
    if (!playerId || !this.game) return;
    if (this.socketsForPlayer(playerId, ws).length) return;
    this.game.api.suspendHuman(playerId);
    this.disconnectedHumans.set(playerId, Date.now());
  }

  async webSocketClose(ws) {
    this.markSocketDisconnected(ws);
    this.broadcastSnapshot(true);
    await this.scheduleCleanupIfEmpty(ws);
  }

  async webSocketError(ws) {
    this.markSocketDisconnected(ws);
    await this.scheduleCleanupIfEmpty(ws);
  }

  async scheduleCleanupIfEmpty(closingSocket = null) {
    const sockets = this.ctx.getWebSockets();
    if (activeSocketCount(sockets, closingSocket) > 0) return;
    this.stopGameLoop();
    await this.ctx.storage.setAlarm(cleanupDeadline());
  }

  async alarm() {
    if (activeSocketCount(this.ctx.getWebSockets()) > 0) {
      await this.ctx.storage.deleteAlarm();
      this.startGameLoop();
      return;
    }
    this.stopGameLoop();
    if (this.game) {
      await this.game.host.stop();
      this.game = null;
    }
    this.mode = null;
    this.disconnectedHumans.clear();
    this.lastStepAt = Date.now();
    this.lastSnapshotAt = 0;
    this.diagnosticsStats = freshDiagnosticsStats();
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  broadcastEvents() {
    if (!this.game) return;
    const packets = this.game.drainEvents();
    if (!packets.length) return;
    this.diagnosticsStats.eventBroadcasts += 1;
    this.diagnosticsStats.eventPacketsBroadcast += packets.length;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const playerId = socket.deserializeAttachment()?.playerId;
        const selected = typeof this.game.api.eventsForPlayer === "function"
          ? this.game.api.eventsForPlayer(playerId, packets)
          : packets;
        if (!selected.length) continue;
        socket.send(JSON.stringify({ type: "events", events: selected }));
      } catch {}
    }
  }

  broadcastSnapshot(force = false) {
    if (!this.game) return;
    const now = Date.now();
    const interval = Number(this.game.api.snapshotIntervalMs) || 100;
    if (!force && now - this.lastSnapshotAt < interval) return;
    this.lastSnapshotAt = now;
    this.diagnosticsStats.snapshotBroadcasts += 1;

    if (typeof this.game.api.snapshotFor !== "function") {
      const message = JSON.stringify({ type: "snapshot", snapshot: this.game.api.snapshot(now) });
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(message); } catch {}
      }
      return;
    }

    for (const socket of this.ctx.getWebSockets()) {
      try {
        const playerId = socket.deserializeAttachment()?.playerId;
        socket.send(JSON.stringify({
          type: "snapshot",
          snapshot: this.game.api.snapshotFor(playerId, now),
        }));
      } catch {}
    }
  }
}
