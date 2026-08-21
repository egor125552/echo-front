export { MatchRoom } from "./server/match-room.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        project: "Echo Front",
        stage: "playable-plugin-prototype",
      });
    }

    if (url.pathname === "/api/play") {
      const roomName = (url.searchParams.get("room") || "public").slice(0, 64);
      const room = env.MATCH_ROOM.getByName(roomName);
      return room.fetch(request);
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
