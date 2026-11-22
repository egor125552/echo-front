import {
  ITEM_CATALOG,
  buildGroupedInventory,
  detectNearbyCover,
  normalizeSquadOrder,
  planBatchTransfer,
  validateDropRequest,
} from "../../game/crouch-squad-inventory.js";

export const manifest = {
  id: "battle-royale-tactics-inventory",
  version: "1.0.0",
  requires: ["entities", "teams", "movement", "weapons", "match-api"],
  capabilities: [
    "services.consume",
    "services.provide",
    "components.read",
    "components.write",
    "events.on",
    "events.emit",
  ],
};

const ORDER_TTL_MS = 75_000;
const COVER_REFRESH_INTERVAL_MS = 180;
let dropSerial = 1;

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const weapons = ctx.services.get("weapons");
  const match = ctx.services.get("match-api");
  const map = ctx.services.has("map") ? ctx.services.get("map") : null;
  const armorService = ctx.services.has("armor") ? ctx.services.get("armor") : null;
  const injury = ctx.services.has("injury") ? ctx.services.get("injury") : null;
  const stimulantsService = ctx.services.has("stimulants") ? ctx.services.get("stimulants") : null;
  const vehicles = ctx.services.has("vehicles") ? ctx.services.get("vehicles") : null;
  const jump = ctx.services.has("jump") ? ctx.services.get("jump") : null;
  const parachute = ctx.services.has("parachute") ? ctx.services.get("parachute") : null;

  const stances = new Map(); // entityId -> { crouching, inCover, coverKind, coverLabel, coverX, coverZ, lastCoverCheckAt }
  const squadOrders = new Map(); // botId -> { type, label, speech, leaderId, point, holdPoint, issuedAt, expiresAt }

  function mapObstacles() {
    if (!map) return [];
    const list = [];
    for (const wall of map.walls ?? []) {
      if (!wall || wall.kind === "building-floor" || wall.kind === "building-stair") continue;
      list.push({
        id: wall.id ?? null,
        kind: wall.kind ?? "wall",
        parapet: Boolean(wall.parapet),
        x: finite(wall.x),
        y: finite(wall.y),
        z: finite(wall.z),
        width: Math.max(0.24, finite(wall.hx, 0.5) * 2),
        depth: Math.max(0.24, finite(wall.hz, 0.5) * 2),
        height: finite(wall.height, 2.8),
      });
    }
    return list;
  }

  function liveVehicles() {
    if (!vehicles || typeof vehicles.snapshot !== "function") return [];
    try {
      return vehicles.snapshot() ?? [];
    } catch {
      return [];
    }
  }

  function coverAt(position, extraRadii = {}) {
    return detectNearbyCover({
      position,
      vehicles: liveVehicles(),
      obstacles: mapObstacles(),
      crates: map?.crates ?? [],
      ...extraRadii,
    });
  }

  function findCoverPoint(position, searchRadius = 11) {
    const px = finite(position?.x);
    const py = finite(position?.y);
    const pz = finite(position?.z);
    let best = null;
    const consider = (x, z, kind, dist) => {
      if (dist > searchRadius) return;
      if (!best || dist < best.distance) {
        best = { x, y: py, z, kind, distance: dist };
      }
    };

    for (const v of liveVehicles()) {
      if (Math.abs(finite(v.y) - py) > 1.8) continue;
      const dx = px - finite(v.x);
      const dz = pz - finite(v.z);
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05 || dist > searchRadius) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const offset = Math.max(finite(v.width, 2.1), finite(v.length, 4.4)) * 0.5 + 0.9;
      consider(finite(v.x) + nx * offset, finite(v.z) + nz * offset, "vehicle", dist);
    }

    for (const wall of map?.walls ?? []) {
      if (!wall || wall.kind === "building-floor" || wall.kind === "building-stair") continue;
      const topY = finite(wall.y) + finite(wall.height, 2.6);
      if (topY < py + 0.45 || finite(wall.y) > py + 1.45) continue;
      const dx = px - finite(wall.x);
      const dz = pz - finite(wall.z);
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05 || dist > searchRadius) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const offset = Math.max(finite(wall.hx, 0.3), finite(wall.hz, 0.3)) + 0.85;
      consider(finite(wall.x) + nx * offset, finite(wall.z) + nz * offset, wall.parapet ? "roof-parapet" : "wall", dist);
    }

    return best;
  }

  function syncTransformStance(entityId, state) {
    const transform = ctx.components.get(entityId, "Transform");
    if (!transform) return;
    transform.crouching = Boolean(state?.crouching);
    transform.inCover = Boolean(state?.crouching && state?.inCover);
    transform.coverKind = transform.inCover ? (state.coverKind ?? null) : null;
    transform.coverLabel = transform.inCover ? (state.coverLabel ?? null) : null;
    transform.coverX = transform.inCover ? state.coverX : null;
    transform.coverZ = transform.inCover ? state.coverZ : null;
  }

  function canCrouch(entityId) {
    const entity = entities.get(entityId);
    if (!entity?.alive) return false;
    const transform = ctx.components.get(entityId, "Transform");
    if (!transform) return false;
    if (vehicles?.isDriving?.(entityId)) return false;
    if (injury?.isDowned?.(entityId)) return false;
    if (jump?.stateFor?.(entityId)) return false;
    const para = ctx.components.get(entityId, "Parachute");
    if (para?.airborne || para?.phase === "freefall" || para?.phase === "deployed") return false;
    return true;
  }

  function setCrouch(entityId, desired, { now = Date.now(), silent = false, reason = "toggle" } = {}) {
    const entity = entities.get(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (!entity?.alive || !transform) return null;
    const targetCrouch = Boolean(desired) && canCrouch(entityId);
    const prev = stances.get(entityId) ?? {
      crouching: false,
      inCover: false,
      coverKind: null,
      coverLabel: null,
      coverX: null,
      coverZ: null,
      lastCoverCheckAt: 0,
    };

    const cover = targetCrouch ? coverAt(transform) : { active: false };
    const next = {
      crouching: targetCrouch,
      inCover: Boolean(targetCrouch && cover.active),
      coverKind: targetCrouch && cover.active ? cover.kind : null,
      coverLabel: targetCrouch && cover.active ? cover.label : null,
      coverX: targetCrouch && cover.active ? cover.coverX : null,
      coverZ: targetCrouch && cover.active ? cover.coverZ : null,
      lastCoverCheckAt: now,
    };
    const changed = prev.crouching !== next.crouching
      || prev.inCover !== next.inCover
      || prev.coverKind !== next.coverKind;

    stances.set(entityId, next);
    syncTransformStance(entityId, next);

    if (changed && !silent) {
      ctx.events.emit("tactics:stance-changed", {
        entityId,
        crouching: next.crouching,
        inCover: next.inCover,
        coverKind: next.coverKind,
        coverLabel: next.coverLabel,
        reason,
        now,
      });
    }
    return next;
  }

  function toggleCrouch(entityId, now = Date.now()) {
    const current = stances.get(entityId);
    return setCrouch(entityId, !current?.crouching, { now, reason: "toggle" });
  }

  function stanceFor(entityId) {
    const state = stances.get(entityId);
    if (!state) {
      return {
        crouching: false,
        inCover: false,
        coverKind: null,
        coverLabel: null,
      };
    }
    return {
      crouching: Boolean(state.crouching),
      inCover: Boolean(state.inCover),
      coverKind: state.coverKind ?? null,
      coverLabel: state.coverLabel ?? null,
    };
  }

  function aliveSquadmatesOf(leaderId) {
    const team = Number(teams.teamOf(leaderId)) || 0;
    if (team <= 0) return [];
    const leaderTransform = ctx.components.get(leaderId, "Transform");
    return entities.all()
      .filter((entity) => entity.id !== leaderId && entity.alive && (Number(teams.teamOf(entity.id)) || 0) === team)
      .map((entity) => {
        const tr = ctx.components.get(entity.id, "Transform");
        const hp = ctx.components.get(entity.id, "Health");
        const armor = armorService?.describe?.(entity.id);
        const stance = stanceFor(entity.id);
        const order = squadOrderFor(entity.id);
        const dist = leaderTransform && tr
          ? Math.hypot(finite(tr.x) - finite(leaderTransform.x), finite(tr.z) - finite(leaderTransform.z))
          : null;
        return {
          id: entity.id,
          name: entity.name ?? "Напарник",
          alive: Boolean(entity.alive),
          downed: Boolean(injury?.isDowned?.(entity.id)),
          health: Math.round(finite(hp?.current, 0)),
          maxHealth: Math.round(finite(hp?.maximum, 200)),
          armor: Math.round(finite(armor?.current, 0)),
          armorReserve: Math.round(finite(armor?.reservePlates, 0)),
          crouching: stance.crouching,
          inCover: stance.inCover,
          coverLabel: stance.coverLabel,
          orderType: order?.type ?? null,
          orderLabel: order?.label ?? null,
          distanceMeters: dist == null ? null : Number(dist.toFixed(1)),
        };
      });
  }

  function squadOrderFor(botId, now = Date.now()) {
    const order = squadOrders.get(botId);
    if (!order) return null;
    if (order.expiresAt <= now) {
      squadOrders.delete(botId);
      return null;
    }
    return order;
  }

  function issueSquadOrder(leaderId, orderInput, now = Date.now()) {
    const leader = entities.get(leaderId);
    const leaderTransform = ctx.components.get(leaderId, "Transform");
    if (!leader?.alive || !leaderTransform) return null;
    const halfSize = finite(map?.halfSize, 420);
    const normalized = normalizeSquadOrder(orderInput, leaderTransform, {
      mapBounds: { minX: -halfSize, maxX: halfSize, minZ: -halfSize, maxZ: halfSize },
      now,
    });
    if (!normalized) return null;

    const mates = aliveSquadmatesOf(leaderId).filter((mate) => !mate.downed);
    const selected = normalized.targetIds?.length
      ? mates.filter((mate) => normalized.targetIds.includes(mate.id))
      : mates;

    if (!selected.length) {
      ctx.events.emit("tactics:squad-order", {
        leaderId,
        ok: false,
        order: normalized.type,
        label: normalized.label,
        recipients: [],
        speech: "Нет живых напарников для выполнения команды",
        now,
      });
      return { ok: false, recipients: [] };
    }

    for (const mate of selected) {
      const mateTransform = ctx.components.get(mate.id, "Transform");
      const holdPoint = normalized.type === "hold" && mateTransform
        ? { x: finite(mateTransform.x), y: finite(mateTransform.y), z: finite(mateTransform.z) }
        : null;
      squadOrders.set(mate.id, {
        ...normalized,
        leaderId,
        holdPoint,
        expiresAt: now + ORDER_TTL_MS,
      });
      if (normalized.type === "cover") {
        setCrouch(mate.id, true, { now, silent: true, reason: "order-cover" });
      } else if (normalized.type === "attack" || normalized.type === "move" || normalized.type === "follow") {
        setCrouch(mate.id, false, { now, silent: true, reason: "order-move" });
      }
    }

    const recipientNames = selected.map((mate) => mate.name);
    const scopeLabel = selected.length === mates.length && mates.length > 1
      ? "Всему отряду"
      : recipientNames.join(", ");
    const speech = `Команда «${normalized.label}» передана: ${scopeLabel}. ${normalized.speech}`;
    ctx.events.emit("tactics:squad-order", {
      leaderId,
      ok: true,
      order: normalized.type,
      label: normalized.label,
      point: normalized.point,
      recipients: selected.map((mate) => ({ id: mate.id, name: mate.name })),
      speech,
      now,
    });
    return { ok: true, order: normalized.type, recipients: selected.map((mate) => mate.id) };
  }

  function senderStockFor(entityId) {
    const armor = armorService?.describe?.(entityId);
    const stims = stimulantsService?.describe?.(entityId);
    const inv = ctx.components.get(entityId, "Weapons");
    const stock = {
      "armor-plate": Math.max(0, Math.floor(finite(armor?.reservePlates, 0))),
      "stim-standard": Math.max(0, Math.floor(finite(stims?.stimulants, 0))),
      "stim-fast": Math.max(0, Math.floor(finite(stims?.fastStimulants, 0))),
      "stim-turbo": Math.max(0, Math.floor(finite(stims?.turboStimulants, 0))),
    };
    for (const item of inv?.items ?? []) {
      if (!item?.id) continue;
      stock[`ammo-${item.id}`] = Math.max(0, Math.floor(finite(item.reserve, 0)));
    }
    return stock;
  }

  function recipientCapacitiesFor(recipientIds) {
    const mapCaps = {};
    for (const id of recipientIds) {
      const caps = {
        "armor-plate": armorService?.remainingReserveCapacity?.(id) ?? 6,
        "stim-standard": stimulantsService?.remainingCapacity?.(id, "standard") ?? 20,
        "stim-fast": stimulantsService?.remainingCapacity?.(id, "fast") ?? 20,
        "stim-turbo": stimulantsService?.remainingCapacity?.(id, "turbo") ?? 10,
      };
      for (const weaponId of ["pistol", "rifle", "marksman", "sniper"]) {
        caps[`ammo-${weaponId}`] = weapons.ammoCapacityFor?.(id, weaponId) ?? 0;
      }
      mapCaps[id] = caps;
    }
    return mapCaps;
  }

  function takeItemFromEntity(entityId, itemId, quantity) {
    if (itemId === "armor-plate") return armorService?.takePlates?.(entityId, quantity) ?? 0;
    if (itemId === "stim-standard") return stimulantsService?.take?.(entityId, "standard", quantity) ?? 0;
    if (itemId === "stim-fast") return stimulantsService?.take?.(entityId, "fast", quantity) ?? 0;
    if (itemId === "stim-turbo") return stimulantsService?.take?.(entityId, "turbo", quantity) ?? 0;
    if (itemId.startsWith("ammo-")) return weapons.takeAmmo?.(entityId, itemId.slice(5), quantity) ?? 0;
    return 0;
  }

  function grantItemToEntity(entityId, itemId, quantity) {
    if (itemId === "armor-plate") return armorService?.grantPlates?.(entityId, quantity) ?? 0;
    if (itemId === "stim-standard") return stimulantsService?.grantTransfer?.(entityId, "standard", quantity) ?? 0;
    if (itemId === "stim-fast") return stimulantsService?.grantTransfer?.(entityId, "fast", quantity) ?? 0;
    if (itemId === "stim-turbo") return stimulantsService?.grantTransfer?.(entityId, "turbo", quantity) ?? 0;
    if (itemId.startsWith("ammo-")) return weapons.grantAmmo?.(entityId, itemId.slice(5), quantity) ?? 0;
    return 0;
  }

  function inventorySnapshotFor(entityId) {
    const armor = armorService?.describe?.(entityId);
    const stims = stimulantsService?.describe?.(entityId);
    const inv = ctx.components.get(entityId, "Weapons");
    return buildGroupedInventory({
      armorReserve: armor?.reservePlates ?? 0,
      stimulants: {
        standard: stims?.stimulants ?? 0,
        fast: stims?.fastStimulants ?? 0,
        turbo: stims?.turboStimulants ?? 0,
      },
      weapons: inv?.items ?? [],
    });
  }

  function handleInventoryAction(playerId, action, now = Date.now()) {
    const player = entities.get(playerId);
    const transform = ctx.components.get(playerId, "Transform");
    if (!player?.alive || !transform || !action || typeof action !== "object") return null;

    const kind = String(action.type ?? "").trim().toLowerCase();
    const senderStock = senderStockFor(playerId);

    if (kind === "drop") {
      const check = validateDropRequest({
        itemId: action.itemId,
        quantity: action.quantity,
        senderStock,
      });
      if (!check.ok) {
        ctx.events.emit("inventory:failed", {
          entityId: playerId,
          action: "drop",
          reason: check.reason,
          speech: check.speech,
          now,
        });
        return check;
      }
      const taken = takeItemFromEntity(playerId, check.itemId, check.quantity);
      if (taken <= 0) {
        const fail = {
          ok: false,
          reason: "no-stock",
          speech: `Не хватило предмета: ${check.label}`,
        };
        ctx.events.emit("inventory:failed", { entityId: playerId, action: "drop", ...fail, now });
        return fail;
      }

      const angle = finite(transform.angle);
      const dropX = Number((finite(transform.x) + Math.sin(angle) * 1.15).toFixed(2));
      const dropY = Number(finite(transform.y).toFixed(2));
      const dropZ = Number((finite(transform.z) - Math.cos(angle) * 1.15).toFixed(2));
      const crateId = `drop-pack-${dropSerial++}`;
      const crate = {
        id: crateId,
        name: `${check.label} (${taken})`,
        loot: "drop-pack",
        droppedItem: true,
        dropItem: {
          itemId: check.itemId,
          label: check.label,
          quantity: taken,
          droppedBy: playerId,
        },
        x: dropX,
        y: dropY,
        z: dropZ,
        opened: false,
      };
      if (Array.isArray(map?.crates)) map.crates.push(crate);

      const speech = `Выброшено на землю: ${check.label}, ${taken} шт.`;
      ctx.events.emit("inventory:dropped", {
        entityId: playerId,
        crateId,
        itemId: check.itemId,
        label: check.label,
        quantity: taken,
        x: dropX,
        y: dropY,
        z: dropZ,
        speech,
        now,
      });
      return { ok: true, crateId, itemId: check.itemId, quantity: taken, speech };
    }

    if (kind === "transfer") {
      const aliveMates = aliveSquadmatesOf(playerId);
      const aliveById = new Map(aliveMates.map((m) => [m.id, m]));
      const requestedRecipients = Array.isArray(action.recipientIds) && action.recipientIds.length
        ? action.recipientIds
        : (action.recipientId ? [action.recipientId] : []);
      const validRecipients = [...new Set(requestedRecipients.map((id) => String(id).trim()))]
        .filter((id) => aliveById.has(id));

      const items = Array.isArray(action.items) && action.items.length
        ? action.items
        : (action.itemId ? [{ itemId: action.itemId, quantity: action.quantity ?? 1 }] : []);

      const plan = planBatchTransfer({
        senderStock,
        items,
        recipientIds: validRecipients,
        recipientCapacities: recipientCapacitiesFor(validRecipients),
      });

      if (!plan.ok) {
        ctx.events.emit("inventory:failed", {
          entityId: playerId,
          action: "transfer",
          reason: plan.reason,
          speech: plan.speech,
          now,
        });
        return plan;
      }

      const delivered = [];
      for (const entry of plan.transfers) {
        const recipient = aliveById.get(entry.recipientId);
        const deliveredItems = [];
        for (const item of entry.items) {
          const taken = takeItemFromEntity(playerId, item.itemId, item.quantity);
          if (taken <= 0) continue;
          const granted = grantItemToEntity(entry.recipientId, item.itemId, taken);
          if (granted < taken) {
            // Return any un-grantable remainder safely so items are never lost
            grantItemToEntity(playerId, item.itemId, taken - granted);
          }
          if (granted > 0) {
            deliveredItems.push({
              itemId: item.itemId,
              label: ITEM_CATALOG[item.itemId]?.label ?? item.label,
              quantity: granted,
            });
          }
        }
        if (deliveredItems.length) {
          delivered.push({
            recipientId: entry.recipientId,
            recipientName: recipient?.name ?? "Напарник",
            items: deliveredItems,
          });
        }
      }

      if (!delivered.length) {
        const fail = {
          ok: false,
          reason: "transfer-empty",
          speech: "Не удалось передать предметы напарникам",
        };
        ctx.events.emit("inventory:failed", { entityId: playerId, action: "transfer", ...fail, now });
        return fail;
      }

      const summaryParts = delivered.map((entry) => {
        const itemsText = entry.items.map((item) => `${item.label} ${item.quantity} шт.`).join(", ");
        return `${entry.recipientName}: ${itemsText}`;
      });
      const speech = `Передано напарникам. ${summaryParts.join(". ")}`;
      ctx.events.emit("inventory:transferred", {
        entityId: playerId,
        transfers: delivered,
        speech,
        now,
      });
      return { ok: true, transfers: delivered, speech };
    }

    return null;
  }

  ctx.events.on("entity:died", ({ entityId }) => {
    stances.delete(entityId);
    squadOrders.delete(entityId);
    syncTransformStance(entityId, { crouching: false });
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    stances.delete(entityId);
    squadOrders.delete(entityId);
  });

  ctx.events.on("entity:respawned", ({ entityId }) => {
    stances.delete(entityId);
    syncTransformStance(entityId, { crouching: false });
  });

  ctx.events.on("jump:started", ({ entityId, now = Date.now() }) => {
    if (stances.get(entityId)?.crouching) {
      setCrouch(entityId, false, { now, silent: true, reason: "jump" });
    }
  });

  const originalHandleInput = match.handleInput.bind(match);
  match.handleInput = (playerId, input = {}, now = Date.now()) => {
    const result = originalHandleInput(playerId, input, now);
    if (!input || typeof input !== "object") return result;

    // Crouch / cover toggle: explicit crouchPressed OR Circle/KeyC (posePressed) when grounded
    if (input.crouchPressed) {
      toggleCrouch(playerId, now);
    } else if (input.posePressed && canCrouch(playerId)) {
      toggleCrouch(playerId, now);
    }

    if (input.squadOrder) {
      issueSquadOrder(playerId, input.squadOrder, now);
    }

    if (input.inventoryAction) {
      handleInventoryAction(playerId, input.inventoryAction, now);
    }

    return result;
  };

  const originalStep = match.step.bind(match);
  match.step = (dt, now = Date.now()) => {
    const result = originalStep(dt, now);
    for (const [entityId, state] of stances.entries()) {
      if (!state.crouching) continue;
      if (!canCrouch(entityId)) {
        setCrouch(entityId, false, { now, silent: true, reason: "invalid-state" });
        continue;
      }
      if (now - (state.lastCoverCheckAt ?? 0) >= COVER_REFRESH_INTERVAL_MS) {
        const transform = ctx.components.get(entityId, "Transform");
        if (!transform) continue;
        const cover = coverAt(transform);
        const changed = Boolean(state.inCover) !== Boolean(cover.active) || state.coverKind !== (cover.kind ?? null);
        state.inCover = Boolean(cover.active);
        state.coverKind = cover.active ? cover.kind : null;
        state.coverLabel = cover.active ? cover.label : null;
        state.coverX = cover.active ? cover.coverX : null;
        state.coverZ = cover.active ? cover.coverZ : null;
        state.lastCoverCheckAt = now;
        syncTransformStance(entityId, state);
        if (changed && !entities.get(entityId)?.bot) {
          ctx.events.emit("tactics:stance-changed", {
            entityId,
            crouching: true,
            inCover: state.inCover,
            coverKind: state.coverKind,
            coverLabel: state.coverLabel,
            reason: "cover-refresh",
            now,
          });
        }
      }
    }
    return result;
  };

  function decorateEntitySnapshot(entity) {
    if (!entity?.id) return entity;
    const stance = stanceFor(entity.id);
    const order = squadOrderFor(entity.id);
    return {
      ...entity,
      crouching: stance.crouching,
      inCover: stance.inCover,
      coverKind: stance.coverKind,
      coverLabel: stance.coverLabel,
      squadOrder: order ? { type: order.type, label: order.label } : null,
    };
  }

  const originalSnapshot = match.snapshot.bind(match);
  match.snapshot = (now = Date.now()) => {
    const snap = originalSnapshot(now);
    if (Array.isArray(snap?.entities)) {
      snap.entities = snap.entities.map(decorateEntitySnapshot);
    }
    return snap;
  };

  const originalSnapshotFor = match.snapshotFor.bind(match);
  match.snapshotFor = (playerId, now = Date.now()) => {
    const snap = originalSnapshotFor(playerId, now);
    if (!snap) return snap;
    if (Array.isArray(snap.entities)) {
      snap.entities = snap.entities.map(decorateEntitySnapshot);
    }
    if (snap.self) {
      const stance = stanceFor(playerId);
      snap.self = {
        ...snap.self,
        crouching: stance.crouching,
        inCover: stance.inCover,
        coverKind: stance.coverKind,
        coverLabel: stance.coverLabel,
      };
    }
    snap.squadMenu = {
      inventory: inventorySnapshotFor(playerId),
      squadmates: aliveSquadmatesOf(playerId),
      moneyTransferAllowed: false,
    };
    return snap;
  };

  if (typeof match.eventsForPlayer === "function") {
    const originalEventsForPlayer = match.eventsForPlayer.bind(match);
    match.eventsForPlayer = (playerId, packets = []) => {
      const base = originalEventsForPlayer(playerId, packets);
      const existing = new Set(base);
      const extra = [];
      for (const packet of packets) {
        if (existing.has(packet)) continue;
        const name = packet?.event;
        const payload = packet?.payload ?? {};
        if (
          name === "tactics:stance-changed"
          || name === "inventory:dropped"
          || name === "inventory:transferred"
          || name === "inventory:failed"
        ) {
          if (payload.entityId === playerId) extra.push(packet);
        } else if (name === "tactics:squad-order") {
          if (payload.leaderId === playerId) extra.push(packet);
        } else if (name === "tactics:cover-blocked") {
          if (payload.targetId === playerId || payload.shooterId === playerId) extra.push(packet);
        }
      }
      return extra.length ? [...base, ...extra] : base;
    };
  }

  ctx.services.provide("tactics-inventory", {
    setCrouch,
    toggleCrouch,
    stanceFor,
    coverAt,
    findCoverPoint,
    issueSquadOrder,
    squadOrderFor,
    handleInventoryAction,
    inventorySnapshotFor,
    aliveSquadmatesOf,
  });
}
