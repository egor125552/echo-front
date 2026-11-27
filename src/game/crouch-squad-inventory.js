export const FORBIDDEN_INVENTORY_ITEM_IDS = new Set([
  "cash",
  "money",
  "credits",
  "gold",
  "currency",
  "деньги",
]);

export const INVENTORY_CATEGORIES = Object.freeze([
  { id: "armor", label: "Броня" },
  { id: "stimulants", label: "Стимуляторы" },
  { id: "ammo", label: "Патроны" },
]);

export const AMMO_PACK_STEP = Object.freeze({
  "ammo-pistol": 25,
  "ammo-rifle": 30,
  "ammo-marksman": 15,
  "ammo-sniper": 5,
});

export const ITEM_CATALOG = Object.freeze({
  "armor-plate": {
    id: "armor-plate",
    category: "armor",
    label: "Бронепластина",
    plural: "бронепластин",
    unitStep: 1,
    maxDrop: 20,
  },
  "stim-standard": {
    id: "stim-standard",
    category: "stimulants",
    label: "Стимулятор",
    plural: "стимуляторов",
    unitStep: 1,
    maxDrop: 20,
  },
  "stim-fast": {
    id: "stim-fast",
    category: "stimulants",
    label: "Быстрый стимулятор (1 сек)",
    plural: "быстрых стимуляторов",
    unitStep: 1,
    maxDrop: 20,
  },
  "stim-turbo": {
    id: "stim-turbo",
    category: "stimulants",
    label: "Турбо-стимулятор (600 HP)",
    plural: "турбо-стимуляторов",
    unitStep: 1,
    maxDrop: 10,
  },
  "ammo-pistol": {
    id: "ammo-pistol",
    category: "ammo",
    label: "Патроны для пистолета",
    plural: "патронов для пистолета",
    weaponId: "pistol",
    unitStep: 25,
    maxDrop: 200,
  },
  "ammo-rifle": {
    id: "ammo-rifle",
    category: "ammo",
    label: "Патроны для автомата",
    plural: "патронов для автомата",
    weaponId: "rifle",
    unitStep: 30,
    maxDrop: 240,
  },
  "ammo-marksman": {
    id: "ammo-marksman",
    category: "ammo",
    label: "Патроны для винтовки",
    plural: "патронов для винтовки",
    weaponId: "marksman",
    unitStep: 15,
    maxDrop: 150,
  },
  "ammo-sniper": {
    id: "ammo-sniper",
    category: "ammo",
    label: "Патроны для снайперки",
    plural: "патронов для снайперки",
    weaponId: "sniper",
    unitStep: 5,
    maxDrop: 60,
  },
});

export const SQUAD_ORDERS = Object.freeze({
  move: { id: "move", label: "Идти туда", speech: "Двигаемся в указанную точку" },
  follow: { id: "follow", label: "Ко мне", speech: "Идём к тебе, держимся рядом" },
  cover: { id: "cover", label: "В укрытие", speech: "Занимаем укрытия и прикрываем" },
  attack: { id: "attack", label: "Атаковать", speech: "Переходим в свободную атаку" },
  hold: { id: "hold", label: "Держать позицию", speech: "Держим текущую позицию" },
});

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function distanceToBox2D(px, pz, cx, cz, halfW, halfD) {
  const dx = Math.max(0, Math.abs(px - cx) - halfW);
  const dz = Math.max(0, Math.abs(pz - cz) - halfD);
  return Math.hypot(dx, dz);
}

function closestPointOnBox2D(px, pz, cx, cz, halfW, halfD) {
  return {
    x: clamp(px, cx - halfW, cx + halfW),
    z: clamp(pz, cz - halfD, cz + halfD),
  };
}

function closestPointOnOrientedBox2D(px, pz, cx, cz, halfW, halfL, angle = 0) {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const relX = px - cx;
  const relZ = pz - cz;
  const localX = relX * cos - relZ * sin;
  const localZ = relX * sin + relZ * cos;
  const clampedX = clamp(localX, -halfW, halfW);
  const clampedZ = clamp(localZ, -halfL, halfL);
  const dx = localX - clampedX;
  const dz = localZ - clampedZ;
  const worldCos = Math.cos(angle);
  const worldSin = Math.sin(angle);
  return {
    distance: Math.hypot(dx, dz),
    x: cx + clampedX * worldCos - clampedZ * worldSin,
    z: cz + clampedX * worldSin + clampedZ * worldCos,
  };
}

