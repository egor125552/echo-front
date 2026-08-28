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

function normalizeMode(value) {
  return value === "battle-royale" || value === "br" ? "battle-royale" : "tdm";
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

function browserState() {
  return {
    online: typeof navigator === "undefined" ? null : navigator.onLine,
    visibility: typeof document === "undefined" ? null : document.visibilityState,
  };
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
  let connectSequence = 0;
  let openedAt = null;
  let lastServerIdentity = null;
  let fatalError = null;

  function sendInput() {
    if (fatalError || !socket || socket.readyState !== WebSocket.OPEN) return;
    const sampled = input.sample();
    ctx.events.emit("network:input-sampled", { input: sampled });
    socket.send(JSON.stringify({ type: "input", input: sampled }));
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

  function handleFatal(data, context = {}) {
    if (fatalError) return;
    fatalError = {
      type: "server-error",
      fatal: true,
      code: data?.code ?? "SERVER_FATAL",
      category: data?.category ?? "server",
      message: data?.message ?? "Неизвестная ошибка сервера",
      speech: data?.speech ?? `Ошибка сервера: ${data?.message ?? "неизвестная ошибка"}`,
      pluginId: data?.pluginId ?? null,
      phase: data?.phase ?? null,
      bootId: data?.bootId ?? null,
      previousBootId: data?.previousBootId ?? null,
      matchId: data?.matchId ?? null,
      at: data?.at ?? Date.now(),
      roomDiagnostics: data?.roomDiagnostics ?? null,
      recentServerEvents: data?.recentServerEvents ?? null,
      context: { ...(data?.context ?? {}), ...context },
    };
    input.disable();
    clearReconnectTimer();
    ctx.events.emit("network:fatal-error", fatalError);
  }

  function scheduleReconnect(trigger = "socket-close") {
    if (!desiredRoom || fatalError || reconnectTimer != null) return;
    reconnectAttempt += 1;
    const delay = reconnectDelayForAttempt(reconnectAttempt);
    const packet = {
      room: desiredRoom,
      mode: desiredMode,
      attempt: reconnectAttempt,
      delay,
      trigger,
      ...browserState(),
    };
    ctx.events.emit("network:reconnecting", packet);
    ctx.events.emit("network:reconnect-scheduled", packet);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket("reconnect");
    }, delay);
  }

  function openSocket(trigger = "connect") {
    if (!desiredRoom || fatalError) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    const room = desiredRoom;
    const mode = desiredMode;
    const sequence = ++connectSequence;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/api/play?room=${encodeURIComponent(room)}&mode=${encodeURIComponent(mode)}&player=${encodeURIComponent(sessionId)}`;
    ctx.events.emit("network:connect-attempt", {
      room,
      mode,
      sequence,
      attempt: reconnectAttempt,
      trigger,
      ...browserState(),
    });
    const ws = new WebSocket(url);
    socket = ws;
    openedAt = null;

    ws.addEventListener("open", () => {
      if (socket !== ws) return;
      openedAt = performance.now();
      ctx.events.emit("network:socket-open", {
        room,
        mode,
        sequence,
        reconnecting: reconnectAttempt > 0,
        ...browserState(),
      });
    });

    ws.addEventListener("message", (event) => {
      if (socket !== ws) return;
      let data;
      try { data = JSON.parse(event.data); } catch {
        ctx.events.emit("network:protocol-error", {
          room,
          mode: desiredMode,
          reason: "invalid-json",
          bytes: typeof event.data === "string" ? event.data.length : null,
        });
        return;
      }

      if (data.type === "server-error") {
        ctx.events.emit("network:server-error", data);
        if (data.fatal !== false) handleFatal(data, { room, mode: desiredMode });
        return;
      }

      if (data.type === "welcome") {
        const wasReconnect = reconnectAttempt > 0 || data.resumed === true;
        const nextIdentity = {
          bootId: data.server?.bootId ?? null,
          matchId: data.server?.matchId ?? null,
          matchCreatedAt: data.server?.matchCreatedAt ?? null,
        };
        if (
          wasReconnect
          && lastServerIdentity?.matchId
          && nextIdentity.matchId
          && lastServerIdentity.matchId !== nextIdentity.matchId
        ) {
          const identityError = {
            type: "server-error",
            fatal: true,
            code: "MATCH_ID_CHANGED",
            category: "unexpected-new-match",
            message: `Сервер вернул другой матч после переподключения: ${lastServerIdentity.matchId} -> ${nextIdentity.matchId}`,
            speech: "Ошибка сервера. После переподключения был обнаружен другой матч. Автоматическое переключение остановлено.",
            previousMatchId: lastServerIdentity.matchId,
            matchId: nextIdentity.matchId,
            previousBootId: lastServerIdentity.bootId,
            bootId: nextIdentity.bootId,
          };
          ctx.events.emit("network:match-identity-changed", identityError);
          handleFatal(identityError, { room, mode: desiredMode });
          return;
        }

        lastServerIdentity = nextIdentity;
        playerId = data.playerId;
        desiredMode = normalizeMode(data.mode ?? mode);
        reconnectAttempt = 0;
        input.enable();
        ctx.events.emit("network:welcome", data);
        ctx.events.emit("network:server-identity", {
          room,
          mode: desiredMode,
          ...nextIdentity,
          resumed: data.resumed === true,
        });
        if (wasReconnect) {
          ctx.events.emit("network:reconnected", {
            room,
            mode: desiredMode,
            resumed: data.resumed === true,
            ...nextIdentity,
          });
        }
        sendInput();
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
      const lifetimeMs = openedAt == null ? null : Math.max(0, Math.round(performance.now() - openedAt));
      const willReconnect = Boolean(desiredRoom && !fatalError);
      ctx.events.emit("network:disconnected", {
        room,
        mode: desiredMode,
        sequence,
        code: event.code,
        reason: event.reason || "",
        wasClean: event.wasClean,
        lifetimeMs,
        willReconnect,
        fatal: Boolean(fatalError),
        ...browserState(),
      });
      if (willReconnect) scheduleReconnect(`close-${event.code || 0}`);
    });

    ws.addEventListener("error", () => {
      if (socket !== ws) return;
      ctx.events.emit("network:error", {
        room,
        mode: desiredMode,
        sequence,
        readyState: ws.readyState,
        ...browserState(),
      });
    });
  }

  function connect(room = "public", { mode = "tdm" } = {}) {
    desiredRoom = room;
    desiredMode = normalizeMode(mode);
    fatalError = null;
    reconnectAttempt = 0;
    clearReconnectTimer();
    openSocket("manual-connect");
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
    get playerId() { return playerId; },
    get sessionId() { return sessionId; },
    get mode() { return desiredMode; },
    get connected() { return socket?.readyState === WebSocket.OPEN && !fatalError; },
    get reconnecting() { return Boolean(desiredRoom && !this.connected && !fatalError); },
    get fatalError() { return fatalError; },
    get serverIdentity() { return lastServerIdentity ? { ...lastServerIdentity } : null; },
  });
}
