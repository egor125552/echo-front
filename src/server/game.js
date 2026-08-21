import { PluginHost } from "../core/plugin-host.js";
import { echoFrontPreset } from "../presets/echo-front.js";

export async function createEchoFrontGame() {
  const host = await new PluginHost({ plugins: echoFrontPreset }).start();
  const events = [];

  host.events.on("*", (packet) => {
    if (
      packet.event === "sound:spatial" ||
      packet.event === "feedback:sound" ||
      packet.event === "entity:died" ||
      packet.event === "entity:respawned" ||
      packet.event === "match:score" ||
      packet.event === "weapon:selected"
    ) {
      events.push(packet);
      if (events.length > 200) events.shift();
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
