import test from "node:test";
import assert from "node:assert/strict";
import {
  activeSocketCount,
  createSuggestedBattleRoyaleRoom,
  decideBattleRoyaleJoinRecovery,
  evaluateBattleRoyaleRoomJoinability,
  isBattleRoyaleJoinRejectedError,
  isPublicMatchRoom,
  isRedirectedSocket,
  nextPublicBattleRoyaleRoom,
  otherActiveSocketCount,
} from "../src/server/room-lifecycle.js";
import { setup as setupNetworkPlugin } from "../public/client/plugins/network.js";

function makeSocket({ readyState = 1, attachment = {} } = {}) {
  return {
    readyState,
    deserializeAttachment() {
      return attachment;
    },
  };
}

test("room-lifecycle recognizes Battle Royale join rejection errors and chooses reset vs redirect", () => {
  const lateJoinErr = new Error(
    "Battle royale already in progress; late join is not available: a06c866b-7389-49ad-b45a-df343405676c",
  );
  const expiredErr = new Error("Reconnect grace expired for player a06c866b-7389-49ad-b45a-df343405676c");
  const unrelatedErr = new Error("Database crashed");

  assert.equal(isBattleRoyaleJoinRejectedError(lateJoinErr), true);
  assert.equal(isBattleRoyaleJoinRejectedError(expiredErr), true);
  assert.equal(isBattleRoyaleJoinRejectedError(unrelatedErr), false);

  assert.equal(
    decideBattleRoyaleJoinRecovery({ mode: "battle-royale", error: lateJoinErr, otherActiveHumans: 0 }),
    "reset-room",
  );
  assert.equal(
    decideBattleRoyaleJoinRecovery({ mode: "battle-royale", error: expiredErr, otherActiveHumans: 0 }),
    "reset-room",
  );
  assert.equal(
    decideBattleRoyaleJoinRecovery({ mode: "battle-royale", error: lateJoinErr, otherActiveHumans: 1 }),
    "redirect-room",
  );
  assert.equal(
    decideBattleRoyaleJoinRecovery({ mode: "tdm", error: lateJoinErr, otherActiveHumans: 0 }),
    "rethrow",
  );
  assert.equal(
    decideBattleRoyaleJoinRecovery({ mode: "battle-royale", error: unrelatedErr, otherActiveHumans: 0 }),
    "rethrow",
  );
});

test("room-lifecycle ignores redirected and closed sockets when counting active humans", () => {
  const playerA = makeSocket({ readyState: 1, attachment: { playerId: "a" } });
  const playerB = makeSocket({ readyState: 1, attachment: { playerId: "b" } });
  const closed = makeSocket({ readyState: 3, attachment: { playerId: "c" } });
  const redirected = makeSocket({ readyState: 1, attachment: { playerId: "d", redirected: true } });

  assert.equal(isRedirectedSocket(redirected), true);
  assert.equal(isRedirectedSocket(playerA), false);

  const all = [playerA, playerB, closed, redirected];
  assert.equal(activeSocketCount(all), 2);
  assert.equal(otherActiveSocketCount(all, [playerA]), 1);
  assert.equal(otherActiveSocketCount([playerA, closed, redirected], [playerA]), 0);

  const suggested = createSuggestedBattleRoyaleRoom(1795357942203, "AB-12_cd");
  assert.match(suggested, /^br-[a-z0-9]+-ab12cd$/);
});

test("room-lifecycle evaluates shared public BR lobby joinability across stale, early-drop-in, ended, and eliminated states", () => {
  assert.equal(isPublicMatchRoom("public"), true);
  assert.equal(isPublicMatchRoom("public-2"), true);
  assert.equal(isPublicMatchRoom("br-123-abc"), false);
  assert.equal(nextPublicBattleRoyaleRoom(1), "public");
  assert.equal(nextPublicBattleRoyaleRoom(2), "public-2");

  const now = 1_000_000;
  assert.deepEqual(
    evaluateBattleRoyaleRoomJoinability({ gameExists: false, now }),
    { joinable: true, reason: "empty" },
  );
  assert.deepEqual(
    evaluateBattleRoyaleRoomJoinability({
      gameExists: true,
      phase: "active",
      deploymentActive: false,
      startedAt: now - 30_000,
      aliveCount: 80,
      now,
    }),
    { joinable: true, reason: "early-drop-in" },
  );
  assert.deepEqual(
    evaluateBattleRoyaleRoomJoinability({
      gameExists: true,
      phase: "active",
      deploymentActive: false,
      startedAt: now - 150_000,
      aliveCount: 80,
      now,
    }),
    { joinable: false, reason: "late-match" },
  );
  assert.deepEqual(
    evaluateBattleRoyaleRoomJoinability({
      gameExists: true,
      phase: "ended",
      ended: true,
      playerPresent: true,
      playerAlive: false,
      now,
    }),
    { joinable: false, reason: "ended" },
  );
  assert.deepEqual(
    evaluateBattleRoyaleRoomJoinability({
      gameExists: true,
      phase: "active",
      playerPresent: true,
      playerAlive: false,
      now,
    }),
    { joinable: false, reason: "eliminated" },
  );
  assert.deepEqual(
    evaluateBattleRoyaleRoomJoinability({
      gameExists: true,
      phase: "active",
      playerExpired: true,
      now,
    }),
    { joinable: false, reason: "reconnect-expired" },
  );
});

