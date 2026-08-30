export const manifest = {
  id: "cloudflare-session",
  requires: ["keyboard-input"],
};

export const SESSION_STORAGE_KEY = "echo-front-player-session-v1";
export const PLAYER_STORAGE_KEY = "echo-front-player-id-v1";
export const RECONNECT_DELAYS_MS = [150, 500, 1000, 2000, 5000];

export function isPlayerSessionId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

export function reconnectDelayForAttempt(attempt) {
  const index = Math.max(0, Math.min(RECONNECT_DELAYS_MS.length - 1, Number(attempt || 1) - 1));
  return RECONNECT_DELAYS_MS[index];
}

function normalizeMode(value) {
  return value === "battle-royale" || value === "br" ? "battle-royale" : "tdm";
}

function socketStateName(value) {
  if (value === WebSocket.CONNECTING) return "connecting";
  if (value === WebSocket.OPEN) return "open";
  if (value === WebSocket.CLOSING) return "closing";
  if (value === WebSocket.CLOSED) return "closed";
  return "unknown";
}

function loadOrCreateSessionId() {
  try {
    const persistent = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (isPlayerSessionId(persistent)) return persistent.toLowerCase();

    // Migrate the previous tab-only identity once so existing players keep the
    // same id when this release first loads.
    const previous = sessionStorage.getItem(SESSION_STORAGE_KEY);
    const id = isPlayerSessionId(previous) ? previous.toLowerCase() : crypto.randomUUID();
    localStorage.setItem(PLAYER_STORAGE_KEY, id);
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (isPlayerSessionId(stored)) return stored.toLowerCase();
      const created = crypto.randomUUID();
      sessionStorage.setItem(SESSION_STORAGE_KEY, created);
      return created;
    } catch {
      return crypto.randomUUID();
    }
  }
}

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const sessionId = loadOrCreateSessionId();
  let socket = null;
  let playerId = sessionId;
  let desiredRoom = null;
  let desiredMode = "tdm";
  let reconnectTimer = null;
  let reconnectAttempt = 0;

  function send(type, payload = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify({ type, ...payload }));
      return true;
    } catch (error) {
      ctx.events.emit("network:error", {
        room: desiredRoom,
        mode: desiredMode,
        phase: "send",
        endpoint: "/api/play",
        message: String(error?.message ?? error ?? "WebSocket send failed"),
      });
      return false;
    }
  }

  function sendInput() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const sampled = input.sample();
    ctx.events.emit("network:input-sampled", { input: sampled });
    send("input", { input: sampled });
  }

  ctx.events.on("input:changed", sendInput);

  function emitSnapshot(snapshot) {
    if (ctx.services.has("snapshot-smoothing")) ctx.events.emit("game:snapshot:raw", snapshot);
    else ctx.events.emit("game:snapshot", snapshot);
  }

  function emitGamePacket(packet) {
    if (!packet?.event) return;
    ctx.events.emit("game:event", packet);
    if (packet.event === "battle-royale:started") sendInput();
  }

  function clearReconnectTimer() {
    if (reconnectTimer != null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function scheduleReconnect() {
    if (!desiredRoom || reconnectTimer != null) return;
    reconnectAttempt += 1;
    const delay = reconnectDelayForAttempt(reconnectAttempt);
    ctx.events.emit("network:reconnecting", {
      room: desiredRoom,
      mode: desiredMode,
      attempt: reconnectAttempt,
      delay,
    });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  }

  function openSocket() {
    if (!desiredRoom) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    const room = desiredRoom;
    const mode = desiredMode;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/api/play?room=${encodeURIComponent(room)}&mode=${encodeURIComponent(mode)}&player=${encodeURIComponent(sessionId)}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (error) {
      ctx.events.emit("network:error", {
        room,
        mode,
        phase: "construct",
        endpoint: "/api/play",
        message: String(error?.message ?? error ?? "Could not create WebSocket"),
      });
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.addEventListener("open", () => {
      if (socket !== ws) return;
      input.enable();
      sendInput();
      ctx.events.emit("network:connected", {
        room,
        mode,
        reconnecting: reconnectAttempt > 0,
      });
    });

    ws.addEventListener("message", (event) => {
      if (socket !== ws) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        ctx.events.emit("network:error", {
          room,
          mode: desiredMode,
          phase: "message-parse",
          endpoint: "/api/play",
          message: String(error?.message ?? "Invalid server message"),
        });
        return;
      }
      if (data.type === "welcome") {
        const wasReconnect = reconnectAttempt > 0 || data.resumed === true;
        playerId = data.playerId;
        desiredMode = normalizeMode(data.mode ?? mode);
        reconnectAttempt = 0;
        ctx.events.emit("network:welcome", data);
        if (wasReconnect) {
          ctx.events.emit("network:reconnected", {
            room,
            mode: desiredMode,
            resumed: data.resumed === true,
          });
        }
        if (data.snapshot) emitSnapshot(data.snapshot);
      } else if (data.type === "snapshot") {
        emitSnapshot(data.snapshot);
      } else if (data.type === "event") {
        emitGamePacket(data);
      } else if (data.type === "events") {
        for (const packet of data.events ?? []) emitGamePacket(packet);
      }
    });

    ws.addEventListener("close", (event) => {
      if (socket !== ws) return;
      socket = null;
      input.disable();
      ctx.events.emit("network:disconnected", {
        room,
        mode: desiredMode,
        code: event.code,
        reason: event.reason || null,
        wasClean: Boolean(event.wasClean),
        endpoint: "/api/play",
        willReconnect: Boolean(desiredRoom),
      });
      scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      if (socket !== ws) return;
      ctx.events.emit("network:error", {
        room,
        mode: desiredMode,
        phase: "socket",
        endpoint: "/api/play",
        readyState: socketStateName(ws.readyState),
        attempt: reconnectAttempt,
        message: "WebSocket connection failed",
      });
    });
  }

  function connect(room = "public", { mode = "tdm" } = {}) {
    desiredRoom = room;
    desiredMode = normalizeMode(mode);
    clearReconnectTimer();
    openSocket();
  }

  function disconnect() {
    desiredRoom = null;
    reconnectAttempt = 0;
    clearReconnectTimer();
    const ws = socket;
    socket = null;
    input.disable();
    try { ws?.close(1000, "Client disconnect"); } catch {}
  }

  ctx.services.provide("network", {
    connect,
    disconnect,
    send,
    get playerId() { return playerId; },
    get sessionId() { return sessionId; },
    get mode() { return desiredMode; },
    get connected() { return socket?.readyState === WebSocket.OPEN; },
    get reconnecting() { return Boolean(desiredRoom && !this.connected); },
  });
}