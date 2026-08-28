import { DurableObject } from "cloudflare:workers";
import { ENGINE_DIAGNOSTICS_CONTROL } from "../config/engine-diagnostics.js";
import { describePluginError } from "../core/plugin-host.js";
import { createEchoFrontGame, normalizeGameMode } from "./game.js";
import { handleEngineControlRequest } from "./engine-control-route.js";
import {
  activeSocketCount,
  cleanupDeadline,
  normalizePlayerSessionId,
  reconnectExpired,
} from "./room-lifecycle.js";
import { advanceSimulation, SIMULATION_TICK_MS } from "./game-clock.js";

const LIFECYCLE_KEY = "room:lifecycle:v2";
const RECENT_EVENT_LIMIT = 40;
const HEARTBEAT_INTERVAL_MS = 5000;
const SLOW_TICK_MS = 100;
const VERY_SLOW_TICK_MS = 250;
const FATAL_CLOSE_CODE = 1011;

function monotonicNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function errorDetails(error) {
  const plugin = describePluginError(error);
  if (plugin) {
    return {
      ...plugin,
      category: "plugin",
      speech: `Ошибка в плагине ${plugin.pluginId}: ${plugin.message}`,
    };
  }
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    code: "SERVER_ERROR",
    category: "server",
    name: err.name || "Error",
    message: err.message,
    speech: `Ошибка сервера: ${err.message}`,
  };
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
    slowTicks: 0,
    verySlowTicks: 0,
    lastTickAt: null,
    lastSimulation: null,
    tickSamples: [],
  };
}

function freshLifecycle(bootId) {
  return {
    schema: 2,
    status: "idle",
    bootId,
    previousBootId: null,
    bootStartedAt: Date.now(),
    matchId: null,
    matchCreatedAt: null,
    mode: null,
    lastHealthyAt: null,
    lastTickWallMs: null,
    maxTickWallMs: 0,
    lastError: null,
    recentEvents: [],
  };
}

