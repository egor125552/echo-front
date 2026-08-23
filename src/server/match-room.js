import { DurableObject } from "cloudflare:workers";
import { createEchoFrontGame } from "./game.js";
import { activeSocketCount, cleanupDeadline } from "./room-lifecycle.js";
import { advanceSimulation, SIMULATION_TICK_MS } from "./game-clock.js";

export class MatchRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    this.gameLoopTimer = null;
    this.lastStepAt = Date.now();
    this.lastSnapshotAt = 0;

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

    const [client, server] = Object.values(new WebSocketPair());
    const playerId = crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId });
    const joined = this.game.api.connectHuman(playerId);
    server.send(JSON.stringify({
      type: "welcome",
      playerId,
      team: joined.team,
      snapshot: this.game.api.snapshot(),
    }));
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

  async webSocketClose(ws) {
    const playerId = ws.deserializeAttachment()?.playerId;
    if (playerId && this.game) this.game.api.disconnectHuman(playerId);
    this.broadcastSnapshot(true);
    await this.scheduleCleanupIfEmpty(ws);
  }

  async webSocketError(ws) {
    const playerId = ws.deserializeAttachment()?.playerId;
    if (playerId && this.game) this.game.api.disconnectHuman(playerId);
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
