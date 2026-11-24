import { TURBO_HEALTH_TARGET, TURBO_PURCHASE_LIMIT } from "../battle-royale-injury/stimulants.js";

export const BUYBACK_COST = 1500;
export const FAST_STIM_COST = 900;
export const TURBO_STIM_COST = 1800;
export const ARMOR_PLATES_COST = 600;
export const MARKSMAN_COST = 700;
export const SNIPER_COST = 1100;
export const JUGGERNAUT_DROP_COST = 2200;
export const MINES_COST = 450;
export const MINI_NUKE_COST = 2500;
export const ELECTRO_DROP_COST = 3000;
export const KILL_CASH_REWARD = 300;
export const AIRDROP_CASH_REWARD = 1800;
export const JUGGERNAUT_CASH_REWARD = 2500;
export const BOUNTY_CASH_REWARD = 1000;
export const SHOP_INTERACTION_RANGE = 4.2;
export const SHOP_PROMPT_COOLDOWN_MS = 8_500;
export const REDEPLOY_ALTITUDE = 240;

export const SHOP_STATIONS = Object.freeze([
  { id: "shop-center", name: "Центральный магазин", x: 0, y: 0, z: -26 },
  { id: "shop-warehouse", name: "Магазин у склада", x: 82, y: 0, z: 0 },
  { id: "shop-two-storey", name: "Магазин у двухэтажного дома", x: 118, y: 0, z: 120 },
  { id: "shop-loot-house", name: "Магазин у дома с припасами", x: -158, y: 0, z: 95 },
  { id: "shop-forest-hut", name: "Магазин у домика лесника", x: -96, y: 0, z: -75 },
  { id: "shop-residence", name: "Магазин у Резиденции", x: 115, y: 0, z: -164 },
]);

export const manifest = {
  id: "battle-royale-shop",
  version: "1.1.0",
  requires: [
    "entities",
    "teams",
    "health",
    "weapons",
    "movement",
    "map-test-arena",
    "battle-royale",
    "battle-royale-parachute",
    "battle-royale-injury",
    "battle-royale-injury-integration",
    "battle-royale-navigation",
    "match-api",
  ],
  optional: [
    "armor",
    "battle-royale-vehicle-fleet",
    "battle-royale-bot-parachute",
    "battle-royale-tutorial",
    "battle-royale-crate-generator",
  ],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on", "events.emit"],
};

