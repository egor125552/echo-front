import { DurableObject } from "cloudflare:workers";
import { ENGINE_DIAGNOSTICS_CONTROL } from "../config/engine-diagnostics.js";
import { createEchoFrontGame, normalizeGameMode } from "./game.js";
import { handleEngineControlRequest } from "./engine-control-route.js";
import { handleEngineLabRequest } from "./engine-lab.js";
import {
  activeSocketCount,
  cleanupDeadline,
  normalizePlayerSessionId,
  reconnectExpired,
} from "./room-lifecycle.js";
import { advanceSimulation, SIMULATION_TICK_MS } from "./game-clock.js";
import { summarizePerformanceSamples } from "./performance-samples.js";

const HOT_RECONNECT_KEEPALIVE_MS = 8000;
const LAST_RUNTIME_ERROR_KEY = "last-runtime-error-v1";

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

function runtimeErrorInfo(error, details = {}) {
  return {
    at: Date.now(),
    name: String(error?.name ?? "Error").slice(0, 80),
    message: String(error?.message ?? error ?? "Unknown server error").slice(0, 1000),
    stack: error?.stack ? String(error.stack).slice(0, 5000) : null,
    phase: details.phase ? String(details.phase).slice(0, 120) : null,
    mode: details.mode ? normalizeGameMode(details.mode) : null,
    playerId: details.playerId ? String(details.playerId).slice(0, 80) : null,
  };
}

