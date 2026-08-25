import { ENGINE_CONTROL } from "../config/engine-control.js";
import { ENGINE_COMMAND_REQUEST } from "../config/engine-command-request.js";
import { normalizeGameMode } from "./game.js";

const LAST_RESULT_KEY = "engine-control:last-result";

export async function handleEngineControlRequest(room, request) {
  const headers = { "Cache-Control": "no-store" };
  if (!ENGINE_CONTROL.enabled) {
    return Response.json({ ok: false, engineControlEnabled: false }, { status: 404, headers });
  }
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "POST required" }, { status: 405, headers });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON request" }, { status: 400, headers });
  }

  const requestId = Number(body?.requestId);
  if (!Number.isInteger(requestId) || requestId !== ENGINE_COMMAND_REQUEST.id) {
    return Response.json({ ok: false, error: "Unknown engine request" }, { status: 409, headers });
  }

  const previous = await room.ctx.storage.get(LAST_RESULT_KEY);
  if (previous?.requestId === requestId) {
    return Response.json({ ...previous, replayed: true }, { headers });
  }

  const mode = normalizeGameMode(ENGINE_COMMAND_REQUEST.mode);
  await room.ensureGame(mode);
  const response = await room.game.command({
    requestId,
    command: ENGINE_COMMAND_REQUEST.command,
    args: ENGINE_COMMAND_REQUEST.args,
  });
  const result = {
    ok: Boolean(response?.ok),
    requestId,
    mode,
    command: ENGINE_COMMAND_REQUEST.command,
    executedAt: Date.now(),
    response,
  };
  await room.ctx.storage.put(LAST_RESULT_KEY, result);
  return Response.json(result, { headers });
}
