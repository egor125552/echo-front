import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_ROOM_TTL_MS,
  RECONNECT_GRACE_MS,
  activeSocketCount,
  cleanupDeadline,
  normalizePlayerSessionId,
  reconnectExpired,
} from "../src/server/room-lifecycle.js";

test("empty room cleanup leaves a thirty-second reconnect window", () => {
  assert.equal(RECONNECT_GRACE_MS, 30000);
  assert.equal(EMPTY_ROOM_TTL_MS, RECONNECT_GRACE_MS);
  assert.equal(cleanupDeadline(1000), 31000);
  assert.equal(reconnectExpired(1000, 30999), false);
  assert.equal(reconnectExpired(1000, 31000), true);
});

test("player reconnect session ids accept only UUID v4 values", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(normalizePlayerSessionId(id.toUpperCase()), id);
  assert.equal(normalizePlayerSessionId("not-a-session"), null);
  assert.equal(normalizePlayerSessionId("123e4567-e89b-12d3-a456-426614174000"), null);
});

test("closing socket does not keep an otherwise empty room alive", () => {
  const closing = { readyState: 1 };
  assert.equal(activeSocketCount([closing], closing), 0);
});

test("another open socket prevents cleanup", () => {
  const closing = { readyState: 3 };
  const open = { readyState: 1 };
  assert.equal(activeSocketCount([closing, open], closing), 1);
});

test("closed sockets are ignored", () => {
  assert.equal(activeSocketCount([{ readyState: 3 }, { readyState: 3 }]), 0);
});