export function coverLabelForKind(kind) {
  switch (kind) {
    case "vehicle":
      return "за машиной";
    case "roof-parapet":
      return "за парапетом крыши";
    case "crate":
      return "за ящиком";
    case "wall":
      return "за стеной";
    default:
      return "в укрытии";
  }
}

export function ricochetMaterialForCover(kind) {
  switch (kind) {
    case "vehicle":
      return "metal";
    case "crate":
      return "wood";
    case "roof-parapet":
    case "wall":
    default:
      return "concrete";
  }
}

export function detectNearbyCover({
  position = {},
  vehicles = [],
  obstacles = [],
  crates = [],
  vehicleRadius = 1.85,
  wallRadius = 1.45,
  crateRadius = 1.55,
} = {}) {
  const px = finite(position.x);
  const py = finite(position.y);
  const pz = finite(position.z);

  let best = null;
  const consider = (candidate) => {
    if (!candidate) return;
    if (!best || candidate.priority > best.priority
      || (candidate.priority === best.priority && candidate.distance < best.distance)) {
      best = candidate;
    }
  };

  for (const vehicle of vehicles || []) {
    if (!vehicle) continue;
    const vx = finite(vehicle.x);
    const vy = finite(vehicle.y);
    const vz = finite(vehicle.z);
    if (Math.abs(vy - py) > 1.8) continue;
    const halfW = Math.max(0.85, finite(vehicle.width, 2.05) / 2);
    const halfL = Math.max(1.7, finite(vehicle.length, 4.4) / 2);
    const hit = closestPointOnOrientedBox2D(px, pz, vx, vz, halfW, halfL, finite(vehicle.angle));
    if (hit.distance <= vehicleRadius) {
      consider({
        active: true,
        kind: "vehicle",
        label: coverLabelForKind("vehicle"),
        coverId: vehicle.id ?? null,
        coverX: hit.x,
        coverZ: hit.z,
        distance: Number(hit.distance.toFixed(2)),
        priority: 3,
      });
    }
  }

  for (const obstacle of obstacles || []) {
    if (!obstacle || obstacle.destroyed) continue;
    if (obstacle.kind === "building-floor" || obstacle.kind === "building-stair" || obstacle.walkable) continue;
    const ox = finite(obstacle.x);
    const oy = finite(obstacle.y);
    const oz = finite(obstacle.z);
    const height = finite(obstacle.height, 2.6);
    if (height < 0.55) continue;
    const topY = oy + height;
    if (topY < py + 0.45 || oy > py + 1.45) continue;
    const halfW = Math.max(0.12, finite(obstacle.width, 1) / 2);
    const halfD = Math.max(0.12, finite(obstacle.depth, 1) / 2);
    const dist = distanceToBox2D(px, pz, ox, oz, halfW, halfD);
    const isParapet = obstacle.kind === "building-parapet" || obstacle.parapet === true;
    const isCrateLike = obstacle.kind === "crate" || obstacle.kind === "cover";
    const maxDist = isCrateLike ? crateRadius : wallRadius;
    if (dist <= maxDist) {
      const nearest = closestPointOnBox2D(px, pz, ox, oz, halfW, halfD);
      const kind = isParapet ? "roof-parapet" : (isCrateLike ? "crate" : "wall");
      consider({
        active: true,
        kind,
        label: coverLabelForKind(kind),
        coverId: obstacle.id ?? null,
        coverX: nearest.x,
        coverZ: nearest.z,
        distance: Number(dist.toFixed(2)),
        priority: isParapet ? 2.5 : (kind === "wall" ? 2 : 1.5),
      });
    }
  }

  for (const crate of crates || []) {
    if (!crate || crate.droppedItem) continue;
    const cx = finite(crate.x);
    const cy = finite(crate.y);
    const cz = finite(crate.z);
    if (Math.abs(cy - py) > 1.35) continue;
    const dist = distanceToBox2D(px, pz, cx, cz, 0.55, 0.55);
    if (dist <= crateRadius) {
      const nearest = closestPointOnBox2D(px, pz, cx, cz, 0.55, 0.55);
      consider({
        active: true,
        kind: "crate",
        label: coverLabelForKind("crate"),
        coverId: crate.id ?? null,
        coverX: nearest.x,
        coverZ: nearest.z,
        distance: Number(dist.toFixed(2)),
        priority: 1,
      });
    }
  }

  if (!best) {
    return {
      active: false,
      kind: null,
      label: null,
      coverId: null,
      coverX: null,
      coverZ: null,
      distance: null,
    };
  }
  const { priority: _unused, ...result } = best;
  return result;
}

