const base = process.argv[2] || "ws://127.0.0.1:8787";
const playerId = "8b2f0ce0-9fc1-4c7d-8d61-a81ee7b76311";
const url = new URL("/api/play", base);
url.searchParams.set("room", "websocket-smoke");
url.searchParams.set("mode", "battle-royale");
url.searchParams.set("player", playerId);

if (typeof WebSocket !== "function") {
  throw new Error("Node WebSocket API is unavailable");
}

const result = await new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  const timer = setTimeout(() => {
    try { ws.close(); } catch {}
    reject(new Error(`Timed out waiting for welcome from ${url}`));
  }, 10000);

  let opened = false;
  let welcomed = false;

  ws.addEventListener("open", () => {
    opened = true;
  });

  ws.addEventListener("message", (event) => {
    let data;
    try {
      data = JSON.parse(String(event.data));
    } catch (error) {
      clearTimeout(timer);
      reject(new Error(`Invalid JSON from play socket: ${error.message}`));
      try { ws.close(); } catch {}
      return;
    }
    if (data.type !== "welcome") return;
    welcomed = true;
    if (data.mode !== "battle-royale") {
      clearTimeout(timer);
      reject(new Error(`Unexpected mode ${data.mode}`));
      try { ws.close(); } catch {}
      return;
    }
    if (data.playerId !== playerId) {
      clearTimeout(timer);
      reject(new Error(`Unexpected player id ${data.playerId}`));
      try { ws.close(); } catch {}
      return;
    }
    if (!data.snapshot || data.snapshot.mode !== "battle-royale") {
      clearTimeout(timer);
      reject(new Error("Welcome did not include a Battle Royale snapshot"));
      try { ws.close(); } catch {}
      return;
    }
    ws.send(JSON.stringify({
      type: "input",
      input: { forward: 0, strafe: 0, turn: 0, sprint: false, fireHeld: false },
    }));
    clearTimeout(timer);
    resolve({ opened, welcomed, playerId: data.playerId, mode: data.mode });
    try { ws.close(1000, "smoke complete"); } catch {}
  });

  ws.addEventListener("error", (event) => {
    if (welcomed) return;
    clearTimeout(timer);
    reject(new Error(`WebSocket error before welcome from ${url}: ${event?.message || "connection failed"}`));
  });

  ws.addEventListener("close", (event) => {
    if (welcomed) return;
    clearTimeout(timer);
    reject(new Error(`Play socket closed before welcome: code=${event.code} reason=${event.reason || "none"} clean=${event.wasClean}`));
  });
});

console.log(JSON.stringify({ ok: true, ...result }));
