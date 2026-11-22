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

export function isRedirectedSocket(socket) {
  try {
    return socket?.deserializeAttachment?.()?.redirected === true;
  } catch {
    return false;
  }
}

export function activeSocketCount(sockets, excludedSocket = null) {
  return sockets.filter((socket) => {
    if (!socket || socket === excludedSocket) return false;
    if (socket.readyState === 3) return false;
    if (isRedirectedSocket(socket)) return false;
    return true;
  }).length;
}

export function otherActiveSocketCount(sockets, excludedSockets = []) {
  const excluded = new Set(excludedSockets);
  return sockets.filter((socket) => {
    if (!socket || excluded.has(socket)) return false;
    if (socket.readyState === 3) return false;
    if (isRedirectedSocket(socket)) return false;
    return true;
  }).length;
}

export function isBattleRoyaleJoinRejectedError(error) {
  const message = String(error?.message ?? error ?? "");
  return /late join is not available|reconnect grace expired/i.test(message);
}

export function decideBattleRoyaleJoinRecovery({ mode, error, otherActiveHumans = 0 } = {}) {
  if (mode !== "battle-royale") return "rethrow";
  if (!isBattleRoyaleJoinRejectedError(error)) return "rethrow";
  return Number(otherActiveHumans) > 0 ? "redirect-room" : "reset-room";
}

export function createSuggestedBattleRoyaleRoom(now = Date.now(), randomToken = null) {
  const stamp = Math.max(0, Math.floor(Number(now) || Date.now())).toString(36);
  const rawToken = typeof randomToken === "string" && randomToken.trim()
    ? randomToken.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
    : Math.random().toString(36).slice(2, 8);
  const token = (rawToken || "room").slice(0, 8);
  return `br-${stamp}-${token}`;
}
