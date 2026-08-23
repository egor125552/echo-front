import assert from "node:assert/strict";

const timeoutMs = 20000;
const url = process.env.ECHO_FRONT_SMOKE_URL ?? "ws://127.0.0.1:8787/api/play?room=ci-smoke";
const socket = new WebSocket(url);

let playerId = null;
let startPosition = null;
let inputTimer = null;

function stopInputTimer() {
  if (inputTimer) clearInterval(inputTimer);
  inputTimer = null;
}

function sendForwardInput() {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    type: "input",
    input: { forward: 1, strafe: 0, turn: 0, sprint: false, fireHeld: false },
  }));
}

const timeout = setTimeout(() => {
  stopInputTimer();
  console.error("Timed out waiting for Rapier-backed playable WebSocket smoke test");
  try { socket.close(); } catch {}
  process.exit(1);
}, timeoutMs);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({
    type: "input",
    input: { forward: 0, strafe: 0, turn: 0, sprint: false, fireHeld: false },
  }));
});

socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "welcome") {
    playerId = data.playerId;
    assert.ok(playerId);
    assert.ok(data.team === 1 || data.team === 2);
    assert.equal(data.snapshot.entities.length, 4);
    assert.ok(data.snapshot.entities.some((entity) => !entity.bot));

    const self = data.snapshot.entities.find((entity) => entity.id === playerId);
    assert.ok(self, "welcome snapshot must include the human player");
    startPosition = { x: self.x, z: self.z };

    sendForwardInput();
    inputTimer = setInterval(sendForwardInput, 50);
    return;
  }

  if (!playerId || !startPosition || data.type !== "snapshot") return;

  assert.equal(data.snapshot.entities.length, 4);
  const self = data.snapshot.entities.find((entity) => entity.id === playerId);
  assert.ok(self, "runtime snapshot must include the human player");

  const moved = Math.hypot(self.x - startPosition.x, self.z - startPosition.z);
  if (moved <= 0.05) return;

  stopInputTimer();
  clearTimeout(timeout);
  socket.close();
  console.log(`Rapier-backed WebSocket smoke test passed; player moved ${moved.toFixed(3)} units.`);
  process.exit(0);
});

socket.addEventListener("error", (error) => {
  stopInputTimer();
  clearTimeout(timeout);
  console.error("WebSocket smoke test error", error);
  process.exit(1);
});

socket.addEventListener("close", () => {
  if (!playerId) {
    stopInputTimer();
    clearTimeout(timeout);
    console.error("WebSocket closed before welcome");
    process.exit(1);
  }
});
