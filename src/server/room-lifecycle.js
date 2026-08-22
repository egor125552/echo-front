export const EMPTY_ROOM_TTL_MS = 5000;

export function cleanupDeadline(now = Date.now()) {
  return now + EMPTY_ROOM_TTL_MS;
}

export function activeSocketCount(sockets, excludedSocket = null) {
  return sockets.filter((socket) => {
    if (!socket || socket === excludedSocket) return false;
    return socket.readyState !== 3;
  }).length;
}
