import { DurableObject } from "cloudflare:workers";
import { createEchoFrontGame } from "./game.js";
import {
  activeSocketCount,
  cleanupDeadline,
  normalizePlayerSessionId,
  reconnectExpired,
} from "./room-lifecycle.js";
import { advanceSimulation, SIMULATION_TICK_MS } from "./game-clock.js";

export class MatchRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    this.gameLoopTimer = null;
    this.lastStepAt = Date.now();
    this.lastSnapshotAt = 0;
    this.disconnectedHumans = new Map();

    ctx.blockConcurrencyWhile(async () => {
      const sockets = this.ctx.getWebSockets();
      if (!activeSocketCount(sockets)) return;

      await this.ensureGame();
      for (const ws of sockets) {
        if (ws.readyState === 3) continue;
        const attachment = ws.deserializeAttachment();
        if (!attachment?.playerId) continue;
        try {
          this.game.api.connectHuman(attachment.playerId);
        } catch {
        }
      }
      this.startGameLoop();
    });
  }

  async ensureGame() {
    if (!this.game) {
      this.game = await createEchoFrontGame();
      this.lastStepAt = Date.now();
      this.lastSnapshotAt = 0;
    }
    return this.game;
  }

  socketsForPlayer(playerId, excludedSocket = null) {
    return this.ctx.getWebSockets().filter((socket) => {
      if (!socket || socket === excludedSocket || socket.readyState === 3) return false;
      try {
        return socket.deserializeAttachment()?.playerId === playerId;
      } catch {
        return false;
      }
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

  runGameLoopTick() {
    if (!this.game) return;
    if (!activeSocketCount(this.ctx.getWebSockets())) {
      this.stopGameLoop();
      return;
    }

    const now = Date.now();
    try {
      this.cleanupDisconnectedHumans(now);
      const result = advanceSimulation(this.game, this.lastStepAt, now);
      this.lastStepAt = result.lastStepAt;
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

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

    await this.ctx.storage.deleteAlarm();
    await this.ensureGame();
    this.cleanupDisconnectedHumans();

    const requestUrl = new URL(request.url);
    const requestedPlayerId = normalizePlayerSessionId(requestUrl.searchParams.get("player"));
    const playerId = requestedPlayerId ?? crypto.randomUUID();
    const previousSockets = this.socketsForPlayer(playerId);

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId });
    this.disconnectedHumans.delete(playerId);

    const joined = this.game.api.connectHuman(playerId);
    server.send(JSON.stringify({
      type: "welcome",
      playerId,
      team: joined.team,
      resumed: Boolean(joined.resumed),
      snapshot: this.game.api.snapshot(),
    }));

    // A reconnect may arrive before the old TCP/WebSocket path notices that it
    // is dead. The newest socket owns the session; close stale duplicates only
    // after the replacement socket has been accepted and attached.
    for (const oldSocket of previousSockets) {
      try {
        oldSocket.close(4001, "Reconnected");
      } catch {
      }
    }

    this.startGameLoop();
    this.broadcastSnapshot(true);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string") return;
    await this.ensureGame();

    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    const playerId = ws.deserializeAttachment()?.playerId;
    if (!playerId) return;
    const now = Date.now();

    if (data.type === "input") {
      this.game.api.handleInput(playerId, data.input ?? {}, now);
    }

    this.startGameLoop();
    this.broadcastEvents();
  }

  markSocketDisconnected(ws) {
    const playerId = ws.deserializeAttachment()?.playerId;
    if (!playerId || !this.game) return;

    // If a replacement connection for this session is already alive, the close
    // belongs to the stale socket and must not suspend the resumed player.
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

    this.disconnectedHumans.clear();
    this.lastStepAt = Date.now();
    this.lastSnapshotAt = 0;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  broadcastEvents() {
    if (!this.game) return;
    for (const packet of this.game.drainEvents()) {
      const message = JSON.stringify({ type: "event", ...packet });
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message);
        } catch {
        }
      }
    }
  }

  broadcastSnapshot(force = false) {
    if (!this.game) return;
    const now = Date.now();
    if (!force && now - this.lastSnapshotAt < 100) return;
    this.lastSnapshotAt = now;
    const message = JSON.stringify({ type: "snapshot", snapshot: this.game.api.snapshot(now) });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
      }
    }
  }
}