export class MatchRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.bootId = crypto.randomUUID();
    this.game = null;
    this.mode = null;
    this.gameLoopTimer = null;
    this.lastStepAt = Date.now();
    this.lastSnapshotAt = 0;
    this.lastLifecycleHeartbeatAt = 0;
    this.lastSlowTickEventAt = 0;
    this.disconnectedHumans = new Map();
    this.diagnosticsStats = freshDiagnosticsStats();
    this.lifecycle = freshLifecycle(this.bootId);
    this.fatalError = null;

    ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get(LIFECYCLE_KEY);
      if (stored && typeof stored === "object") {
        const previousBootId = stored.bootId ?? null;
        this.lifecycle = {
          ...freshLifecycle(this.bootId),
          ...stored,
          previousBootId,
          bootId: this.bootId,
          bootStartedAt: Date.now(),
          recentEvents: Array.isArray(stored.recentEvents) ? stored.recentEvents.slice(-RECENT_EVENT_LIMIT) : [],
        };

        if (stored.status === "active" && previousBootId && previousBootId !== this.bootId) {
          this.fatalError = {
            type: "server-error",
            fatal: true,
            code: "MATCH_STATE_LOST",
            category: "runtime-restart",
            message: "Процесс матча был перезапущен, а физическое состояние Rapier находилось только в памяти. Новый матч автоматически не создан.",
            speech: "Ошибка сервера. Процесс текущего матча был перезапущен. Новый матч автоматически не создан.",
            bootId: this.bootId,
            previousBootId,
            matchId: stored.matchId ?? null,
            matchCreatedAt: stored.matchCreatedAt ?? null,
            lastHealthyAt: stored.lastHealthyAt ?? null,
            lastTickWallMs: stored.lastTickWallMs ?? null,
            maxTickWallMs: stored.maxTickWallMs ?? null,
            lastKnownEvent: Array.isArray(stored.recentEvents) ? stored.recentEvents.at(-1) ?? null : null,
          };
          this.lifecycle.status = "fatal";
          this.lifecycle.lastError = this.fatalError;
          this.pushLifecycleEvent("runtime-restart-detected", {
            previousBootId,
            matchId: stored.matchId ?? null,
            lastHealthyAt: stored.lastHealthyAt ?? null,
          });
          await this.persistLifecycle();
          return;
        }
      }

      this.lifecycle.previousBootId = stored?.bootId ?? null;
      this.lifecycle.bootId = this.bootId;
      this.lifecycle.bootStartedAt = Date.now();
      this.pushLifecycleEvent("room-boot", {
        previousBootId: this.lifecycle.previousBootId,
        previousStatus: stored?.status ?? null,
      });
      await this.persistLifecycle();

      const sockets = this.ctx.getWebSockets();
      if (!activeSocketCount(sockets)) return;
      const mode = normalizeGameMode(
        sockets.map((socket) => {
          try { return socket.deserializeAttachment()?.mode; } catch { return null; }
        }).find(Boolean),
      );
      try {
        await this.ensureGame(mode);
      } catch (error) {
        await this.failRoom(error, { phase: "constructor-resume" });
        return;
      }
      for (const ws of sockets) {
        if (ws.readyState === 3) continue;
        const attachment = ws.deserializeAttachment();
        if (!attachment?.playerId) continue;
        try { this.game.api.connectHuman(attachment.playerId); } catch (error) {
          await this.failRoom(error, { phase: "constructor-player-resume" });
          return;
        }
      }
      this.startGameLoop();
    });
  }

  pushLifecycleEvent(event, data = null, now = Date.now()) {
    const recent = this.lifecycle.recentEvents ?? (this.lifecycle.recentEvents = []);
    recent.push({ at: now, event, data });
    if (recent.length > RECENT_EVENT_LIMIT) recent.splice(0, recent.length - RECENT_EVENT_LIMIT);
  }

  async persistLifecycle() {
    await this.ctx.storage.put(LIFECYCLE_KEY, this.lifecycle);
  }

  persistLifecycleSoon() {
    const promise = this.persistLifecycle().catch((error) => {
      console.error("MatchRoom lifecycle persistence failed", error);
    });
    if (typeof this.ctx.waitUntil === "function") this.ctx.waitUntil(promise);
  }

  async ensureGame(mode = "tdm") {
    if (this.fatalError) throw new Error(this.fatalError.message);
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
      this.lifecycle.status = "active";
      this.lifecycle.matchId = crypto.randomUUID();
      this.lifecycle.matchCreatedAt = Date.now();
      this.lifecycle.mode = normalized;
      this.lifecycle.lastHealthyAt = Date.now();
      this.lifecycle.lastError = null;
      this.pushLifecycleEvent("match-created", { matchId: this.lifecycle.matchId, mode: normalized });
      await this.persistLifecycle();
    }
    return this.game;
  }

  fatalPacket(error, context = {}) {
    const details = error?.type === "server-error" ? error : errorDetails(error);
    return {
      type: "server-error",
      fatal: true,
      at: Date.now(),
      bootId: this.bootId,
      matchId: this.lifecycle.matchId ?? null,
      ...details,
      context,
      roomDiagnostics: {
        tickCount: this.diagnosticsStats.tickCount,
        lastTickWallMs: this.diagnosticsStats.lastTickWallMs,
        maxTickWallMs: this.diagnosticsStats.maxTickWallMs,
        droppedMsTotal: this.diagnosticsStats.droppedMsTotal,
        slowTicks: this.diagnosticsStats.slowTicks,
        verySlowTicks: this.diagnosticsStats.verySlowTicks,
      },
      recentServerEvents: (this.lifecycle.recentEvents ?? []).slice(-12),
    };
  }

  sendFatalToSocket(socket, packet = this.fatalError) {
    if (!socket || !packet || socket.readyState === 3) return;
    try { socket.send(JSON.stringify(packet)); } catch {}
  }

  async failRoom(error, context = {}) {
    if (this.fatalError) return this.fatalError;
    const packet = this.fatalPacket(error, context);
    this.fatalError = packet;
    this.stopGameLoop();
    this.lifecycle.status = "fatal";
    this.lifecycle.lastError = packet;
    this.pushLifecycleEvent("fatal-error", {
      code: packet.code,
      category: packet.category,
      pluginId: packet.pluginId ?? null,
      phase: packet.phase ?? context.phase ?? null,
      message: packet.message,
    });
    await this.persistLifecycle();
    console.error(JSON.stringify({ event: "echo-front-room-fatal", ...packet }));
    for (const socket of this.ctx.getWebSockets()) this.sendFatalToSocket(socket, packet);
    setTimeout(() => {
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.close(FATAL_CLOSE_CODE, "Echo Front fatal room error"); } catch {}
      }
    }, 100);
    return packet;
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
    if (this.gameLoopTimer || !this.game || this.fatalError) return;
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
    if (wallMs >= SLOW_TICK_MS) stats.slowTicks += 1;
    if (wallMs >= VERY_SLOW_TICK_MS) stats.verySlowTicks += 1;
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

    this.lifecycle.lastHealthyAt = now;
    this.lifecycle.lastTickWallMs = Number(wallMs.toFixed(3));
    this.lifecycle.maxTickWallMs = Math.max(Number(this.lifecycle.maxTickWallMs) || 0, wallMs);
    if (wallMs >= SLOW_TICK_MS && now - this.lastSlowTickEventAt >= 2000) {
      this.lastSlowTickEventAt = now;
      this.pushLifecycleEvent(wallMs >= VERY_SLOW_TICK_MS ? "very-slow-tick" : "slow-tick", {
        wallMs: Number(wallMs.toFixed(3)),
        simulatedMs: result.simulatedMs,
        droppedMs: result.droppedMs,
        steps: result.steps,
      }, now);
    }
    if (now - this.lastLifecycleHeartbeatAt >= HEARTBEAT_INTERVAL_MS || wallMs >= VERY_SLOW_TICK_MS) {
      this.lastLifecycleHeartbeatAt = now;
      this.persistLifecycleSoon();
    }
    return wallMs;
  }

  runGameLoopTick() {
    if (!this.game || this.fatalError) return;
    const now = Date.now();
    const startedAt = monotonicNow();
    try {
      this.cleanupDisconnectedHumans(now);
      const result = advanceSimulation(this.game, this.lastStepAt, now);
      this.lastStepAt = result.lastStepAt;
      const wallMs = this.recordTickDiagnostics(now, startedAt, result);
      if (result.droppedMs > 0) {
        this.pushLifecycleEvent("simulation-catchup-capped", {
          droppedMs: result.droppedMs,
          simulatedMs: result.simulatedMs,
          wallMs: Number(wallMs.toFixed(3)),
        }, now);
        console.warn(JSON.stringify({
          event: "echo-front-simulation-catchup-capped",
          droppedMs: result.droppedMs,
          simulatedMs: result.simulatedMs,
          wallMs,
        }));
      }
      this.broadcastEvents();
      this.broadcastSnapshot();
    } catch (error) {
      this.failRoom(error, { phase: "game-loop-tick" }).catch((fatalError) => {
        console.error("MatchRoom failRoom failed", fatalError);
      });
    }
  }

  diagnosticsResponse(requestUrl) {
    const headers = { "Cache-Control": "no-store" };
    if (!this.game) {
      return Response.json({
        ok: !this.fatalError,
        diagnosticsEnabled: true,
        roomActive: false,
        mode: this.mode,
        sockets: activeSocketCount(this.ctx.getWebSockets()),
        bootId: this.bootId,
        lifecycle: this.lifecycle,
        fatalError: this.fatalError,
        room: this.diagnosticsStats,
      }, { headers });
    }
    const entityId = requestUrl.searchParams.get("entity") || null;
    return Response.json({
      ok: !this.fatalError,
      diagnosticsEnabled: true,
      roomActive: true,
      mode: this.mode,
      sockets: activeSocketCount(this.ctx.getWebSockets()),
      disconnectedHumans: this.disconnectedHumans.size,
      loopRunning: Boolean(this.gameLoopTimer),
      lastStepAt: this.lastStepAt,
      lastSnapshotAt: this.lastSnapshotAt,
      bootId: this.bootId,
      lifecycle: this.lifecycle,
      fatalError: this.fatalError,
      room: this.diagnosticsStats,
      game: this.game.diagnostics({ entityId }),
    }, { headers });
  }

  async acceptSocket(requestUrl, mode) {
    const requestedPlayerId = normalizePlayerSessionId(requestUrl.searchParams.get("player"));
    const playerId = requestedPlayerId ?? crypto.randomUUID();
    const previousSockets = this.socketsForPlayer(playerId);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      playerId,
      mode,
      connectedAt: Date.now(),
      bootId: this.bootId,
      matchId: this.lifecycle.matchId ?? null,
    });
    for (const oldSocket of previousSockets) {
      try { oldSocket.close(4001, "Reconnected"); } catch {}
    }
    return { client, server, playerId };
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
    const { client, server, playerId } = await this.acceptSocket(requestUrl, mode);

    if (this.fatalError) {
      this.sendFatalToSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    try {
      await this.ensureGame(mode);
      this.cleanupDisconnectedHumans();
      this.disconnectedHumans.delete(playerId);

      const joined = this.game.api.connectHuman(playerId);
      server.serializeAttachment({
        playerId,
        mode,
        connectedAt: Date.now(),
        bootId: this.bootId,
        matchId: this.lifecycle.matchId,
      });
      const initialSnapshot = typeof this.game.api.snapshotFor === "function"
        ? this.game.api.snapshotFor(playerId)
        : this.game.api.snapshot();
      const welcome = {
        type: "welcome",
        playerId,
        team: joined.team,
        mode,
        resumed: Boolean(joined.resumed),
        server: {
          bootId: this.bootId,
          previousBootId: this.lifecycle.previousBootId ?? null,
          matchId: this.lifecycle.matchId,
          matchCreatedAt: this.lifecycle.matchCreatedAt,
          lastHealthyAt: this.lifecycle.lastHealthyAt,
        },
        snapshot: initialSnapshot,
      };
      server.send(JSON.stringify(welcome));
      this.pushLifecycleEvent("socket-connected", {
        playerId,
        resumed: Boolean(joined.resumed),
        sockets: activeSocketCount(this.ctx.getWebSockets()),
      });
      this.persistLifecycleSoon();
      this.startGameLoop();
      this.broadcastSnapshot(true);
    } catch (error) {
      await this.failRoom(error, { phase: "websocket-connect", playerId, mode });
      this.sendFatalToSocket(server);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (this.fatalError || typeof message !== "string") return;
    const attachment = ws.deserializeAttachment();
    try {
      await this.ensureGame(attachment?.mode ?? "tdm");
      let data;
      try { data = JSON.parse(message); } catch { return; }
      const playerId = attachment?.playerId;
      if (!playerId) return;
      const now = Date.now();
      if (data.type === "input") this.game.api.handleInput(playerId, data.input ?? {}, now);
      this.startGameLoop();
      this.broadcastEvents();
    } catch (error) {
      await this.failRoom(error, { phase: "websocket-message", playerId: attachment?.playerId ?? null });
    }
  }

  markSocketDisconnected(ws, details = {}) {
    let attachment = null;
    try { attachment = ws.deserializeAttachment(); } catch {}
    const playerId = attachment?.playerId;
    this.pushLifecycleEvent("socket-disconnected", {
      playerId: playerId ?? null,
      connectedAt: attachment?.connectedAt ?? null,
      code: details.code ?? null,
      reason: details.reason ?? "",
      wasClean: details.wasClean ?? null,
      error: details.error ?? null,
      socketsRemaining: activeSocketCount(this.ctx.getWebSockets(), ws),
    });
    this.persistLifecycleSoon();
    if (!playerId || !this.game || this.fatalError) return;
    if (this.socketsForPlayer(playerId, ws).length) return;
    this.game.api.suspendHuman(playerId);
    this.disconnectedHumans.set(playerId, Date.now());
  }

  async webSocketClose(ws, code, reason, wasClean) {
    this.markSocketDisconnected(ws, { code, reason, wasClean });
    if (!this.fatalError) this.broadcastSnapshot(true);
    await this.scheduleCleanupIfEmpty(ws);
  }

  async webSocketError(ws, error) {
    this.markSocketDisconnected(ws, {
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "WebSocket error"),
    });
    await this.scheduleCleanupIfEmpty(ws);
  }

  async scheduleCleanupIfEmpty(closingSocket = null) {
    const sockets = this.ctx.getWebSockets();
    if (activeSocketCount(sockets, closingSocket) > 0) return;
    // Keep the simulation alive during the reconnect grace period. Stopping the
    // interval immediately made a transient network outage both pause gameplay
    // and make the Durable Object eligible for hibernation.
    this.pushLifecycleEvent("empty-room-grace-started", {
      deadline: cleanupDeadline(),
      fatal: Boolean(this.fatalError),
    });
    await this.persistLifecycle();
    await this.ctx.storage.setAlarm(cleanupDeadline());
  }

  async alarm() {
    if (activeSocketCount(this.ctx.getWebSockets()) > 0) {
      await this.ctx.storage.deleteAlarm();
      this.startGameLoop();
      return;
    }
    this.stopGameLoop();
    this.pushLifecycleEvent("empty-room-expired", {
      matchId: this.lifecycle.matchId ?? null,
      status: this.lifecycle.status,
    });
    if (this.game) {
      try { await this.game.host.stop(); } catch (error) {
        this.lifecycle.lastError = this.fatalPacket(error, { phase: "room-cleanup" });
      }
      this.game = null;
    }
    this.mode = null;
    this.fatalError = null;
    this.disconnectedHumans.clear();
    this.lastStepAt = Date.now();
    this.lastSnapshotAt = 0;
    this.diagnosticsStats = freshDiagnosticsStats();
    this.lifecycle.status = "idle";
    this.lifecycle.matchId = null;
    this.lifecycle.matchCreatedAt = null;
    this.lifecycle.mode = null;
    this.lifecycle.lastHealthyAt = null;
    await this.ctx.storage.deleteAlarm();
    // Intentionally preserve lifecycle history. deleteAll() used to erase the
    // only forensic evidence explaining why a room disappeared.
    await this.persistLifecycle();
  }

  broadcastEvents() {
    if (!this.game || this.fatalError) return;
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
      } catch (error) {
        this.pushLifecycleEvent("socket-send-failed", {
          channel: "events",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  broadcastSnapshot(force = false) {
    if (!this.game || this.fatalError) return;
    const now = Date.now();
    const interval = Number(this.game.api.snapshotIntervalMs) || 100;
    if (!force && now - this.lastSnapshotAt < interval) return;
    this.lastSnapshotAt = now;
    this.diagnosticsStats.snapshotBroadcasts += 1;

    if (typeof this.game.api.snapshotFor !== "function") {
      const message = JSON.stringify({ type: "snapshot", snapshot: this.game.api.snapshot(now) });
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(message); } catch (error) {
          this.pushLifecycleEvent("socket-send-failed", {
            channel: "snapshot",
            message: error instanceof Error ? error.message : String(error),
          });
        }
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
      } catch (error) {
        this.pushLifecycleEvent("socket-send-failed", {
          channel: "snapshot",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
