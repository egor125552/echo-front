import { PluginHost } from "../core/plugin-host.js";
import { echoFrontPreset } from "../presets/echo-front.js";
import { battleRoyalePreset } from "../presets/battle-royale.js";

const FORWARDED_EVENTS = new Set([
  "sound:spatial",
  "feedback:sound",
  "movement:blocked",
  "entity:died",
  "entity:respawned",
  "match:score",
  "match:ended",
  "match:started",
  "weapon:fired",
  "weapon:selected",
  "weapon:unlocked",
  "combat:damage",
  "armor:changed",
  "armor:plating-started",
  "armor:plating-completed",
  "armor:plating-cancelled",
  "battle-royale:deployment",
  "battle-royale:started",
  "battle-royale:remaining",
  "battle-royale:eliminated",
  "battle-royale:ended",
  "battle-royale:zone-damage",
  "battle-royale:zone-closing",
  "world:door",
  "loot:opened",
  "loot:picked",
]);

export function normalizeGameMode(value) {
  return value === "battle-royale" || value === "br" ? "battle-royale" : "tdm";
}

export async function createEchoFrontGame({ mode = "tdm" } = {}) {
  const normalizedMode = normalizeGameMode(mode);
  const preset = normalizedMode === "battle-royale" ? battleRoyalePreset : echoFrontPreset;
  const host = await new PluginHost({ plugins: preset }).start();
  const events = [];
  host.events.on("*", (packet) => {
    if (!FORWARDED_EVENTS.has(packet.event)) return;
    events.push(packet);
    if (events.length > 2400) events.shift();
  });
  return {
    mode: normalizedMode,
    host,
    api: host.services.get("match-api"),
    drainEvents() {
      return events.splice(0);
    },
  };
}
