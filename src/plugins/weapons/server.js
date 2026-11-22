const DEFINITIONS = {
  pistol: {
    id: "pistol",
    name: "Пистолет",
    automatic: false,
    holdRepeat: true,
    magazine: 100,
    reserve: 400,
    damage: 22,
    rpm: 300,
    range: 28,
    muzzleVelocity: 120,
    projectileMass: 0.008,
    projectileRadius: 0.005,
    soundKey: "weapon.pistol",
    soundRadius: 90,
    reloadMs: 1250,
  },
  rifle: {
    id: "rifle",
    name: "Автомат",
    automatic: true,
    holdRepeat: true,
    magazine: 30,
    reserve: 120,
    damage: 17,
    rpm: 600,
    range: 28,
    muzzleVelocity: 200,
    projectileMass: 0.004,
    projectileRadius: 0.003,
    soundKey: "weapon.rifle",
    soundRadius: 110,
    reloadMs: 1550,
  },
  marksman: {
    id: "marksman",
    name: "Винтовка",
    automatic: false,
    holdRepeat: true,
    magazine: 15,
    reserve: 90,
    damage: 68,
    armorDamageMultiplier: 1.65,
    rpm: 240,
    range: 92,
    muzzleVelocity: 400,
    projectileMass: 0.012,
    projectileRadius: 0.0055,
    soundKey: "weapon.marksman",
    soundRadius: 170,
    reloadMs: 1500,
  },
  sniper: {
    id: "sniper",
    name: "Снайперка",
    automatic: false,
    holdRepeat: false,
    magazine: 6,
    reserve: 36,
    damage: 165,
    shattersArmor: true,
    armorDamageMultiplier: 2.2,
    rpm: 54,
    range: 155,
    muzzleVelocity: 560,
    projectileMass: 0.025,
    projectileRadius: 0.0075,
    soundKey: "weapon.sniper",
    soundRadius: 240,
    reloadMs: 1850,
  },
  "electro-rifle": {
    id: "electro-rifle",
    name: "Электрический автомат-шокер",
    automatic: true,
    holdRepeat: true,
    magazine: 80,
    reserve: 800,
    damage: 185,
    shattersArmor: true,
    armorDamageMultiplier: 4.5,
    piercesVehicles: true,
    rpm: 780,
    range: 260,
    muzzleVelocity: 680,
    projectileMass: 0.012,
    projectileRadius: 0.006,
    soundKey: "weapon.rifle",
    soundRadius: 240,
    reloadMs: 900,
  },
};

