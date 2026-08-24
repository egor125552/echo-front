export const manifest = {
  id: "cloudflare-session",
  requires: ["keyboard-input"],
};

export const SESSION_STORAGE_KEY = "echo-front-player-session-v1";
export const RECONNECT_DELAYS_MS = [500, 1000, 2000, 3000, 5000];

export function isPlayerSessionId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

export function reconnectDelayForAttempt(attempt) {
  const index = Math.max(0, Math.min(RECONNECT_DELAYS_MS.length - 1, Number(attempt || 1) - 1));
  return RECONNECT_DELAYS_MS[index];
}

function loadOrCreateSessionId() {
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

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const sessionId = loadOrCreateSessionId();
  let socket = null;
  let playerId = sessionId;
  let desiredRoom = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;

  function sendInput() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const sampled = input.sample();
    ctx.events.emit("network:input-sampled", { input: sampled });
    socket.send(JSON.stringify({ type: "input", input: sampled }));
  }

  ctx.events.on("input:changed", sendInput);

  function emitSnapshot(snapshot) {
    if (ctx.services.has("snapshot-smoothing")) ctx.events.emit("game:snapshot:raw", snapshot);
    else ctx.events.emit("game:snapshot", snapshot);
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
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/api/play?room=${encodeURIComponent(room)}&player=${encodeURIComponent(sessionId)}`;
    const ws = new WebSocket(url);
    socket = ws;

    ws.addEventListener("open", () => {
      if (socket !== ws) return;
      input.enable();
      sendInput();
      ctx.events.emit("network:connected", {
        room,
        reconnecting: reconnectAttempt > 0,
      });
    });

    ws.addEventListener("message", (event) => {
      if (socket !== ws) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "welcome") {
        const wasReconnect = reconnectAttempt > 0 || data.resumed === true;
        playerId = data.playerId;
        reconnectAttempt = 0;
        ctx.events.emit("network:welcome", data);
        if (wasReconnect) {
          ctx.events.emit("network:reconnected", {
            room,
            resumed: data.resumed === true,
          });
        }
        if (data.snapshot) emitSnapshot(data.snapshot);
      } else if (data.type === "snapshot") {
        emitSnapshot(data.snapshot);
      } else if (data.type === "event") {
        ctx.events.emit("game:event", data);
      }
    });

    ws.addEventListener("close", (event) => {
      if (socket !== ws) return;
      socket = null;
      input.disable();
      ctx.events.emit("network:disconnected", {
        room,
        code: event.code,
        willReconnect: Boolean(desiredRoom),
      });
      scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      if (socket !== ws) return;
      ctx.events.emit("network:error", { room });
    });
  }

  function connect(room = "public") {
    desiredRoom = room;
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
    try {
      ws?.close(1000, "Client disconnect");
    } catch {
    }
  }

  ctx.services.provide("network", {
    connect,
    disconnect,
    get playerId() {
      return playerId;
    },
    get sessionId() {
      return sessionId;
    },
    get connected() {
      return socket?.readyState === WebSocket.OPEN;
    },
    get reconnecting() {
      return Boolean(desiredRoom && !this.connected);
    },
  });
}
