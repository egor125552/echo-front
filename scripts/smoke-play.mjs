import assert from "node:assert/strict";

const timeoutMs = 15000;
const url = process.env.ECHO_FRONT_SMOKE_URL ?? "ws://127.0.0.1:8787/api/play?room=ci-smoke";
const socket = new WebSocket(url);

const timeout = setTimeout(() => {
  console.error("Timed out waiting for playable WebSocket smoke test");
  try { socket.close(); } catch {}
  process.exit(1);
}, timeoutMs);

let welcomed = false;

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({
    type: "input",
    input: { forward: 0, turn: 0, sprint: false, fireHeld: false },
  }));
});

socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "welcome") {
    welcomed = true;
    assert.ok(data.playerId);
    assert.ok(data.team === 1 || data.team === 2);
    assert.equal(data.snapshot.entities.length, 4);
    assert.ok(data.snapshot.entities.some((entity) => !entity.bot));
    socket.send(JSON.stringify({
      type: "input",
      input: { forward: 1, turn: 0, sprint: false, fireHeld: false },
    }));
    return;
  }

  if (welcomed && data.type === "snapshot") {
    assert.equal(data.snapshot.entities.length, 4);
    clearTimeout(timeout);
    socket.close();
    console.log("Playable WebSocket smoke test passed.");
    process.exit(0);
  }
});

socket.addEventListener("error", (error) => {
  clearTimeout(timeout);
  console.error("WebSocket smoke test error", error);
  process.exit(1);
});

socket.addEventListener("close", () => {
  if (!welcomed) {
    clearTimeout(timeout);
    console.error("WebSocket closed before welcome");
    process.exit(1);
  }
});
