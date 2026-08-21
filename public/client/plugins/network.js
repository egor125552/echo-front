export const manifest = {
  id: "cloudflare-session",
  requires: ["keyboard-input"],
};

export async function setup(ctx) {
  const input = ctx.services.get("input");
  let socket = null;
  let timer = null;
  let playerId = null;

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function sendInput() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "input", input: input.sample() }));
  }

  function connect(room = "public") {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/api/play?room=${encodeURIComponent(room)}`;
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      input.enable();
      stopTimer();
      timer = setInterval(sendInput, 50);
      ctx.events.emit("network:connected", {});
    });

    socket.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "welcome") {
        playerId = data.playerId;
        ctx.events.emit("network:welcome", data);
        if (data.snapshot) ctx.events.emit("game:snapshot", data.snapshot);
      } else if (data.type === "snapshot") {
        ctx.events.emit("game:snapshot", data.snapshot);
      } else if (data.type === "event") {
        ctx.events.emit("game:event", data);
      }
    });

    socket.addEventListener("close", () => {
      stopTimer();
      input.disable();
      ctx.events.emit("network:disconnected", {});
    });

    socket.addEventListener("error", () => {
      ctx.events.emit("network:error", {});
    });
  }

  ctx.services.provide("network", {
    connect,
    get playerId() {
      return playerId;
    },
    get connected() {
      return socket?.readyState === WebSocket.OPEN;
    },
  });
}