test("client network plugin transparently switches to suggested fresh room on room-busy without emitting errors", async () => {
  const createdSockets = [];
  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.listeners = new Map();
      this.closedWith = null;
      this.sent = [];
      createdSockets.push(this);
    }

    addEventListener(type, fn) {
      const list = this.listeners.get(type) ?? [];
      list.push(fn);
      this.listeners.set(type, list);
    }

    emit(type, event = {}) {
      for (const fn of this.listeners.get(type) ?? []) fn(event);
    }

    send(payload) {
      this.sent.push(payload);
    }

    close(code = 1000, reason = "") {
      this.readyState = FakeWebSocket.CLOSED;
      this.closedWith = { code, reason };
      this.emit("close", { code, reason, wasClean: true });
    }
  }

  const originalWebSocket = globalThis.WebSocket;
  const originalLocation = globalThis.location;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;

  const store = new Map();
  globalThis.WebSocket = FakeWebSocket;
  globalThis.location = { protocol: "http:", host: "localhost:3000" };
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
  };
  globalThis.sessionStorage = {
    getItem: (k) => store.get(`s:${k}`) ?? null,
    setItem: (k, v) => store.set(`s:${k}`, String(v)),
  };

  try {
    const emitted = [];
    const services = new Map();
    services.set("input", {
      enable() {},
      disable() {},
      sample() { return {}; },
    });
    const ctx = {
      services: {
        get: (name) => services.get(name),
        has: (name) => services.has(name),
        provide: (name, api) => services.set(name, api),
      },
      events: {
        on() {},
        emit(event, payload) {
          emitted.push({ event, payload });
        },
      },
    };

    await setupNetworkPlugin(ctx);
    const network = services.get("network");
    network.connect("public", { mode: "battle-royale" });

    assert.equal(createdSockets.length, 1);
    const first = createdSockets[0];
    assert.match(first.url, /room=public&mode=battle-royale/);

    first.readyState = FakeWebSocket.OPEN;
    first.emit("open");
    first.emit("message", {
      data: JSON.stringify({
        type: "room-busy",
        reason: "battle-royale-in-progress",
        mode: "battle-royale",
        suggestedRoom: "br-fresh-1234",
      }),
    });

    assert.equal(createdSockets.length, 2, "must immediately open a new socket to the suggested room");
    assert.equal(network.room, "br-fresh-1234");
    assert.match(createdSockets[1].url, /room=br-fresh-1234&mode=battle-royale/);

    const errors = emitted.filter((e) => e.event === "network:error" || e.event === "network:disconnected");
    assert.equal(errors.length, 0, "room-busy redirect must not emit network errors or disconnects");
    const redirects = emitted.filter((e) => e.event === "network:room-redirected");
    assert.equal(redirects.length, 1);
    assert.equal(redirects[0].payload.fromRoom, "public");
    assert.equal(redirects[0].payload.room, "br-fresh-1234");

    // Also verify fallback redirect on direct close code 4009 without room-busy frame
    const second = createdSockets[1];
    second.readyState = FakeWebSocket.OPEN;
    second.emit("open");
    second.close(4009, "Match already in progress");

    assert.equal(createdSockets.length, 3, "close code 4009 must also redirect to a fresh BR room");
    assert.notEqual(network.room, "br-fresh-1234");
    assert.match(network.room, /^br-/);
    assert.equal(
      emitted.filter((e) => e.event === "network:error" || e.event === "network:disconnected").length,
      0,
    );

    network.disconnect();
  } finally {
    globalThis.WebSocket = originalWebSocket;
    globalThis.location = originalLocation;
    globalThis.localStorage = originalLocalStorage;
    globalThis.sessionStorage = originalSessionStorage;
  }
});
