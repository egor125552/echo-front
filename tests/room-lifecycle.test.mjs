import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_ROOM_TTL_MS,
  activeSocketCount,
  cleanupDeadline,
} from "../src/server/room-lifecycle.js";

test("empty room cleanup waits five seconds", () => {
  assert.equal(EMPTY_ROOM_TTL_MS, 5000);
  assert.equal(cleanupDeadline(1000), 6000);
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
