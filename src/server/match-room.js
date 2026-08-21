import { DurableObject } from "cloudflare:workers";
import { createEchoFrontGame } from "./game.js";

export class MatchRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    this.lastStepAt = Date.now();
    this.lastSnapshotAt = 0;

    ctx.blockConcurrencyWhile(async () => {
      this.game = await createEchoFrontGame();
      for (const ws of this.ctx.getWebSockets()) {
        const attachment = ws.deserializeAttachment();
        if (attachment?.playerId) {
          try {
            this.game.api.connectHuman(attachment.playerId);
          } catch {
          }
        }
      }
    });
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

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

  webSocketMessage(ws, message) {
    if (typeof message !== "string") return;
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

  webSocketClose(ws) {
    const playerId = ws.deserializeAttachment()?.playerId;
    if (playerId) this.game.api.disconnectHuman(playerId);
    this.broadcastSnapshot(true);
  }

  webSocketError(ws) {
    const playerId = ws.deserializeAttachment()?.playerId;
    if (playerId) this.game.api.disconnectHuman(playerId);
  }

  broadcastEvents() {
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
