export const RECONNECT_GRACE_MS = 30000;
export const EMPTY_ROOM_TTL_MS = RECONNECT_GRACE_MS;

export function cleanupDeadline(now = Date.now()) {
  return now + EMPTY_ROOM_TTL_MS;
}

export function reconnectExpired(disconnectedAt, now = Date.now()) {
  return Number.isFinite(disconnectedAt) && now - disconnectedAt >= RECONNECT_GRACE_MS;
}

export function normalizePlayerSessionId(value) {
  const sessionId = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sessionId)) {
    return null;
  }
  return sessionId;
}

export function activeSocketCount(sockets, excludedSocket = null) {
  return sockets.filter((socket) => {
    if (!socket || socket === excludedSocket) return false;
    return socket.readyState !== 3;
  }).length;
}
