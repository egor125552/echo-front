import { DurableObject } from "cloudflare:workers";
import { createEchoFrontGame } from "./game.js";
import { activeSocketCount, cleanupDeadline } from "./room-lifecycle.js";

export class MatchRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
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
    const dt = Math.max(0, Math.min(0.1, (now - this.lastStepAt) / 1000));
    if (dt > 0) {
      this.lastStepAt = now;
      this.game.api.step(dt, now);
    }

    if (data.type === "input") {
      this.game.api.handleInput(playerId, data.input ?? {}, now);
    }

    this.broadcastEvents();
    if (now - this.lastSnapshotAt >= 100) this.broadcastSnapshot();
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
    await this.ctx.storage.setAlarm(cleanupDeadline());
  }

  async alarm() {
    if (activeSocketCount(this.ctx.getWebSockets()) > 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

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