function deterministicRoll(seedText) {
  let hash = 2166136261;
  const text = String(seedText ?? "0");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

export function evaluateCoverProtection({
  targetTransform = {},
  targetCover = null,
  shooterTransform = null,
  projectileId = "",
  rng = null,
} = {}) {
  const crouching = Boolean(targetTransform?.crouching);
  if (!crouching) {
    return {
      crouching: false,
      inCover: false,
      coverShielded: false,
      blockedByCover: false,
      damageScale: 1,
      ricochetMaterial: null,
    };
  }

  const inCover = Boolean(targetCover?.active || targetTransform?.inCover);
  const coverKind = targetCover?.kind ?? targetTransform?.coverKind ?? null;
  let coverShielded = false;

  if (inCover) {
    const cx = targetCover?.coverX ?? targetTransform?.coverX;
    const cz = targetCover?.coverZ ?? targetTransform?.coverZ;
    if (shooterTransform && Number.isFinite(Number(cx)) && Number.isFinite(Number(cz))) {
      const toCoverX = Number(cx) - finite(targetTransform.x);
      const toCoverZ = Number(cz) - finite(targetTransform.z);
      const toShooterX = finite(shooterTransform.x) - finite(targetTransform.x);
      const toShooterZ = finite(shooterTransform.z) - finite(targetTransform.z);
      const lenCover = Math.hypot(toCoverX, toCoverZ);
      const lenShooter = Math.hypot(toShooterX, toShooterZ);
      if (lenCover > 0.05 && lenShooter > 0.05) {
        const dot = (toCoverX * toShooterX + toCoverZ * toShooterZ) / (lenCover * lenShooter);
        coverShielded = dot >= -0.2;
      } else {
        coverShielded = true;
      }
    } else {
      coverShielded = true;
    }
  }

  let blockChance = 0.24;
  let damageScale = 0.85;
  if (inCover && coverShielded) {
    blockChance = coverKind === "vehicle" || coverKind === "wall" || coverKind === "roof-parapet"
      ? 0.56
      : 0.44;
    damageScale = 0.7;
  } else if (inCover) {
    blockChance = 0.34;
    damageScale = 0.8;
  }

  const roll = typeof rng === "function"
    ? clamp(rng(), 0, 0.9999)
    : deterministicRoll(`${projectileId}|${Math.round(finite(targetTransform.x) * 10)}|${Math.round(finite(targetTransform.z) * 10)}`);

  const blockedByCover = roll < blockChance;
  return {
    crouching: true,
    inCover,
    coverKind,
    coverShielded,
    blockedByCover,
    damageScale: blockedByCover ? 0 : damageScale,
    ricochetMaterial: inCover ? ricochetMaterialForCover(coverKind) : null,
  };
}

export function isForbiddenItemId(itemId) {
  const normalized = String(itemId ?? "").trim().toLowerCase();
  return FORBIDDEN_INVENTORY_ITEM_IDS.has(normalized);
}

export function buildGroupedInventory({
  armorReserve = 0,
  stimulants = {},
  weapons = [],
} = {}) {
  const entries = [];
  const plates = Math.max(0, Math.floor(finite(armorReserve)));
  if (plates > 0) {
    entries.push({ ...ITEM_CATALOG["armor-plate"], quantity: plates });
  }

  const stimStandard = Math.max(0, Math.floor(finite(stimulants.standard ?? stimulants.count)));
  const stimFast = Math.max(0, Math.floor(finite(stimulants.fast ?? stimulants.fastCount)));
  const stimTurbo = Math.max(0, Math.floor(finite(stimulants.turbo ?? stimulants.turboCount)));
  if (stimStandard > 0) entries.push({ ...ITEM_CATALOG["stim-standard"], quantity: stimStandard });
  if (stimFast > 0) entries.push({ ...ITEM_CATALOG["stim-fast"], quantity: stimFast });
  if (stimTurbo > 0) entries.push({ ...ITEM_CATALOG["stim-turbo"], quantity: stimTurbo });

  for (const weapon of weapons || []) {
    if (!weapon?.id) continue;
    const itemId = `ammo-${weapon.id}`;
    const meta = ITEM_CATALOG[itemId];
    if (!meta) continue;
    const reserve = Math.max(0, Math.floor(finite(weapon.reserve)));
    if (reserve > 0) {
      entries.push({ ...meta, quantity: reserve });
    }
  }

  const groups = INVENTORY_CATEGORIES.map((category) => ({
    ...category,
    items: entries.filter((entry) => entry.category === category.id),
  })).filter((group) => group.items.length > 0);

  return {
    categories: groups,
    items: entries,
    totalEntries: entries.length,
    moneyTransferAllowed: false,
  };
}

export function validateDropRequest({ itemId, quantity, senderStock = {} } = {}) {
  if (isForbiddenItemId(itemId)) {
    return {
      ok: false,
      reason: "forbidden-money",
      speech: "Деньги нельзя выбрасывать или передавать",
    };
  }
  const meta = ITEM_CATALOG[itemId];
  if (!meta) {
    return {
      ok: false,
      reason: "unknown-item",
      speech: "Этот предмет нельзя выбросить",
    };
  }
  const available = Math.max(0, Math.floor(finite(senderStock[itemId])));
  const requested = Math.floor(finite(quantity));
  if (requested <= 0) {
    return {
      ok: false,
      reason: "invalid-quantity",
      speech: "Укажи количество больше нуля",
    };
  }
  if (available <= 0) {
    return {
      ok: false,
      reason: "no-stock",
      speech: `У тебя нет предмета: ${meta.label}`,
    };
  }
  const actual = Math.min(available, requested, meta.maxDrop);
  return {
    ok: true,
    itemId,
    label: meta.label,
    quantity: actual,
  };
}

export function planBatchTransfer({
  senderStock = {},
  items = [],
  recipientIds = [],
  recipientCapacities = {},
} = {}) {
  const uniqueRecipients = [];
  const seen = new Set();
  for (const id of recipientIds || []) {
    const key = String(id ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueRecipients.push(key);
  }
  if (!uniqueRecipients.length) {
    return {
      ok: false,
      reason: "no-recipients",
      speech: "Выбери хотя бы одного живого напарника",
      transfers: [],
      totalSentByItem: {},
      leftoverByItem: {},
      rejectedReasons: ["no-recipients"],
    };
  }

  const normalizedItems = [];
  const merged = new Map();
  const rejectedReasons = [];

  for (const entry of items || []) {
    const itemId = String(entry?.itemId ?? "").trim();
    if (!itemId) continue;
    if (isForbiddenItemId(itemId)) {
      return {
        ok: false,
        reason: "forbidden-money",
        speech: "Деньги нельзя передавать напарникам",
        transfers: [],
        totalSentByItem: {},
        leftoverByItem: {},
        rejectedReasons: ["forbidden-money"],
      };
    }
    const meta = ITEM_CATALOG[itemId];
    if (!meta) {
      rejectedReasons.push(`unknown:${itemId}`);
      continue;
    }
    const qty = Math.floor(finite(entry?.quantity));
    if (qty <= 0) continue;
    merged.set(itemId, (merged.get(itemId) ?? 0) + qty);
  }

  for (const [itemId, qty] of merged.entries()) {
    normalizedItems.push({ itemId, quantity: qty });
  }

  if (!normalizedItems.length) {
    return {
      ok: false,
      reason: "no-items",
      speech: "Добавь хотя бы один предмет для передачи",
      transfers: [],
      totalSentByItem: {},
      leftoverByItem: {},
      rejectedReasons: ["no-items"],
    };
  }

  const perRecipient = new Map(uniqueRecipients.map((id) => [id, new Map()]));
  const remainingCap = new Map(
    uniqueRecipients.map((id) => {
      const caps = recipientCapacities?.[id] ?? {};
      return [id, { ...caps }];
    }),
  );

  const totalSentByItem = {};
  const leftoverByItem = {};

  for (const { itemId, quantity } of normalizedItems) {
    const available = Math.max(0, Math.floor(finite(senderStock[itemId])));
    let toDistribute = Math.min(available, quantity);
    const meta = ITEM_CATALOG[itemId];
    const step = meta.category === "ammo" ? Math.min(meta.unitStep, Math.max(1, Math.floor(toDistribute / uniqueRecipients.length) || 1)) : 1;
    let sentTotal = 0;

    let progress = true;
    while (toDistribute > 0 && progress) {
      progress = false;
      for (const recipientId of uniqueRecipients) {
        if (toDistribute <= 0) break;
        const caps = remainingCap.get(recipientId);
        const capRaw = caps[itemId];
        const cap = capRaw == null ? Infinity : Math.max(0, Math.floor(finite(capRaw)));
        if (cap <= 0) continue;
        const chunk = Math.min(toDistribute, cap, step);
        if (chunk <= 0) continue;
        const bucket = perRecipient.get(recipientId);
        bucket.set(itemId, (bucket.get(itemId) ?? 0) + chunk);
        if (Number.isFinite(cap)) caps[itemId] = cap - chunk;
        toDistribute -= chunk;
        sentTotal += chunk;
        progress = true;
      }
    }

    if (sentTotal > 0) totalSentByItem[itemId] = sentTotal;
    if (quantity - sentTotal > 0) leftoverByItem[itemId] = quantity - sentTotal;
  }

  const transfers = [];
  for (const recipientId of uniqueRecipients) {
    const bucket = perRecipient.get(recipientId);
    const list = [...bucket.entries()]
      .filter(([, qty]) => qty > 0)
      .map(([itemId, quantity]) => ({
        itemId,
        label: ITEM_CATALOG[itemId].label,
        quantity,
      }));
    if (list.length) {
      transfers.push({ recipientId, items: list });
    }
  }

  if (!transfers.length) {
    return {
      ok: false,
      reason: "no-capacity-or-stock",
      speech: "Не удалось передать предметы: у напарников нет места или предметы закончились",
      transfers: [],
      totalSentByItem: {},
      leftoverByItem,
      rejectedReasons: ["no-capacity-or-stock"],
    };
  }

  return {
    ok: true,
    transfers,
    totalSentByItem,
    leftoverByItem,
    rejectedReasons,
  };
}

export function normalizeSquadOrder(orderInput = {}, leaderTransform = {}, { mapBounds = null, now = Date.now() } = {}) {
  const rawOrder = String(orderInput?.order ?? orderInput?.type ?? "").trim().toLowerCase();
  const meta = SQUAD_ORDERS[rawOrder];
  if (!meta) return null;

  const targetIds = Array.isArray(orderInput?.targetIds)
    ? [...new Set(orderInput.targetIds.map((id) => String(id).trim()).filter(Boolean))]
    : null;

  let point = null;
  if (rawOrder === "move") {
    if (orderInput?.point && Number.isFinite(Number(orderInput.point.x)) && Number.isFinite(Number(orderInput.point.z))) {
      point = {
        x: Number(orderInput.point.x),
        y: finite(orderInput.point.y, finite(leaderTransform.y)),
        z: Number(orderInput.point.z),
      };
    } else {
      const distance = clamp(orderInput?.distance ?? 26, 8, 80);
      const angle = finite(leaderTransform.angle);
      point = {
        x: finite(leaderTransform.x) + Math.sin(angle) * distance,
        y: finite(leaderTransform.y),
        z: finite(leaderTransform.z) - Math.cos(angle) * distance,
      };
    }
    if (mapBounds) {
      const minX = finite(mapBounds.minX, -420) + 6;
      const maxX = finite(mapBounds.maxX, 420) - 6;
      const minZ = finite(mapBounds.minZ, -420) + 6;
      const maxZ = finite(mapBounds.maxZ, 420) - 6;
      point.x = clamp(point.x, minX, maxX);
      point.z = clamp(point.z, minZ, maxZ);
    }
    point.x = Number(point.x.toFixed(2));
    point.y = Number(point.y.toFixed(2));
    point.z = Number(point.z.toFixed(2));
  } else if (rawOrder === "hold") {
    point = null; // Bot locks to its own current position when receiving hold
  }

  return {
    type: meta.id,
    label: meta.label,
    speech: meta.speech,
    targetIds,
    point,
    issuedAt: finite(now, Date.now()),
  };
}

/**
 * Pure automatic stimulant selector for AI squadmates/bots.
 * Rules:
 * - Downed (self-revive): fast (1s) first -> if enemies nearby, turbo (1s + 600 HP) -> standard (6s) -> turbo.
 * - Standing unboosted with turbo (maxHealth < turboTargetHealth): inject turbo once safe / in cover and not actively taking hits -> becomes 600 HP tank.
 * - Standing in active firefight (enemiesVisible): only use 1-second fast/turbo if critically hurt (< 45% in cover or < 30% open) and not actively taking hits right now.
 * - Standing out of sight & hurt (< 65%): if enemies nearby or critical (< 35%) prefer fast -> standard -> turbo (< 40%); if calm save fast & turbo and use standard -> fast.
 */
export function selectBotStimulantKind({
  downed = false,
  health = 200,
  maxHealth = 200,
  turboTargetHealth = 600,
  standardCount = 0,
  fastCount = 0,
  turboCount = 0,
  minReserveStims = 0,
  enemiesVisible = false,
  enemiesNearby = false,
  inCover = false,
  recentlyDamaged = false,
  stimCooldownActive = false,
} = {}) {
  const std = Math.max(0, Math.floor(finite(standardCount)));
  const fast = Math.max(0, Math.floor(finite(fastCount)));
  const turbo = Math.max(0, Math.floor(finite(turboCount)));
  const total = std + fast + turbo;
  if (total <= 0) return null;

  if (downed) {
    if (fast > 0) return "fast";
    if (enemiesNearby && turbo > 0) return "turbo";
    if (std > 0) return "standard";
    if (turbo > 0) return "turbo";
    return null;
  }

  if (recentlyDamaged || stimCooldownActive) return null;

  const hp = Math.max(0, finite(health, 200));
  const maxHp = Math.max(1, finite(maxHealth, 200));
  const targetTurboHp = Math.max(maxHp, finite(turboTargetHealth, 600));
  const hpRatio = hp / maxHp;

  // 1. Pre-combat / cover Turbo tank boost: if squadmate has a Turbo stim and isn't boosted to 600 HP yet
  if (turbo > 0 && maxHp < targetTurboHp && (!enemiesVisible || inCover)) {
    return "turbo";
  }

  // 2. Active firefight (visible standing enemy): ONLY quick 1-second stims when critically low
  if (enemiesVisible) {
    const emergencyInCover = inCover && hpRatio < 0.45;
    const desperateLow = hpRatio < 0.30;
    if (!emergencyInCover && !desperateLow) return null;
    if (fast > 0) return "fast";
    if (turbo > 0) return "turbo";
    return null;
  }

  // 3. Out of direct sight: heal when below 65% HP
  if (hpRatio >= 0.65) return null;

  const reserve = Math.max(0, Math.floor(finite(minReserveStims)));
  const critical = hpRatio < 0.35;
  if (!critical && total <= reserve) return null;

  // Urgent heal (enemies nearby or critically low): prioritize 1s Fast stim
  if (enemiesNearby || critical) {
    if (fast > 0) return "fast";
    if (std > 0) return "standard";
    if (turbo > 0 && hpRatio < 0.40) return "turbo";
    return null;
  }

  // Calm heal: conserve Fast & Turbo stims, use Standard first
  if (std > 0) return "standard";
  if (fast > 0) return "fast";
  if (turbo > 0 && hpRatio < 0.40) return "turbo";
  return null;
}

