import { PluginHost } from "../core/plugin-host.js";
import { echoFrontPreset } from "../presets/echo-front.js";

export async function createEchoFrontGame() {
  const host = await new PluginHost({ plugins: echoFrontPreset }).start();
  const events = [];

  host.events.on("*", (packet) => {
    if (
      packet.event === "sound:spatial" ||
      packet.event === "feedback:sound" ||
      packet.event === "movement:blocked" ||
      packet.event === "entity:died" ||
      packet.event === "entity:respawned" ||
      packet.event === "match:score" ||
      packet.event === "match:ended" ||
      packet.event === "match:started" ||
      packet.event === "weapon:fired" ||
      packet.event === "weapon:selected" ||
      packet.event === "weapon:unlocked" ||
      packet.event === "combat:damage"
    ) {
      events.push(packet);
      if (events.length > 400) events.shift();
    }
  });

  return {
    host,
    api: host.services.get("match-api"),
    drainEvents() {
      return events.splice(0);
    },
  };
}