export class MatchRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    this.lab = null;
    this.mode = null;
    this.tutorial = false;
    this.gameLoopTimer = null;
    this.lastStepAt = Date.now();
    this.lastSnapshotAt = 0;
    this.disconnectedHumans = new Map();
    this.hotReconnectUntil = 0;
    this.diagnosticsStats = freshDiagnosticsStats();
    this.inputSamples = [];
    this.lastRuntimeError = null;

    ctx.blockConcurrencyWhile(async () => {
      const sockets = this.ctx.getWebSockets();
      if (!activeSocketCount(sockets)) return;
      const mode = normalizeGameMode(
        sockets.map((socket) => {
          try { return socket.deserializeAttachment()?.mode; } catch { return null; }
        }).find(Boolean),
      );
      const tutorial = sockets.some((socket) => {
        try { return socket.deserializeAttachment()?.tutorial === true; } catch { return false; }
      });
      await this.ensureGame(mode, { tutorial });
      for (const ws of sockets) {
        if (ws.readyState === 3) continue;
        const attachment = ws.deserializeAttachment();
        if (!attachment?.playerId) continue;
        try { this.game.api.connectHuman(attachment.playerId); } catch (error) {
          this.reportRuntimeError(error, {
            phase: "hibernation-reconnect",
            mode,
            playerId: attachment.playerId,
          }, ws);
        }
      }
      this.hotReconnectUntil = 0;
      this.startGameLoop();
    });
  }

  persistRuntimeError(info) {
    this.lastRuntimeError = info;
    try {
      const pending = this.ctx.storage.put(LAST_RUNTIME_ERROR_KEY, info);
      this.ctx.waitUntil?.(pending);
      pending?.catch?.(() => {});
    } catch {}
  }

  clearRuntimeError() {
    this.lastRuntimeError = null;
    try {
      const pending = this.ctx.storage.delete(LAST_RUNTIME_ERROR_KEY);
      this.ctx.waitUntil?.(pending);
      pending?.catch?.(() => {});
    } catch {}
  }

  sendRuntimeError(info, socket = null) {
    const payload = JSON.stringify({ type: "server-error", error: info });
    const sockets = socket ? [socket] : this.ctx.getWebSockets();
    for (const target of sockets) {
      try {
        if (target?.readyState === 3) continue;
        target.send(payload);
      } catch {}
    }
  }

  reportRuntimeError(error, details = {}, socket = null) {
    const info = runtimeErrorInfo(error, { mode: this.mode, ...details });
    this.persistRuntimeError(info);
    this.sendRuntimeError(info, socket);
    console.error(JSON.stringify({
      event: "echo-front-runtime-error",
      ...info,
      stack: info.stack ?? undefined,
    }));
    return info;
  }

  async runtimeErrorResponse() {
    let error = this.lastRuntimeError;
    if (!error) {
      try { error = await this.ctx.storage.get(LAST_RUNTIME_ERROR_KEY); } catch {}
    }
    return Response.json({
      ok: true,
      roomActive: Boolean(this.game),
      mode: this.mode,
      error: error ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  async ensureGame(mode = "tdm", { tutorial = false } = {}) {
    const normalized = normalizeGameMode(mode);
    const training = Boolean(tutorial);
    if (this.game && this.mode !== normalized) {
      throw new Error(`Match room mode mismatch: ${this.mode} vs ${normalized}`);
    }
    if (this.game && this.tutorial !== training) {
      throw new Error(`Match room tutorial mismatch: ${this.tutorial} vs ${training}`);
    }
    if (!this.game) {
      this.mode = normalized;
      this.tutorial = training;
      this.game = await createEchoFrontGame({ mode: normalized, tutorial: training });
      this.lastStepAt = Date.now();
      this.lastSnapshotAt = 0;
      this.diagnosticsStats = freshDiagnosticsStats();
      this.inputSamples = [];
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
      this.game.api.disconnectHuman(playerId, now);
      this.disconnectedHumans.delete(playerId);
    }
  }

  startGameLoop() {
    if (this.lab || this.gameLoopTimer || !this.game) return;
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
    const sample = {
      at: now,
      wallMs: Number(wallMs.toFixed(3)),
      gapMs: 0,
      simulatedMs: result.simulatedMs,
      droppedMs: result.droppedMs,
      steps: result.steps,
      sockets: activeSocketCount(this.ctx.getWebSockets()),
      eventsSent: 0,
      eventCharacters: 0,
      snapshotsSent: 0,
      snapshotCharacters: 0,
    };
    stats.tickSamples.push(sample);
    const max = Math.max(60, ENGINE_DIAGNOSTICS_CONTROL.maxTickSamples || 120);
    if (stats.tickSamples.length > max) stats.tickSamples.splice(0, stats.tickSamples.length - max);
    return sample;
  }

  performanceReport(now = Date.now()) {
    const tick = summarizePerformanceSamples(this.diagnosticsStats.tickSamples, now);
    const inputs = this.inputSamples.filter((sample) => sample.at >= now - tick.windowMs);
    const entities = this.game?.host?.services?.get("entities")?.all?.() ?? [];
    return {
      serverNow: now,
      mode: this.mode,
      players: entities.filter((entity) => !entity.bot).length,
      bots: entities.filter((entity) => entity.bot).length,
      sockets: activeSocketCount(this.ctx.getWebSockets()),
      ...tick,
      inputCount: inputs.length,
    };
  }

  runGameLoopTick() {
    if (!this.game) return;
    const now = Date.now();
    if (!activeSocketCount(this.ctx.getWebSockets())) {
      if (now < this.hotReconnectUntil) {
        this.lastStepAt = now;
        return;
      }
      this.stopGameLoop();
      return;
    }
    this.hotReconnectUntil = 0;
    const startedAt = monotonicNow();
    try {
      const previousStepAt = this.lastStepAt;
      this.cleanupDisconnectedHumans(now);
      const result = advanceSimulation(this.game, previousStepAt, now);
      this.lastStepAt = result.lastStepAt;
      const sample = this.recordTickDiagnostics(now, startedAt, result);
      sample.gapMs = Math.max(0, now - previousStepAt);
      if (result.droppedMs > 0) {
        console.warn(JSON.stringify({
          event: "echo-front-simulation-catchup-capped",
          droppedMs: result.droppedMs,
          simulatedMs: result.simulatedMs,
        }));
      }
      this.broadcastEvents(sample);
      this.broadcastSnapshot(false, sample);
    } catch (error) {
      this.reportRuntimeError(error, { phase: "game-loop", mode: this.mode });
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
      tutorial: this.tutorial,
      sockets: activeSocketCount(this.ctx.getWebSockets()),
      disconnectedHumans: this.disconnectedHumans.size,
      loopRunning: Boolean(this.gameLoopTimer),
      hotReconnectMsRemaining: Math.max(0, this.hotReconnectUntil - Date.now()),
      lastStepAt: this.lastStepAt,
      lastSnapshotAt: this.lastSnapshotAt,
      room: this.diagnosticsStats,
      game: this.game.diagnostics({ entityId }),
    }, { headers });
  }

  async fetch(request) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/api/diagnostics") return this.diagnosticsResponse(requestUrl);
    if (requestUrl.pathname === "/api/play-error") return this.runtimeErrorResponse();
    if (requestUrl.pathname === "/api/engine-command") return handleEngineControlRequest(this, request);
    if (requestUrl.pathname === "/api/engine-lab") {
      if (!this.env.ENGINE_LAB_TOKEN || request.headers.get("X-Engine-Lab-Token") !== this.env.ENGINE_LAB_TOKEN) {
        return Response.json({ ok: false }, { status: 401 });
      }
      return handleEngineLabRequest(this, request);
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

    const mode = normalizeGameMode(requestUrl.searchParams.get("mode"));
    const tutorial = requestUrl.searchParams.get("tutorial") === "1";
    let phase = "delete-alarm";
    let playerId = null;
    let server = null;
    try {
      await this.ctx.storage.deleteAlarm();
      phase = "ensure-game";
      await this.ensureGame(mode, { tutorial });
      this.hotReconnectUntil = 0;
      this.lastStepAt = Date.now();
      phase = "cleanup-disconnected-humans";
      this.cleanupDisconnectedHumans();

      const requestedPlayerId = normalizePlayerSessionId(requestUrl.searchParams.get("player"));
      playerId = requestedPlayerId ?? crypto.randomUUID();
      const previousSockets = this.socketsForPlayer(playerId);

      phase = "create-websocket-pair";
      const pair = Object.values(new WebSocketPair());
      const client = pair[0];
      server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId, mode, tutorial });
      this.disconnectedHumans.delete(playerId);

      phase = "connect-human";
      const joined = this.game.api.connectHuman(playerId);
      phase = "initial-snapshot";
      const initialSnapshot = typeof this.game.api.snapshotFor === "function"
        ? this.game.api.snapshotFor(playerId)
        : this.game.api.snapshot();
      phase = "send-welcome";
      server.send(JSON.stringify({
        type: "welcome",
        playerId,
        team: joined.team,
        mode,
        tutorial,
        resumed: Boolean(joined.resumed),
        snapshot: initialSnapshot,
      }));

      phase = "replace-old-sockets";
      for (const oldSocket of previousSockets) {
        try { oldSocket.close(4001, "Reconnected"); } catch {}
      }

      phase = "start-game-loop";
      this.startGameLoop();
      phase = "initial-broadcast";
      this.broadcastSnapshot(true);
      phase = "complete";
      this.clearRuntimeError();
      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      this.reportRuntimeError(error, { phase, mode, playerId }, server);
      try { server?.close(1011, "Server startup failed"); } catch {}
      throw error;
    }
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string") return;
    const attachment = ws.deserializeAttachment();
    const mode = attachment?.mode ?? "tdm";
    const tutorial = attachment?.tutorial === true;
    const playerId = attachment?.playerId ?? null;
    try {
      await this.ensureGame(mode, { tutorial });
      let data;
      try { data = JSON.parse(message); } catch { return; }
      if (!playerId) return;
      const now = Date.now();
      if (data.type === "input") {
        this.game.api.handleInput(playerId, data.input ?? {}, now);
        this.inputSamples.push({ at: now });
        if (this.inputSamples.length > 240) this.inputSamples.splice(0, this.inputSamples.length - 240);
      }
      if (data.type === "perf-probe" && Number.isSafeInteger(data.id)
        && data.id >= 0 && data.id <= 1_000_000_000) {
        ws.send(JSON.stringify({ type: "perf-pong", id: data.id, server: this.performanceReport(now) }));
      }
      if (tutorial && data.type === "tutorial:speech-complete") {
        this.game.api.tutorialAcknowledge?.(playerId, data.phase, now);
      }
      this.startGameLoop();
      this.broadcastEvents();
    } catch (error) {
      this.reportRuntimeError(error, {
        phase: "websocket-message",
        mode,
        playerId,
      }, ws);
      throw error;
    }
  }

  markSocketDisconnected(ws) {
    const playerId = ws.deserializeAttachment()?.playerId;
    if (!playerId || !this.game) return;
    if (this.socketsForPlayer(playerId, ws).length) return;
    this.game.api.suspendHuman(playerId);
    this.disconnectedHumans.set(playerId, Date.now());
  }

  async webSocketClose(ws) {
    try {
      this.markSocketDisconnected(ws);
      this.broadcastSnapshot(true);
      await this.scheduleCleanupIfEmpty(ws);
    } catch (error) {
      this.reportRuntimeError(error, {
        phase: "websocket-close",
        mode: ws.deserializeAttachment()?.mode ?? this.mode,
        playerId: ws.deserializeAttachment()?.playerId ?? null,
      });
    }
  }

  async webSocketError(ws) {
    try {
      this.markSocketDisconnected(ws);
      await this.scheduleCleanupIfEmpty(ws);
    } catch (error) {
      this.reportRuntimeError(error, {
        phase: "websocket-error",
        mode: ws.deserializeAttachment()?.mode ?? this.mode,
        playerId: ws.deserializeAttachment()?.playerId ?? null,
      });
    }
  }

  async scheduleCleanupIfEmpty(closingSocket = null) {
    const sockets = this.ctx.getWebSockets();
    if (activeSocketCount(sockets, closingSocket) > 0) return;
    this.hotReconnectUntil = Math.max(this.hotReconnectUntil, Date.now() + HOT_RECONNECT_KEEPALIVE_MS);
    this.startGameLoop();
    await this.ctx.storage.setAlarm(cleanupDeadline());
  }

  async alarm() {
    if (activeSocketCount(this.ctx.getWebSockets()) > 0) {
      await this.ctx.storage.deleteAlarm();
      this.hotReconnectUntil = 0;
      this.startGameLoop();
      return;
    }
    this.stopGameLoop();
    if (this.game) {
      await this.game.host.stop();
      this.game = null;
    }
    this.mode = null;
    this.lab = null;
    this.tutorial = false;
    this.disconnectedHumans.clear();
    this.hotReconnectUntil = 0;
    this.lastStepAt = Date.now();
    this.lastSnapshotAt = 0;
    this.diagnosticsStats = freshDiagnosticsStats();
    this.inputSamples = [];
    this.lastRuntimeError = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  broadcastEvents(performanceSample = null) {
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
        const message = JSON.stringify({ type: "events", events: selected });
        socket.send(message);
        if (performanceSample) {
          performanceSample.eventsSent += selected.length;
          performanceSample.eventCharacters += message.length;
        }
      } catch (error) {
        let playerId = null;
        try { playerId = socket.deserializeAttachment()?.playerId ?? null; } catch {}
        this.reportRuntimeError(error, {
          phase: "broadcast-events",
          mode: this.mode,
          playerId,
        }, socket);
      }
    }
  }

  broadcastSnapshot(force = false, performanceSample = null) {
    if (!this.game) return;
    const now = Date.now();
    const interval = Number(this.game.api.snapshotIntervalMs) || 100;
    if (!force && now - this.lastSnapshotAt < interval) return;
    this.lastSnapshotAt = now;
    this.diagnosticsStats.snapshotBroadcasts += 1;

    if (typeof this.game.api.snapshotFor !== "function") {
      let message;
      try {
        message = JSON.stringify({ type: "snapshot", snapshot: this.game.api.snapshot(now) });
      } catch (error) {
        this.reportRuntimeError(error, { phase: "build-broadcast-snapshot", mode: this.mode });
        return;
      }
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message);
          if (performanceSample) {
            performanceSample.snapshotsSent += 1;
            performanceSample.snapshotCharacters += message.length;
          }
        } catch (error) {
          let playerId = null;
          try { playerId = socket.deserializeAttachment()?.playerId ?? null; } catch {}
          this.reportRuntimeError(error, {
            phase: "send-broadcast-snapshot",
            mode: this.mode,
            playerId,
          }, socket);
        }
      }
      return;
    }

    for (const socket of this.ctx.getWebSockets()) {
      try {
        const playerId = socket.deserializeAttachment()?.playerId;
        const message = JSON.stringify({
          type: "snapshot",
          snapshot: this.game.api.snapshotFor(playerId, now),
        });
        socket.send(message);
        if (performanceSample) {
          performanceSample.snapshotsSent += 1;
          performanceSample.snapshotCharacters += message.length;
        }
      } catch (error) {
        let playerId = null;
        try { playerId = socket.deserializeAttachment()?.playerId ?? null; } catch {}
        this.reportRuntimeError(error, {
          phase: "personal-snapshot",
          mode: this.mode,
          playerId,
        }, socket);
      }
    }
  }
}
