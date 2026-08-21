export const manifest = {
  id: "armor",
  version: "1.0.0",
  requires: ["health", "entities"],
  capabilities: [
    "components.register", "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

export async function setup(ctx) {
  ctx.components.register("Armor");

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    const maximum = Number(spec.armor) || 0;
    if (maximum > 0) ctx.components.add(entityId, "Armor", { current: maximum, maximum });
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    ctx.components.remove(entityId, "Armor");
  });

  ctx.events.on("combat:damage:before", (packet) => {
    const armor = ctx.components.get(packet.targetId, "Armor");
    if (!armor || armor.current <= 0 || packet.remaining <= 0) return;
    const before = armor.current;
    const absorbed = Math.min(armor.current, packet.remaining);
    armor.current -= absorbed;
    packet.remaining -= absorbed;
    packet.armorAbsorbed = absorbed;
    packet.armorBroke = before > 0 && armor.current <= 0;
    ctx.events.emit("armor:changed", {
      entityId: packet.targetId,
      armor: armor.current,
      maximum: armor.maximum,
    });
  }, { priority: 100 });

  ctx.events.on("respawn:before", ({ entityId }) => {
    const armor = ctx.components.get(entityId, "Armor");
    if (armor) armor.current = armor.maximum;
  });
}