export const manifest = {
  id: "weapons",
  version: "2.1.0",
  requires: ["entities", "movement", "rapier-projectiles", "map-test-arena"],
  optional: ["aim-assist", "target-assist"],
  capabilities: [
    "services.consume", "services.provide",
    "components.register", "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

function createWeapon(definition) {
  return {
    id: definition.id,
    ammo: definition.magazine,
    reserve: definition.reserve,
    lastFireAt: -Infinity,
    reloadUntil: 0,
  };
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const projectiles = ctx.services.get("projectiles");
  const map = ctx.services.get("map");
  const targeting = ctx.services.has("targeting") ? ctx.services.get("targeting") : null;

  ctx.components.register("Weapons");

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    if (spec.weapons === false) return;
    const ids = spec.weapons ?? ["pistol", "rifle"];
    ctx.components.add(entityId, "Weapons", {
      selected: 0,
      items: ids.filter((id) => DEFINITIONS[id]).map((id) => createWeapon(DEFINITIONS[id])),
    });
  });

  ctx.events.on("entity:removed", ({ entityId }) => ctx.components.remove(entityId, "Weapons"));

  ctx.events.on("respawn:before", ({ entityId }) => {
    const inventory = ctx.components.get(entityId, "Weapons");
    if (!inventory?.items.length) return;
    for (const weapon of inventory.items) {
      const definition = DEFINITIONS[weapon.id];
      if (!definition) continue;
      weapon.ammo = definition.magazine;
      weapon.reserve = definition.reserve;
      weapon.lastFireAt = -Infinity;
      weapon.reloadUntil = 0;
    }
  });

  function finishReload(weapon, definition, now) {
    if (!weapon.reloadUntil || now < weapon.reloadUntil) return;
    const needed = definition.magazine - weapon.ammo;
    const loaded = Math.min(needed, weapon.reserve);
    weapon.ammo += loaded;
    weapon.reserve -= loaded;
    weapon.reloadUntil = 0;
  }

  function grant(entityId, weaponId) {
    const inventory = ctx.components.get(entityId, "Weapons");
    const definition = DEFINITIONS[weaponId];
    if (!inventory || !definition) return false;
    if (inventory.items.some((item) => item.id === weaponId)) return false;
    inventory.items.push(createWeapon(definition));
    ctx.events.emit("weapon:unlocked", { entityId, weaponId });
    return true;
  }

  function restock(entityId, weaponId, reserveAmount = 60) {
    const inventory = ctx.components.get(entityId, "Weapons");
    const definition = DEFINITIONS[weaponId];
    const weapon = inventory?.items?.find((item) => item.id === weaponId) ?? null;
    if (!weapon || !definition) return 0;
    const amount = Math.max(1, Math.floor(Number(reserveAmount) || 60));
    const reserveCap = Math.max(definition.reserve, definition.reserve * 2);
    const before = Math.max(0, Number(weapon.reserve) || 0);
    weapon.reserve = Math.min(reserveCap, before + amount);
    const added = weapon.reserve - before;
    if (added > 0) {
      ctx.events.emit("weapon:ammo-restocked", { entityId, weaponId, added, reserve: weapon.reserve });
    }
    return added;
  }

  function fire(entityId, now = Date.now(), { pressed = false } = {}) {
    const entity = entities.get(entityId);
    if (!entity?.alive) return false;
    const transform = ctx.components.get(entityId, "Transform");
    const inventory = ctx.components.get(entityId, "Weapons");
    if (!transform || !inventory?.items.length) return false;

    const weapon = inventory.items[inventory.selected];
    const definition = DEFINITIONS[weapon.id];
    finishReload(weapon, definition, now);

    if (weapon.ammo <= 0 && weapon.reserve > 0 && !weapon.reloadUntil) {
      weapon.reloadUntil = now + definition.reloadMs;
    }
    if (weapon.reloadUntil > now || weapon.ammo <= 0) return false;
    const minimumDelay = 60000 / definition.rpm;
    // Physical taps bypass hold-repeat cadence on semi-auto sidearms, not bolt-action rechambers.
    if ((!pressed || definition.automatic || !definition.holdRepeat) && now - weapon.lastFireAt < minimumDelay) {
      return false;
    }
    // A held input can arrive in the same server tick as its initial press.
    if (now === weapon.lastFireAt) return false;

    weapon.lastFireAt = now;
    weapon.ammo -= 1;
    if (weapon.ammo === 0 && weapon.reserve > 0) {
      weapon.reloadUntil = now + definition.reloadMs;
    }

    const baseDirection = {
      x: Math.sin(transform.angle),
      y: 0,
      z: -Math.cos(transform.angle),
    };
    const targetingOptions = {
      muzzleVelocity: definition.muzzleVelocity,
      weaponId: weapon.id,
      piercesVehicles: Boolean(definition.piercesVehicles),
    };
    const resolved = targeting?.resolveShot
      ? targeting.resolveShot(entityId, baseDirection, definition.range, targetingOptions)
      : {
          direction: targeting
            ? targeting.adjustDirection(entityId, baseDirection, definition.range, targetingOptions)
            : baseDirection,
          targetId: null,
        };
    const direction = resolved?.direction ?? baseDirection;

    const input = ctx.components.get(entityId, "Input");
    const baseSpeed = Number.isFinite(transform.movementSpeed)
      ? Math.max(0, transform.movementSpeed)
      : (input?.sprint ? 5.4 : 3.25);
    const rawForward = Number(input?.forward) || 0;
    const strafeFactor = entity.bot ? 0.7 : 1;
    const rawStrafe = (Number(input?.strafe) || 0) * strafeFactor;
    const inputLen = Math.hypot(rawForward, rawStrafe);
    const moveScale = inputLen > 1 ? 1 / inputLen : 1;
    const shooterVx = (
      Math.sin(transform.angle) * rawForward * moveScale +
      Math.cos(transform.angle) * rawStrafe * moveScale
    ) * baseSpeed;
    const shooterVz = (
      -Math.cos(transform.angle) * rawForward * moveScale +
      Math.sin(transform.angle) * rawStrafe * moveScale
    ) * baseSpeed;
    const forwardMove = Math.max(0, shooterVx * direction.x + shooterVz * direction.z);
    const spawnOffset = 0.76 + forwardMove * 0.055;

    const crouchCoverPeek = Boolean(transform.crouching && transform.inCover);
    const muzzleOffset = spawnOffset + (crouchCoverPeek ? 0.45 : 0);
    const muzzleHeight = crouchCoverPeek ? 1.24 : (transform.crouching ? 0.86 : 1);
    const origin = {
      x: transform.x + direction.x * muzzleOffset,
      y: (Number(transform.y) || 0) + muzzleHeight,
      z: transform.z + direction.z * muzzleOffset,
    };
    const projectileId = projectiles.spawn({
      shooterId: entityId,
      weaponId: weapon.id,
      damage: definition.damage,
      speed: definition.muzzleVelocity,
      range: definition.range,
      mass: definition.projectileMass,
      radius: definition.projectileRadius,
      piercesVehicles: Boolean(definition.piercesVehicles),
      origin,
      direction,
      now,
    });
    const acousticZone = typeof map.acousticZoneAt === "function"
      ? map.acousticZoneAt(transform)
      : "outdoor";

    ctx.events.emit("sound:spatial", {
      entityId,
      key: definition.soundKey,
      x: transform.x,
      y: Number(transform.y) || 0,
      z: transform.z,
      acousticZone,
      radius: definition.soundRadius,
    });
    ctx.events.emit("weapon:fired", {
      entityId,
      weaponId: weapon.id,
      ammo: weapon.ammo,
      targetId: null,
      assistedTargetId: resolved?.targetId ?? null,
      projectileId,
      muzzleVelocity: definition.muzzleVelocity,
      projectileMass: definition.projectileMass,
      projectileRadius: definition.projectileRadius,
      x: transform.x,
      y: Number(transform.y) || 0,
      z: transform.z,
    });

    return Boolean(projectileId);
  }

  const api = {
    definitions: DEFINITIONS,
    fire,
    grant,
    restock,
    has(entityId, weaponId) {
      return Boolean(ctx.components.get(entityId, "Weapons")?.items?.some((item) => item.id === weaponId));
    },
    takeAmmo(entityId, weaponId, amount = 0) {
      const inventory = ctx.components.get(entityId, "Weapons");
      const qty = Math.max(0, Math.floor(Number(amount) || 0));
      if (!inventory?.items?.length || !qty) return 0;
      const item = inventory.items.find((entry) => entry.id === weaponId);
      if (!item || item.reserve <= 0) return 0;
      const removed = Math.min(item.reserve, qty);
      item.reserve -= removed;
      return removed;
    },
    grantAmmo(entityId, weaponId, amount = 0) {
      const inventory = ctx.components.get(entityId, "Weapons");
      const qty = Math.max(0, Math.floor(Number(amount) || 0));
      if (!inventory?.items?.length || !qty) return 0;
      const item = inventory.items.find((entry) => entry.id === weaponId)
        ?? inventory.items[inventory.selected]
        ?? inventory.items[0];
      if (!item) return 0;
      const def = DEFINITIONS[item.id] ?? { reserve: 120 };
      const cap = Math.max(400, (def.reserve || 120) * 4);
      const added = Math.min(qty, Math.max(0, cap - item.reserve));
      item.reserve += added;
      return added;
    },
    ammoCapacityFor(entityId, weaponId) {
      const inventory = ctx.components.get(entityId, "Weapons");
      if (!inventory?.items?.length) return 0;
      const item = inventory.items.find((entry) => entry.id === weaponId)
        ?? inventory.items[inventory.selected]
        ?? inventory.items[0];
      if (!item) return 0;
      const def = DEFINITIONS[item.id] ?? { reserve: 120 };
      const cap = Math.max(400, (def.reserve || 120) * 4);
      return Math.max(0, cap - item.reserve);
    },
    reload(entityId, now = Date.now()) {
      const inventory = ctx.components.get(entityId, "Weapons");
      if (!inventory?.items.length) return;
      const weapon = inventory.items[inventory.selected];
      const definition = DEFINITIONS[weapon.id];
      finishReload(weapon, definition, now);
      if (weapon.ammo >= definition.magazine || weapon.reserve <= 0 || weapon.reloadUntil > now) return;
      weapon.reloadUntil = now + definition.reloadMs;
    },
    select(entityId, delta) {
      const inventory = ctx.components.get(entityId, "Weapons");
      if (!inventory?.items.length || inventory.items.length < 2) return;
      const count = inventory.items.length;
      inventory.selected = (inventory.selected + Math.sign(delta || 0) + count) % count;
      ctx.events.emit("weapon:selected", {
        entityId,
        weaponId: inventory.items[inventory.selected].id,
      });
    },
    selectById(entityId, weaponId) {
      const inventory = ctx.components.get(entityId, "Weapons");
      if (!inventory?.items.length) return false;
      const idx = inventory.items.findIndex((item) => item.id === weaponId);
      if (idx < 0) return false;
      inventory.selected = idx;
      ctx.events.emit("weapon:selected", {
        entityId,
        weaponId: inventory.items[idx].id,
      });
      return true;
    },
    tickAutomatic(now = Date.now()) {
      for (const [entityId, input] of ctx.components.entries("Input")) {
        const inventory = ctx.components.get(entityId, "Weapons");
        if (!inventory?.items.length) continue;
        const weapon = inventory.items[inventory.selected];
        const definition = DEFINITIONS[weapon.id];
        finishReload(weapon, definition, now);
        if (weapon.ammo <= 0 && weapon.reserve > 0 && !weapon.reloadUntil) {
          weapon.reloadUntil = now + definition.reloadMs;
        }
        if (input.fireHeld && (definition.automatic || definition.holdRepeat)) fire(entityId, now);
      }
    },
  };

  ctx.services.provide("weapons", api);
}
