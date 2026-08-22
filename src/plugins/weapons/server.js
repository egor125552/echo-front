const DEFINITIONS = {
  pistol: {
    id: "pistol",
    name: "Пистолет",
    automatic: false,
    magazine: 50,
    reserve: 350,
    damage: 28,
    rpm: 300,
    range: 28,
    soundKey: "weapon.pistol",
    reloadMs: 1250,
  },
  rifle: {
    id: "rifle",
    name: "Автомат",
    automatic: true,
    magazine: 30,
    reserve: 120,
    damage: 17,
    rpm: 600,
    range: 35,
    soundKey: "weapon.rifle",
    reloadMs: 1550,
  },
};

export const manifest = {
  id: "weapons",
  version: "1.2.0",
  requires: ["entities", "movement", "combat", "rapier-physics", "teams"],
  optional: ["aim-assist"],
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
  const physics = ctx.services.get("physics");
  const combat = ctx.services.get("combat");
  const teams = ctx.services.get("teams");
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

  function fire(entityId, now = Date.now()) {
    const entity = entities.get(entityId);
    if (!entity?.alive) return false;
    const transform = ctx.components.get(entityId, "Transform");
    const inventory = ctx.components.get(entityId, "Weapons");
    if (!transform || !inventory?.items.length) return false;

    const weapon = inventory.items[inventory.selected];
    const definition = DEFINITIONS[weapon.id];
    finishReload(weapon, definition, now);

    if (weapon.reloadUntil > now || weapon.ammo <= 0) return false;
    const minimumDelay = 60000 / definition.rpm;
    if (now - weapon.lastFireAt < minimumDelay) return false;

    weapon.lastFireAt = now;
    weapon.ammo -= 1;

    const baseDirection = {
      x: Math.sin(transform.angle),
      y: 0,
      z: -Math.cos(transform.angle),
    };
    const direction = targeting
      ? targeting.adjustDirection(entityId, baseDirection, definition.range)
      : baseDirection;

    ctx.events.emit("sound:spatial", {
      entityId,
      key: definition.soundKey,
      x: transform.x,
      z: transform.z,
      radius: 40,
    });
    ctx.events.emit("weapon:fired", { entityId, weaponId: weapon.id, ammo: weapon.ammo });

    const origin = {
      x: transform.x + direction.x * 0.55,
      y: 1.0,
      z: transform.z + direction.z * 0.55,
    };
    const hit = physics.raycast(origin, direction, definition.range, entityId);
    if (hit?.entityId) {
      const target = entities.get(hit.entityId);
      const sameTeam = teams.teamOf(entityId) === teams.teamOf(hit.entityId);
      if (target?.alive && !sameTeam) {
        combat.damage(hit.entityId, definition.damage, {
          attackerId: entityId,
          weaponId: weapon.id,
          now,
        });
      }
    }
    return true;
  }

  const api = {
    definitions: DEFINITIONS,
    fire,
    grant,
    has(entityId, weaponId) {
      return Boolean(ctx.components.get(entityId, "Weapons")?.items?.some((item) => item.id === weaponId));
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
    tickAutomatic(now = Date.now()) {
      for (const [entityId, input] of ctx.components.entries("Input")) {
        const inventory = ctx.components.get(entityId, "Weapons");
        if (!inventory?.items.length) continue;
        const weapon = inventory.items[inventory.selected];
        const definition = DEFINITIONS[weapon.id];
        finishReload(weapon, definition, now);
        if (input.fireHeld && definition.automatic) fire(entityId, now);
      }
    },
  };

  ctx.services.provide("weapons", api);
}