function finite(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const ch of String(value ?? "")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function distance3(a, b) {
  return Math.hypot(
    finite(a?.x) - finite(b?.x),
    finite(a?.y) - finite(b?.y),
    finite(a?.z) - finite(b?.z),
  );
}

export function crateCashAmount(crateId) {
  const hash = stableHash(crateId || "crate");
  return 800 + (hash % 5) * 100;
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const health = ctx.services.get("health");
  const weapons = ctx.services.get("weapons");
  const movement = ctx.services.get("movement");
  const map = ctx.services.get("map");
  const battleRoyale = ctx.services.get("battle-royale");
  const parachute = ctx.services.get("parachute");
  const injury = ctx.services.get("injury");
  const stimulants = ctx.services.get("stimulants");
  const navigation = ctx.services.get("navigation");
  const matchApi = ctx.services.get("match-api");
  const armor = ctx.services.has("armor") ? ctx.services.get("armor") : null;
  const vehicles = ctx.services.has("vehicles") ? ctx.services.get("vehicles") : null;
  const botParachutes = ctx.services.has("bot-parachutes") ? ctx.services.get("bot-parachutes") : null;
  const tutorial = ctx.services.has("battle-royale-tutorial") ? ctx.services.get("battle-royale-tutorial") : null;
  const getCrateGenerator = () => (ctx.services.has("crate-generator") ? ctx.services.get("crate-generator") : null);
  const getSpecialOps = () => (ctx.services.has("special-ops") ? ctx.services.get("special-ops") : null);

  const balances = new Map();
  const proximityPrompts = new Map();
  const activeBounties = new Map();

  const balanceOf = (entityId) => Math.max(0, Math.floor(balances.get(entityId) ?? 0));

  function nearestEnemyTargetFor(playerId) {
    const selfTransform = ctx.components.get(playerId, "Transform");
    if (!selfTransform) return null;
    const ownTeam = Number(teams.teamOf(playerId)) || 0;
    let best = null;
    let bestDist = Infinity;
    for (const candidate of entities.all()) {
      if (!candidate?.alive || candidate.id === playerId) continue;
      const candidateTeam = Number(teams.teamOf(candidate.id)) || 0;
      if (ownTeam > 0 && candidateTeam === ownTeam) continue;
      const ct = ctx.components.get(candidate.id, "Transform");
      if (!ct) continue;
      const dist = distance3(selfTransform, ct);
      if (dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }
    return best;
  }

  function resolveBountyTarget(playerId) {
    const entry = activeBounties.get(playerId);
    if (!entry) return null;
    const target = entities.get(entry.targetId);
    if (!target?.alive) {
      activeBounties.delete(playerId);
      return null;
    }
    return target;
  }

  function grantCash(entityId, amount, reason = "loot", extra = {}) {
    const entity = entities.get(entityId);
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (!entity || delta <= 0) return 0;
    const next = balanceOf(entityId) + delta;
    balances.set(entityId, next);
    ctx.events.emit("shop:cash-gained", {
      entityId,
      amount: delta,
      balance: next,
      reason,
      ...extra,
    });
    return delta;
  }

  function spendCash(entityId, amount) {
    const cost = Math.max(0, Math.floor(Number(amount) || 0));
    const current = balanceOf(entityId);
    if (cost <= 0 || current < cost) return false;
    balances.set(entityId, current - cost);
    return true;
  }

  function shopsList() {
    return SHOP_STATIONS.map((shop) => ({ ...shop }));
  }

  function nearestShop(position, maxDistance = Infinity) {
    if (!position) return null;
    let best = null;
    let bestDist = Infinity;
    for (const shop of SHOP_STATIONS) {
      const dist = distance3(position, shop);
      if (dist <= maxDistance && dist < bestDist) {
        best = shop;
        bestDist = dist;
      }
    }
    return best ? { shop: best, distance: bestDist } : null;
  }

  function deadTeammatesFor(entityId) {
    const self = entities.get(entityId);
    if (!self) return [];
    const ownTeam = Number(teams.teamOf(entityId)) || 0;
    const ownSquad = self.squadId ?? null;
    if (ownTeam <= 0 && !ownSquad) return [];
    const dead = [];
    for (const candidate of entities.all()) {
      if (!candidate || candidate.id === entityId || candidate.alive) continue;
      const sameTeam = ownTeam > 0 && (Number(teams.teamOf(candidate.id)) || 0) === ownTeam;
      const sameSquad = Boolean(ownSquad && candidate.squadId === ownSquad);
      if (!sameTeam && !sameSquad) continue;
      dead.push(candidate);
    }
    dead.sort((a, b) => Number(Boolean(a.bot)) - Number(Boolean(b.bot)));
    return dead;
  }

  function safeDropCoordinates(shop) {
    const zoneRadius = Math.max(18, Number(battleRoyale.zoneRadiusAt?.()) || 400);
    const safeLimit = Math.max(10, zoneRadius * 0.72);
    let x = finite(shop?.x);
    let z = finite(shop?.z);
    const dist = Math.hypot(x, z);
    if (dist > safeLimit && dist > 0.01) {
      const scale = safeLimit / dist;
      x *= scale;
      z *= scale;
    }
    return { x, z };
  }

  function redeployTeammate(buyerId, targetId, shop, now = Date.now()) {
    const buyer = entities.get(buyerId);
    const target = entities.get(targetId);
    if (!buyer?.alive || !target || target.alive) return false;
    const drop = safeDropCoordinates(shop);

    ctx.events.emit("respawn:before", { entityId: target.id, now, reason: "buyback" });

    const hp = ctx.components.get(target.id, "Health");
    if (hp) {
      hp.maximum = 200;
      hp.current = 200;
    }
    const armorComp = ctx.components.get(target.id, "Armor");
    if (armorComp) {
      armorComp.current = Math.min(armorComp.maximum, 100);
      armorComp.reserve = Math.max(armorComp.reserve, 2);
    }
    weapons.grant(target.id, "pistol");
    weapons.restock?.(target.id, "pistol", 45);
    if (target.bot) {
      const inv = ctx.components.get(target.id, "Weapons");
      const slot = inv?.items?.findIndex((item) => item.id === "rifle") ?? -1;
      if (slot >= 0) weapons.select(target.id, slot);
    }

    entities.setAlive(target.id, true);
    battleRoyale.redeploy?.(target.id, now);
    movement.setInput(target.id, {});
    ctx.events.emit("entity:respawned", { entityId: target.id, now, reason: "buyback" });

    let launched = false;
    if (target.bot && !botParachutes?.redeploy) {
      movement.teleport(target.id, { x: drop.x, y: 0, z: drop.z, angle: 0 });
    } else if (target.bot && botParachutes?.redeploy) {
      const assignment = botParachutes.redeploy(
        target.id,
        { x: shop.x, z: shop.z, kind: "redeploy" },
        { x: drop.x, y: REDEPLOY_ALTITUDE, z: drop.z },
        now,
      );
      launched = Boolean(assignment && assignment.status !== "launch-failed");
    } else {
      const launchedState = parachute.launch(
        target.id,
        { x: drop.x, z: drop.z, altitude: REDEPLOY_ALTITUDE },
        now,
      );
      launched = Boolean(launchedState);
    }

    if (launched) {
      ctx.events.emit("health:changed", {
        entityId: target.id,
        health: hp?.current ?? 200,
        maximum: hp?.maximum ?? 200,
      });
    }

    const payload = {
      buyerId: buyer.id,
      buyerName: buyer.name ?? "Напарник",
      targetId: target.id,
      targetName: target.name ?? "Напарник",
      teamId: Number(teams.teamOf(buyer.id)) || 0,
      shopId: shop.id,
      shopName: shop.name,
      cost: BUYBACK_COST,
      balance: balanceOf(buyer.id),
      x: drop.x,
      y: REDEPLOY_ALTITUDE,
      z: drop.z,
      now,
    };
    ctx.events.emit("shop:teammate-bought-back", payload);
    return true;
  }

  function buy(buyerId, request = {}, now = Date.now()) {
    const buyer = entities.get(buyerId);
    const transform = ctx.components.get(buyerId, "Transform");
    if (!buyer?.alive || !transform || injury.isDowned(buyerId)) {
      return { ok: false, reason: "unavailable" };
    }
    if (
      vehicles?.isDriving?.(buyerId)
      || vehicles?.isPassenger?.(buyerId)
      || parachute.stateFor(buyerId)?.airborne
    ) {
      return { ok: false, reason: "busy" };
    }

    let shop = request.shopId
      ? SHOP_STATIONS.find((entry) => entry.id === request.shopId) ?? null
      : null;
    if (shop) {
      if (distance3(transform, shop) > SHOP_INTERACTION_RANGE + 1.4) {
        shop = null;
      }
    } else {
      shop = nearestShop(transform, SHOP_INTERACTION_RANGE + 1.4)?.shop ?? null;
    }
    if (!shop) {
      ctx.events.emit("shop:purchase-failed", {
        entityId: buyerId,
        itemId: request.itemId ?? null,
        reason: "too-far",
        now,
      });
      return { ok: false, reason: "too-far" };
    }

    const itemId = String(request.itemId ?? "").trim();
    const cash = balanceOf(buyerId);

    if (itemId === "buyback") {
      const deadMates = deadTeammatesFor(buyerId);
      const target = request.targetId
        ? deadMates.find((m) => m.id === request.targetId) ?? null
        : deadMates[0] ?? null;
      if (!target) {
        ctx.events.emit("shop:purchase-failed", { entityId: buyerId, itemId, reason: "no-dead-teammate", now });
        return { ok: false, reason: "no-dead-teammate" };
      }
      if (cash < BUYBACK_COST) {
        ctx.events.emit("shop:purchase-failed", {
          entityId: buyerId,
          itemId,
          reason: "insufficient-funds",
          required: BUYBACK_COST,
          balance: cash,
          now,
        });
        return { ok: false, reason: "insufficient-funds", required: BUYBACK_COST, balance: cash };
      }
      if (!spendCash(buyerId, BUYBACK_COST)) return { ok: false, reason: "insufficient-funds" };
      redeployTeammate(buyerId, target.id, shop, now);
      ctx.events.emit("shop:purchased", {
        entityId: buyerId,
        itemId,
        itemName: `Выкуп напарника (${target.name ?? target.id})`,
        targetId: target.id,
        targetName: target.name ?? null,
        cost: BUYBACK_COST,
        balance: balanceOf(buyerId),
        shopId: shop.id,
        shopName: shop.name,
        now,
      });
      return { ok: true, itemId, targetId: target.id, balance: balanceOf(buyerId) };
    }

    if (itemId === "fast-stimulant") {
      if (cash < FAST_STIM_COST) {
        ctx.events.emit("shop:purchase-failed", {
          entityId: buyerId,
          itemId,
          reason: "insufficient-funds",
          required: FAST_STIM_COST,
          balance: cash,
          now,
        });
        return { ok: false, reason: "insufficient-funds" };
      }
      const added = stimulants.grantFast?.(buyerId, 1) ?? 0;
      if (!added) {
        ctx.events.emit("shop:purchase-failed", { entityId: buyerId, itemId, reason: "capacity-full", now });
        return { ok: false, reason: "capacity-full" };
      }
      spendCash(buyerId, FAST_STIM_COST);
      ctx.events.emit("shop:purchased", {
        entityId: buyerId,
        itemId,
        itemName: "Усиленный стимулятор (1 сек)",
        cost: FAST_STIM_COST,
        balance: balanceOf(buyerId),
        fastStimulants: stimulants.fastCount?.(buyerId) ?? 0,
        shopId: shop.id,
        shopName: shop.name,
        now,
      });
      return { ok: true, itemId, balance: balanceOf(buyerId) };
    }

    if (itemId === "turbo-stimulant") {
      const purchased = stimulants.turboPurchasedCount?.(buyerId) ?? 0;
      if (purchased >= TURBO_PURCHASE_LIMIT) {
        ctx.events.emit("shop:purchase-failed", {
          entityId: buyerId,
          itemId,
          reason: "limit-reached",
          limit: TURBO_PURCHASE_LIMIT,
          now,
        });
        return { ok: false, reason: "limit-reached" };
      }
      if (cash < TURBO_STIM_COST) {
        ctx.events.emit("shop:purchase-failed", {
          entityId: buyerId,
          itemId,
          reason: "insufficient-funds",
          required: TURBO_STIM_COST,
          balance: cash,
          now,
        });
        return { ok: false, reason: "insufficient-funds" };
      }
      const added = stimulants.grantTurbo?.(buyerId, 1) ?? 0;
      if (!added) {
        ctx.events.emit("shop:purchase-failed", { entityId: buyerId, itemId, reason: "capacity-full", now });
        return { ok: false, reason: "capacity-full" };
      }
      spendCash(buyerId, TURBO_STIM_COST);
      ctx.events.emit("shop:purchased", {
        entityId: buyerId,
        itemId,
        itemName: `Усиленный стимулятор турбо (${TURBO_HEALTH_TARGET} HP)`,
        cost: TURBO_STIM_COST,
        balance: balanceOf(buyerId),
        turboStimulants: stimulants.turboCount?.(buyerId) ?? 0,
        turboPurchasedCount: stimulants.turboPurchasedCount?.(buyerId) ?? purchased + 1,
        turboPurchaseLimit: TURBO_PURCHASE_LIMIT,
        shopId: shop.id,
        shopName: shop.name,
        now,
      });
      return { ok: true, itemId, balance: balanceOf(buyerId) };
    }

    if (itemId === "armor-plates") {
      if (cash < ARMOR_PLATES_COST) {
        ctx.events.emit("shop:purchase-failed", {
          entityId: buyerId,
          itemId,
          reason: "insufficient-funds",
          required: ARMOR_PLATES_COST,
          balance: cash,
          now,
        });
        return { ok: false, reason: "insufficient-funds" };
      }
      const added = armor?.grantPlates?.(buyerId, 3) ?? 0;
      if (!added) {
        ctx.events.emit("shop:purchase-failed", { entityId: buyerId, itemId, reason: "capacity-full", now });
        return { ok: false, reason: "capacity-full" };
      }
      spendCash(buyerId, ARMOR_PLATES_COST);
      ctx.events.emit("shop:purchased", {
        entityId: buyerId,
        itemId,
        itemName: "Комплект бронепластин",
        cost: ARMOR_PLATES_COST,
        balance: balanceOf(buyerId),
        shopId: shop.id,
        shopName: shop.name,
        now,
      });
      return { ok: true, itemId, balance: balanceOf(buyerId) };
    }

    if (itemId === "marksman" || itemId === "sniper") {
      const cost = itemId === "sniper" ? SNIPER_COST : MARKSMAN_COST;
      const baseTitle = itemId === "sniper" ? "Снайперка" : "Винтовка";
      const ammoTitle = itemId === "sniper" ? "Патроны для снайперки (+10)" : "Патроны для винтовки (+24)";
      const restockAmount = itemId === "sniper" ? 10 : 24;
      if (cash < cost) {
        ctx.events.emit("shop:purchase-failed", {
          entityId: buyerId,
          itemId,
          reason: "insufficient-funds",
          required: cost,
          balance: cash,
          now,
        });
        return { ok: false, reason: "insufficient-funds", required: cost, balance: cash };
      }
      const alreadyOwned = weapons.has?.(buyerId, itemId);
      let grantedOrRestocked = false;
      if (!alreadyOwned) {
        grantedOrRestocked = Boolean(weapons.grant?.(buyerId, itemId));
      } else {
        grantedOrRestocked = (weapons.restock?.(buyerId, itemId, restockAmount) ?? 0) > 0;
      }
      if (!grantedOrRestocked) {
        ctx.events.emit("shop:purchase-failed", { entityId: buyerId, itemId, reason: "capacity-full", now });
        return { ok: false, reason: "capacity-full" };
      }
      spendCash(buyerId, cost);
      ctx.events.emit("shop:purchased", {
        entityId: buyerId,
        itemId,
        itemName: alreadyOwned ? ammoTitle : baseTitle,
        cost,
        balance: balanceOf(buyerId),
        shopId: shop.id,
        shopName: shop.name,
        now,
      });
      return { ok: true, itemId, balance: balanceOf(buyerId) };
    }

    if (itemId === "bounty-contract") {
      const target = nearestEnemyTargetFor(buyerId);
      if (!target) {
        ctx.events.emit("shop:purchase-failed", { entityId: buyerId, itemId, reason: "no-bounty-target", now });
        return { ok: false, reason: "no-bounty-target" };
      }
      const targetName = target.name ?? "Вражеский боец";
      activeBounties.set(buyerId, {
        targetId: target.id,
        targetName,
        startedAt: now,
      });
      ctx.events.emit("shop:purchased", {
        entityId: buyerId,
        itemId,
        itemName: `Контракт «Охота за головами» (${targetName})`,
        targetId: target.id,
        targetName,
        cost: 0,
        balance: balanceOf(buyerId),
        shopId: shop.id,
        shopName: shop.name,
        now,
      });
      return { ok: true, itemId, targetId: target.id, balance: balanceOf(buyerId) };
    }

    if (itemId === "juggernaut-drop") {
      if (cash < JUGGERNAUT_DROP_COST) {
        ctx.events.emit("shop:purchase-failed", {
          entityId: buyerId,
          itemId,
          reason: "insufficient-funds",
          required: JUGGERNAUT_DROP_COST,
          balance: cash,
          now,
        });
        return { ok: false, reason: "insufficient-funds", required: JUGGERNAUT_DROP_COST, balance: cash };
      }
      const crateGenerator = getCrateGenerator();
      if (!crateGenerator?.spawnJuggernautDrop) {
        ctx.events.emit("shop:purchase-failed", { entityId: buyerId, itemId, reason: "unavailable", now });
        return { ok: false, reason: "unavailable" };
      }
      spendCash(buyerId, JUGGERNAUT_DROP_COST);
      const dropX = finite(shop.x) + (finite(transform.x) >= finite(shop.x) ? 14 : -14);
      const dropZ = finite(shop.z) + (finite(transform.z) >= finite(shop.z) ? 14 : -14);
      const crate = crateGenerator.spawnJuggernautDrop({
        x: dropX,
        z: dropZ,
        nearEntityId: buyerId,
        now,
        reason: "shop-purchase",
      });
      ctx.events.emit("shop:purchased", {
        entityId: buyerId,
        itemId,
        itemName: "Сброс груза «Джаггернаут»",
        crateId: crate?.id ?? null,
        cost: JUGGERNAUT_DROP_COST,
        balance: balanceOf(buyerId),
        shopId: shop.id,
        shopName: shop.name,
        x: crate?.x ?? dropX,
        z: crate?.z ?? dropZ,
        now,
      });
      return { ok: true, itemId, crateId: crate?.id ?? null, balance: balanceOf(buyerId) };
    }

    if (itemId === "mines") {
      if (cash < MINES_COST) {
        ctx.events.emit("shop:purchase-failed", {
          entityId: buyerId,
          itemId,
          reason: "insufficient-funds",
          required: MINES_COST,
          balance: cash,
          now,
        });
        return { ok: false, reason: "insufficient-funds", required: MINES_COST, balance: cash };
      }
      const specialOps = getSpecialOps();
      const added = specialOps?.grantMines?.(buyerId, 2) ?? 0;
      if (!added) {
        ctx.events.emit("shop:purchase-failed", { entityId: buyerId, itemId, reason: "capacity-full", now });
        return { ok: false, reason: "capacity-full" };
      }
      spendCash(buyerId, MINES_COST);
      ctx.events.emit("shop:purchased", {
        entityId: buyerId,
        itemId,
        itemName: `Мины (+${added} шт.)`,
        cost: MINES_COST,
        balance: balanceOf(buyerId),
        mines: specialOps?.mineCountOf?.(buyerId) ?? 0,
        shopId: shop.id,
        shopName: shop.name,
        now,
      });
      return { ok: true, itemId, added, balance: balanceOf(buyerId) };
    }

    if (itemId === "mini-nuke") {
      if (cash < MINI_NUKE_COST) {
        ctx.events.emit("shop:purchase-failed", {
          entityId: buyerId,
          itemId,
          reason: "insufficient-funds",
          required: MINI_NUKE_COST,
          balance: cash,
          now,
        });
        return { ok: false, reason: "insufficient-funds", required: MINI_NUKE_COST, balance: cash };
      }
      const specialOps = getSpecialOps();
      const added = specialOps?.grantNuke?.(buyerId, 1000) ?? 0;
      if (!added) {
        ctx.events.emit("shop:purchase-failed", { entityId: buyerId, itemId, reason: "capacity-full", now });
        return { ok: false, reason: "capacity-full" };
      }
      spendCash(buyerId, MINI_NUKE_COST);
      ctx.events.emit("shop:purchased", {
        entityId: buyerId,
        itemId,
        itemName: `Мини-ядерка (+${added} ударов)`,
        cost: MINI_NUKE_COST,
        balance: balanceOf(buyerId),
        miniNukes: specialOps?.nukeCountOf?.(buyerId) ?? 0,
        shopId: shop.id,
        shopName: shop.name,
        now,
      });
      return { ok: true, itemId, added, balance: balanceOf(buyerId) };
    }

    if (itemId === "electro-drop") {
      if (cash < ELECTRO_DROP_COST) {
        ctx.events.emit("shop:purchase-failed", {
          entityId: buyerId,
          itemId,
          reason: "insufficient-funds",
          required: ELECTRO_DROP_COST,
          balance: cash,
          now,
        });
        return { ok: false, reason: "insufficient-funds", required: ELECTRO_DROP_COST, balance: cash };
      }
      const crateGenerator = getCrateGenerator();
      if (!crateGenerator?.spawnElectroLukashenkoDrop) {
        ctx.events.emit("shop:purchase-failed", { entityId: buyerId, itemId, reason: "unavailable", now });
        return { ok: false, reason: "unavailable" };
      }
      spendCash(buyerId, ELECTRO_DROP_COST);
      const dropX = finite(shop.x) + (finite(transform.x) >= finite(shop.x) ? 14 : -14);
      const dropZ = finite(shop.z) + (finite(transform.z) >= finite(shop.z) ? 14 : -14);
      const crate = crateGenerator.spawnElectroLukashenkoDrop({
        x: dropX,
        z: dropZ,
        nearEntityId: buyerId,
        now,
        reason: "shop-purchase",
      });
      ctx.events.emit("shop:purchased", {
        entityId: buyerId,
        itemId,
        itemName: "Сброс груза «Электрический Лукашенко»",
        crateId: crate?.id ?? null,
        cost: ELECTRO_DROP_COST,
        balance: balanceOf(buyerId),
        shopId: shop.id,
        shopName: shop.name,
        x: crate?.x ?? dropX,
        z: crate?.z ?? dropZ,
        now,
      });
      return { ok: true, itemId, crateId: crate?.id ?? null, balance: balanceOf(buyerId) };
    }

    return { ok: false, reason: "unknown-item" };
  }

  function describeFor(playerId) {
    const transform = ctx.components.get(playerId, "Transform");
    const near = transform ? nearestShop(transform, SHOP_INTERACTION_RANGE) : null;
    const cash = balanceOf(playerId);
    const deadMates = deadTeammatesFor(playerId).map((m) => ({
      id: m.id,
      name: m.name ?? "Напарник",
      bot: Boolean(m.bot),
    }));
    const stimInfo = stimulants.describe?.(playerId) ?? {};
    const turboPurchased = Number(stimInfo.turboPurchasedCount) || 0;
    const turboRemaining = Math.max(0, TURBO_PURCHASE_LIMIT - turboPurchased);
    const bountyTarget = resolveBountyTarget(playerId);
    const bountyTransform = bountyTarget ? ctx.components.get(bountyTarget.id, "Transform") : null;
    return {
      cash,
      nearbyShop: near ? {
        id: near.shop.id,
        name: near.shop.name,
        distance: Number(near.distance.toFixed(2)),
      } : null,
      deadTeammates: deadMates,
      activeBounty: bountyTarget && bountyTransform ? {
        targetId: bountyTarget.id,
        targetName: bountyTarget.name ?? "Вражеский боец",
        distance: transform ? Math.round(distance3(transform, bountyTransform)) : 0,
      } : null,
      marksmanOwned: Boolean(weapons.has?.(playerId, "marksman")),
      sniperOwned: Boolean(weapons.has?.(playerId, "sniper")),
      prices: {
        buyback: BUYBACK_COST,
        fastStimulant: FAST_STIM_COST,
        turboStimulant: TURBO_STIM_COST,
        armorPlates: ARMOR_PLATES_COST,
        marksman: MARKSMAN_COST,
        sniper: SNIPER_COST,
        juggernautDrop: JUGGERNAUT_DROP_COST,
        mines: MINES_COST,
        miniNuke: MINI_NUKE_COST,
        electroDrop: ELECTRO_DROP_COST,
        bountyContract: 0,
      },
      turboPurchasedCount: turboPurchased,
      turboRemainingPurchases: turboRemaining,
      turboPurchaseLimit: TURBO_PURCHASE_LIMIT,
      turboHealthTarget: TURBO_HEALTH_TARGET,
    };
  }

  function closerWorldObjectBlockingShop(playerId, transform, shopDistance) {
    if (!transform) return false;
    const nearDowned = injury.nearestDownedTeammate?.(playerId, 2.5);
    if (nearDowned && nearDowned.distance <= shopDistance) return true;
    for (const door of map.doors ?? []) {
      if (!door) continue;
      if (Math.abs((transform.y ?? 0) - (door.y ?? 0)) <= 2.0 && distance2(transform, door) <= 2.2) {
        return true;
      }
    }
    for (const crate of map.crates ?? []) {
      if (!crate || crate.opened) continue;
      if (Math.abs((transform.y ?? 0) - (crate.y ?? 0)) <= 2.0 && distance2(transform, crate) <= 2.2) {
        return true;
      }
    }
    return false;
  }

  navigation.registerProvider?.("shops", (playerId) => {
    if (tutorial) return [];
    const zoneRadius = Math.max(10, Number(battleRoyale.zoneRadiusAt?.()) || 1450);
    const entries = SHOP_STATIONS.map((shop, idx) => ({
      id: `shop:${shop.id}`,
      name: shop.name,
      kind: "shop",
      order: 6 + idx * 0.01,
      arriveDistance: 3.2,
      position: { x: shop.x, y: shop.y, z: shop.z },
      metadata: {
        shopId: shop.id,
        outsideSafeZone: Math.hypot(shop.x, shop.z) > zoneRadius,
      },
    }));
    const bountyTarget = resolveBountyTarget(playerId);
    const bt = bountyTarget ? ctx.components.get(bountyTarget.id, "Transform") : null;
    if (bountyTarget && bt) {
      entries.unshift({
        id: `bounty:${bountyTarget.id}`,
        name: `Цель охоты (${bountyTarget.name ?? "Вражеский боец"})`,
        kind: "bounty",
        order: 3.5,
        arriveDistance: 8,
        position: { x: finite(bt.x), y: finite(bt.y), z: finite(bt.z) },
        metadata: {
          bounty: true,
          targetId: bountyTarget.id,
          outsideSafeZone: Math.hypot(finite(bt.x), finite(bt.z)) > zoneRadius,
          verticalTolerance: 6,
        },
      });
    }
    return entries;
  });

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    const entity = entities.get(entityId);
    const kind = String(spec?.kind ?? entity?.kind ?? "");
    if (!entity?.bot && kind !== "human" && kind !== "bot") return;
    balances.set(entityId, Math.max(0, Math.floor(Number(spec?.cash) || 0)));
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    balances.delete(entityId);
    proximityPrompts.delete(entityId);
    activeBounties.delete(entityId);
  });

  ctx.events.on("loot:opened", (payload = {}) => {
    const entityId = payload.entityId;
    if (!entityId) return;
    if (payload.loot === "juggernaut" || payload.loot === "electro-lukashenko") {
      stimulants.grantJuggernautStims?.(entityId);
      grantCash(entityId, JUGGERNAUT_CASH_REWARD, payload.loot, {
        crateId: payload.crateId ?? null,
        x: payload.x ?? 0,
        y: payload.y ?? 0,
        z: payload.z ?? 0,
      });
      return;
    }
    if (payload.loot === "airdrop") {
      stimulants.grantFast?.(entityId, 1);
      stimulants.grantTurbo?.(entityId, 1);
      grantCash(entityId, AIRDROP_CASH_REWARD, "airdrop", {
        crateId: payload.crateId ?? null,
        x: payload.x ?? 0,
        y: payload.y ?? 0,
        z: payload.z ?? 0,
      });
      return;
    }
    const cashAwarded = crateCashAmount(payload.crateId);
    grantCash(entityId, cashAwarded, "crate", {
      crateId: payload.crateId ?? null,
      x: payload.x ?? 0,
      y: payload.y ?? 0,
      z: payload.z ?? 0,
    });
  });

  function completeBountyForTarget(targetId) {
    if (!targetId) return;
    for (const [holderId, bounty] of [...activeBounties.entries()]) {
      if (bounty.targetId === targetId) {
        activeBounties.delete(holderId);
        grantCash(holderId, BOUNTY_CASH_REWARD, "bounty", {
          victimId: targetId,
          targetName: bounty.targetName,
        });
      }
    }
  }

  ctx.events.on("injury:downed", ({ entityId }) => {
    completeBountyForTarget(entityId);
  });

  ctx.events.on("entity:died", ({ entityId, killerId }) => {
    completeBountyForTarget(entityId);
    if (!killerId || killerId === entityId) return;
    const entityTeam = Number(teams.teamOf(entityId)) || 0;
    const killerTeam = Number(teams.teamOf(killerId)) || 0;
    if (entityTeam > 0 && killerTeam === entityTeam) return;
    grantCash(killerId, KILL_CASH_REWARD, "elimination", { victimId: entityId });
    const killerEntity = entities.get(killerId);
    if (killerEntity?.bot && killerTeam > 0) {
      for (const mate of entities.all()) {
        if (!mate || mate.id === killerId || mate.bot || mate.kind !== "human") continue;
        if ((Number(teams.teamOf(mate.id)) || 0) !== killerTeam) continue;
        grantCash(mate.id, KILL_CASH_REWARD, "squad-elimination", {
          victimId: entityId,
          killerId,
          killerName: killerEntity.name ?? "Напарник",
          teamId: killerTeam,
        });
        const victimEntity = entities.get(entityId);
        ctx.events.emit("feedback:sound", {
          recipientId: mate.id,
          key: "enemy.killed",
          squadKill: true,
          killerId,
          killerName: killerEntity.name ?? "Напарник",
          victimId: entityId,
          targetId: entityId,
          targetName: victimEntity?.name ?? null,
          targetIsHuman: Boolean(victimEntity && !victimEntity.bot && victimEntity.kind === "human"),
          targetElectro: Boolean(victimEntity?.electroLukashenko),
        });
      }
    }
  });

  function checkHumanProximity(now) {
    if (tutorial) return;
    for (const entity of entities.all()) {
      if (!entity?.alive || entity.bot || entity.kind !== "human") continue;
      if (injury.isDowned(entity.id) || vehicles?.isDriving?.(entity.id) || vehicles?.isPassenger?.(entity.id)) continue;
      const transform = ctx.components.get(entity.id, "Transform");
      const near = transform ? nearestShop(transform, SHOP_INTERACTION_RANGE) : null;
      if (!near) {
        const prev = proximityPrompts.get(entity.id);
        if (prev && (!transform || !nearestShop(transform, SHOP_INTERACTION_RANGE + 1.2))) {
          proximityPrompts.delete(entity.id);
        }
        continue;
      }
      const prev = proximityPrompts.get(entity.id);
      if (!prev || prev.shopId !== near.shop.id || now - prev.announcedAt >= SHOP_PROMPT_COOLDOWN_MS) {
        proximityPrompts.set(entity.id, { shopId: near.shop.id, announcedAt: now });
        ctx.events.emit("shop:nearby", {
          entityId: entity.id,
          shopId: near.shop.id,
          shopName: near.shop.name,
          distance: Number(near.distance.toFixed(2)),
          cash: balanceOf(entity.id),
          now,
        });
      }
    }
  }

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (input?.shopBuy && battleRoyale.canAct(now)) {
      buy(playerId, input.shopBuy, now);
    }

    if (
      battleRoyale.canAct(now)
      && (input.interactPressed || input.shopOpenPressed)
      && !tutorial
      && !vehicles?.isDriving?.(playerId)
      && !vehicles?.isPassenger?.(playerId)
      && !injury.isDowned(playerId)
    ) {
      const transform = ctx.components.get(playerId, "Transform");
      const near = transform ? nearestShop(transform, SHOP_INTERACTION_RANGE) : null;
      if (near && (input.shopOpenPressed || !closerWorldObjectBlockingShop(playerId, transform, near.distance))) {
        ctx.events.emit("shop:open-requested", {
          entityId: playerId,
          ...describeFor(playerId),
          shopId: near.shop.id,
          shopName: near.shop.name,
          now,
        });
        movement.setInput(playerId, {});
        return;
      }
    }

    return originalHandleInput(playerId, input, now);
  };

  const originalStep = matchApi.step.bind(matchApi);
  matchApi.step = (dt, now = Date.now()) => {
    if (battleRoyale.isActive()) {
      checkHumanProximity(now);
    }
    return originalStep(dt, now);
  };

  const originalSnapshot = matchApi.snapshot.bind(matchApi);
  matchApi.snapshot = (now = Date.now()) => {
    const snap = originalSnapshot(now);
    return {
      ...snap,
      shops: shopsList(),
      entities: (snap.entities ?? []).map((e) => ({
        ...e,
        cash: balanceOf(e.id),
      })),
    };
  };

  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  matchApi.snapshotFor = (playerId, now = Date.now()) => {
    const snap = originalSnapshotFor(playerId, now);
    return {
      ...snap,
      shops: shopsList(),
      shop: describeFor(playerId),
      entities: (snap.entities ?? []).map((e) => ({
        ...e,
        cash: balanceOf(e.id),
      })),
    };
  };

  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);
  matchApi.eventsForPlayer = (playerId, packets = []) => {
    const base = originalEventsForPlayer(playerId, packets);
    const seen = new Set(base);
    const ownTeam = Number(teams.teamOf(playerId)) || 0;
    const extra = packets.filter((packet) => {
      if (seen.has(packet) || !String(packet.event ?? "").startsWith("shop:")) return false;
      const p = packet.payload ?? {};
      if (p.entityId === playerId || p.buyerId === playerId || p.targetId === playerId) return true;
      if (ownTeam > 0 && Number(p.teamId) === ownTeam) return true;
      return false;
    });
    return [...base, ...extra];
  };

  ctx.services.provide("shop", {
    stations: shopsList,
    nearestShop,
    balanceOf,
    grantCash,
    spendCash,
    deadTeammatesFor,
    redeployTeammate,
    buy,
    describeFor,
    constants: {
      BUYBACK_COST,
      FAST_STIM_COST,
      TURBO_STIM_COST,
      ARMOR_PLATES_COST,
      MARKSMAN_COST,
      SNIPER_COST,
      JUGGERNAUT_DROP_COST,
      MINES_COST,
      MINI_NUKE_COST,
      ELECTRO_DROP_COST,
      KILL_CASH_REWARD,
      AIRDROP_CASH_REWARD,
      JUGGERNAUT_CASH_REWARD,
      BOUNTY_CASH_REWARD,
      SHOP_INTERACTION_RANGE,
      REDEPLOY_ALTITUDE,
      TURBO_PURCHASE_LIMIT,
      TURBO_HEALTH_TARGET,
    },
  });
}
