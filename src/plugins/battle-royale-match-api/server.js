export const SNAPSHOT_INTERVAL_MS = 125;
export const ENTITY_INTEREST_RADIUS = 125;

export const manifest = {
  id: "match-api",
  version: "2.3.0",
  requires: [
    "entities", "movement", "weapons", "teams", "map-test-arena",
    "battle-royale", "bot-fill", "bot-combat",
  ],
  optional: ["armor", "aim-steering", "health-regeneration"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "events.on", "events.emit",
  ],
};

function distance2(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const movement = ctx.services.get("movement");
  const weapons = ctx.services.get("weapons");
  const teams = ctx.services.get("teams");
  const map = ctx.services.get("map");
  const battleRoyale = ctx.services.get("battle-royale");
  const botFill = ctx.services.get("bot-fill");
  const botCombat = ctx.services.get("bot-combat");
  const armorService = ctx.services.has("armor") ? ctx.services.get("armor") : null;
  const aimSteering = ctx.services.has("aim-steering") ? ctx.services.get("aim-steering") : null;
  const healthRegeneration = ctx.services.has("health-regeneration")
    ? ctx.services.get("health-regeneration")
    : null;
  let humanSerial = 0;

  botFill.ensure();
  const spectatorTargets = new Map();

  function acousticOcclusion(listener, source) {
    if (!listener || !source || typeof map.acousticOcclusionBetween !== "function") return null;
    const value = Number(map.acousticOcclusionBetween(listener, source));
    return Number.isFinite(value) ? clamp01(value) : null;
  }

  function nearestAliveEntity(reference, excludedId = null) {
    let best = null;
    let bestDistance = Infinity;
    for (const entity of entities.all()) {
      if (!entity.alive || entity.id === excludedId) continue;
      const transform = ctx.components.get(entity.id, "Transform");
      if (!transform) continue;
      const distance = reference ? distance2(reference, transform) : 0;
      if (best && distance >= bestDistance) continue;
      best = entity;
      bestDistance = distance;
    }
    return best;
  }

  function spectatorTargetFor(playerId) {
    const player = entities.get(playerId);
    if (!player || player.alive || battleRoyale.status().phase === "ended") return null;
    const currentId = spectatorTargets.get(playerId);
    const current = currentId ? entities.get(currentId) : null;
    if (current?.alive) return current;
    const reference = ctx.components.get(playerId, "Transform");
    const next = nearestAliveEntity(reference, playerId);
    if (next) spectatorTargets.set(playerId, next.id);
    else spectatorTargets.delete(playerId);
    return next;
  }

  ctx.events.on("battle-royale:eliminated", ({ entityId }) => {
    const entity = entities.get(entityId);
    if (!entity || entity.bot) return;
    spectatorTargets.delete(entityId);
    spectatorTargetFor(entityId);
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    spectatorTargets.delete(entityId);
    for (const [viewerId, targetId] of spectatorTargets) {
      if (targetId === entityId) spectatorTargets.delete(viewerId);
    }
  });

  function connectHuman(playerId) {
    const existing = entities.get(playerId);
    if (existing) {
      if (existing.kind !== "human" || existing.bot) {
        throw new Error(`Session id already belongs to a non-human entity: ${playerId}`);
      }
      movement.setInput(playerId, {});
      return {
        playerId,
        team: teams.teamOf(playerId),
        resumed: true,
        mode: "battle-royale",
      };
    }

    botFill.makeRoomForHuman();
    humanSerial += 1;
    const team = 100_000 + humanSerial;
    entities.spawn({
      id: playerId,
      kind: "human",
      name: "Игрок",
      bot: false,
      team,
      health: 200,
      armorPlates: 3,
      armorPlateValue: 50,
      armorCurrent: 100,
      armorReserve: 0,
      weapons: ["pistol"],
    });
    battleRoyale.arm(Date.now());
    return { playerId, team, resumed: false, mode: "battle-royale" };
  }

  function suspendHuman(playerId) {
    const entity = entities.get(playerId);
    if (!entity || entity.kind !== "human" || entity.bot) return false;
    movement.setInput(playerId, {});
    armorService?.cancelPlating(playerId, "disconnect");
    return true;
  }

  function disconnectHuman(playerId) {
    armorService?.cancelPlating(playerId, "disconnect");
    spectatorTargets.delete(playerId);
    entities.remove(playerId);
    const phase = battleRoyale.status().phase;
    if (phase === "waiting" || phase === "deploying") botFill.ensure();
  }

  function hasInterruptingAction(input) {
    return Boolean(
      Math.abs(Number(input.forward) || 0) > 0
      || Math.abs(Number(input.strafe) || 0) > 0
      || Math.abs(Number(input.turn) || 0) > 0
      || input.sprint || input.firePressed || input.fireHeld
      || input.reload || input.selectDelta || input.interactPressed
    );
  }

  function handleInteraction(playerId) {
    const transform = ctx.components.get(playerId, "Transform");
    if (!transform || typeof map.interact !== "function") return false;
    const result = map.interact({ entityId: playerId, ...transform });
    if (!result || result.type !== "crate") return Boolean(result);

    let applied = false;
    let quantity = 0;
    if (result.loot === "rifle") applied = weapons.grant(playerId, "rifle");
    if (result.loot === "armor") {
      quantity = armorService?.grantPlates(playerId, 1) ?? 0;
      applied = quantity > 0;
    }
    ctx.events.emit("loot:picked", {
      entityId: playerId,
      crateId: result.crateId,
      loot: result.loot,
      applied,
      quantity,
      x: result.x,
      y: result.y,
      z: result.z,
    });
    return true;
  }

  function handleInput(playerId, input = {}, now = Date.now()) {
    const entity = entities.get(playerId);
    if (!entity?.alive) return;

    if (!battleRoyale.canAct(now)) {
      movement.setInput(playerId, {});
      return;
    }

    if (input.platePressed && armorService?.startPlating(playerId, now)) {
      movement.setInput(playerId, {});
      return;
    }

    if (armorService?.isPlating(playerId)) {
      if (hasInterruptingAction(input)) armorService.cancelPlating(playerId, "action");
      else {
        movement.setInput(playerId, {});
        return;
      }
    }

    if (input.interactPressed) {
      movement.setInput(playerId, {});
      if (handleInteraction(playerId)) return;
    }

    const movementInput = aimSteering?.adjustInput(playerId, input, now) ?? input;
    movement.setInput(playerId, movementInput);
    if (input.firePressed) weapons.fire(playerId, now);
    if (input.reload) weapons.reload(playerId, now);
    if (input.selectDelta) weapons.select(playerId, input.selectDelta);
  }

  function step(dt, now = Date.now()) {
    battleRoyale.tick(now);
    armorService?.tick(now);
    if (!battleRoyale.isActive()) {
      for (const entity of entities.all()) movement.setInput(entity.id, {});
      return;
    }
    botCombat.tick(dt, now);
    movement.tick(dt, now);
    weapons.tickAutomatic(now);
    healthRegeneration?.tick(dt, now);
  }

  function entitySnapshot(entity) {
    const components = ctx.components.snapshot(entity.id);
    const transform = components.Transform ?? null;
    const health = components.Health ?? null;
    const armor = components.Armor ?? null;
    const armorDescription = armorService?.describe(entity.id) ?? null;
    const inventory = components.Weapons ?? null;
    const selected = inventory?.items?.[inventory.selected] ?? null;
    const position = {
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
      z: transform?.z ?? 0,
    };
    return {
      id: entity.id,
      name: entity.name,
      bot: entity.bot,
      alive: entity.alive,
      team: components.Team?.id ?? 0,
      x: position.x,
      y: position.y,
      z: position.z,
      angle: transform?.angle ?? 0,
      surface: map.surfaceAt?.(position) ?? map.defaultSurface ?? "forest",
      acousticZone: map.acousticZoneAt?.(position) ?? "outdoor",
      location: map.locationAt?.(position) ?? "Карта",
      health: health?.current ?? null,
      healthMax: health?.maximum ?? null,
      armor: armor?.current ?? null,
      armorMax: armor?.maximum ?? null,
      armorPlates: armorDescription?.platesRemaining ?? null,
      armorPlateMax: armorDescription?.maximumPlates ?? null,
      armorReserve: armorDescription?.reservePlates ?? null,
      armorReserveMax: armorDescription?.reserveCapacity ?? null,
      armorSatchel: armorDescription?.hasSatchel ?? false,
      plating: armorDescription?.plating ?? false,
      weapon: selected?.id ?? null,
      weapons: inventory?.items?.map((item) => item.id) ?? [],
      ammo: selected?.ammo ?? null,
      reserve: selected?.reserve ?? null,
    };
  }

  function mapSnapshot(listener = null) {
    return {
      id: map.id,
      halfSize: map.halfSize,
      crates: Array.isArray(map.crates)
        ? map.crates.map((crate) => ({
          id: crate.id,
          x: crate.x,
          y: crate.y ?? 0,
          z: crate.z,
          opened: Boolean(crate.opened),
          occlusion: listener ? (acousticOcclusion(listener, crate) ?? 0) : 0,
        }))
        : [],
    };
  }

  function snapshot(now = Date.now()) {
    return {
      now,
      mode: "battle-royale",
      map: mapSnapshot(),
      match: battleRoyale.status(now),
      entities: entities.all().map(entitySnapshot),
    };
  }

  function snapshotFor(playerId, now = Date.now()) {
    const selfEntity = entities.get(playerId);
    const selfTransform = selfEntity ? ctx.components.get(playerId, "Transform") : null;
    const spectatorTarget = spectatorTargetFor(playerId);
    const listenerTransform = spectatorTarget
      ? ctx.components.get(spectatorTarget.id, "Transform")
      : selfTransform;
    const visible = [];
    for (const entity of entities.all()) {
      if (entity.id === playerId || entity.id === spectatorTarget?.id) {
        visible.push(entitySnapshot(entity));
        continue;
      }
      if (!listenerTransform) continue;
      const transform = ctx.components.get(entity.id, "Transform");
      if (!transform) continue;
      const radius = entity.alive ? ENTITY_INTEREST_RADIUS : 30;
      if (distance2(listenerTransform, transform) <= radius) visible.push(entitySnapshot(entity));
    }
    return {
      now,
      mode: "battle-royale",
      map: mapSnapshot(listenerTransform),
      match: battleRoyale.status(now),
      playerPlacement: battleRoyale.placementOf(playerId),
      spectator: spectatorTarget ? {
        active: true,
        targetId: spectatorTarget.id,
        targetName: spectatorTarget.name,
      } : null,
      entities: visible,
    };
  }

  function eventsForPlayer(playerId, packets = []) {
    const spectatorTarget = spectatorTargetFor(playerId);
    const self = spectatorTarget
      ? ctx.components.get(spectatorTarget.id, "Transform")
      : ctx.components.get(playerId, "Transform");
    const globalEvents = new Set([
      "battle-royale:deployment",
      "battle-royale:started",
      "battle-royale:remaining",
      "battle-royale:ended",
      "battle-royale:zone-closing",
    ]);
    const selected = packets.filter((packet) => {
      const payload = packet.payload ?? {};
      if (globalEvents.has(packet.event)) return true;
      if (packet.event === "feedback:sound") return payload.recipientId === playerId;
      if (packet.event === "movement:blocked") return payload.recipientId === playerId;
      if (packet.event === "battle-royale:zone-damage") return payload.entityId === playerId;
      if (packet.event.startsWith("armor:")) return payload.entityId === playerId;
      if (packet.event === "weapon:selected" || packet.event === "weapon:unlocked") return payload.entityId === playerId;
      if (packet.event === "loot:picked") return payload.entityId === playerId;
      if (packet.event === "combat:damage") return payload.targetId === playerId || payload.attackerId === playerId;
      if (packet.event === "entity:died") return payload.entityId === playerId || payload.killerId === playerId;
      if (!self) return false;
      if (packet.event === "sound:spatial") {
        if (payload.entityId === playerId) return true;
        return distance2(self, payload) <= Number(payload.radius ?? 40) + 4;
      }
      if (packet.event === "weapon:fired") return payload.entityId === playerId || distance2(self, payload) <= 125;
      if (packet.event === "world:door") return payload.entityId === playerId || distance2(self, payload) <= 35;
      if (packet.event === "loot:opened") return payload.entityId === playerId || distance2(self, payload) <= 28;
      if (packet.event === "battle-royale:eliminated") return payload.entityId === playerId || payload.killerId === playerId;
      return false;
    });

    if (!self) return selected;
    return selected.map((packet) => {
      if (packet.event !== "sound:spatial" && packet.event !== "loot:opened") return packet;
      const payload = packet.payload ?? {};
      if (!Number.isFinite(payload.x) || !Number.isFinite(payload.z)) return packet;
      const occlusion = acousticOcclusion(self, payload);
      if (occlusion == null) return packet;
      return {
        ...packet,
        payload: { ...payload, occlusion },
      };
    });
  }

  ctx.services.provide("match-api", {
    mode: "battle-royale",
    snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
    connectHuman,
    suspendHuman,
    disconnectHuman,
    handleInput,
    step,
    snapshot,
    snapshotFor,
    eventsForPlayer,
  });
}
