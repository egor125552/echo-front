export const HUMAN_TURN_SPEED = 1.65;
export const BOT_TURN_SPEED = 2.6;
export const FOOTSTEP_VARIANT_COUNT = 3;
export const FOOTSTEP_WALK_RADIUS = 32;
export const FOOTSTEP_SPRINT_RADIUS = 44;
export const CHARACTER_GRAVITY = 18;
export const CHARACTER_MAX_FALL_SPEED = 16;

const NAVIGABLE_SUPPORT_KINDS = new Set(["ground", "building-floor", "building-stair"]);
const STICKY_OBSTACLE_KINDS = new Set(["crate", "loot-crate"]);

export function normalizeFootstepSurface(value) {
  const surface = String(value ?? "default").trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(surface) ? surface : "default";
}

export function footstepKey(surface, variant) {
  const normalizedSurface = normalizeFootstepSurface(surface);
  const safeVariant = Math.max(1, Math.floor(Number(variant) || 1));
  return `footstep.${normalizedSurface}.${safeVariant}`;
}

function horizontalMovementLoss(attempted, moved) {
  const attemptedDistance = Math.hypot(attempted.x, attempted.z);
  if (attemptedDistance < 0.01) return 0;
  const alongAttempt = (moved.x * attempted.x + moved.z * attempted.z) / attemptedDistance;
  return attemptedDistance - Math.max(0, alongAttempt);
}

function blockageFromRapier(attempted, moved) {
  if (horizontalMovementLoss(attempted, moved) < 0.035) return null;
  const collisions = Array.isArray(moved.collisions) ? moved.collisions : [];
  for (const collision of collisions) {
    const worldObject = collision?.worldObject;
    if (!worldObject) continue;
    // Floors and stair ramps are support surfaces, not obstacles. Rapier may
    // report them while resolving slope/ground contact; announcing them as a
    // blocked move produces the misleading “Здесь лестница” loop.
    if (NAVIGABLE_SUPPORT_KINDS.has(String(worldObject.kind ?? ""))) continue;
    const explicitSpeech = String(worldObject.accessibleSpeech ?? "").trim();
    const accessibleName = String(worldObject.accessibleName ?? "").trim();
    if (!explicitSpeech && !accessibleName) continue;
    const hint = String(worldObject.interactionHint ?? "").trim();
    const speech = explicitSpeech || `Здесь ${accessibleName}${hint ? `. ${hint}` : ""}`;
    return {
      kind: worldObject.kind ?? "world-object",
      speech,
      colliderHandle: collision.colliderHandle ?? null,
      objectId: worldObject.crateId ?? worldObject.doorId ?? worldObject.id ?? null,
      objectName: accessibleName || null,
    };
  }
  return null;
}

export function hasOnlyNavigableSupportCollisions(moved = {}) {
  const collisions = Array.isArray(moved.collisions) ? moved.collisions : [];
  const worldKinds = collisions
    .map((collision) => String(collision?.worldObject?.kind ?? ""))
    .filter(Boolean);
  return worldKinds.length > 0 && worldKinds.every((kind) => NAVIGABLE_SUPPORT_KINDS.has(kind));
}

function blockageKey(blockage) {
  return [
    blockage?.kind ?? "unknown",
    blockage?.objectId ?? blockage?.colliderHandle ?? blockage?.speech ?? "",
  ].join(":");
}

function hasStickyObstacleCollision(moved = {}) {
  return (moved.collisions ?? []).some((collision) =>
    STICKY_OBSTACLE_KINDS.has(String(collision?.worldObject?.kind ?? "")));
}

export const manifest = {
  id: "movement",
  version: "2.4.1",
  requires: ["entities", "rapier-physics", "map-test-arena"],
  capabilities: [
    "services.consume", "services.provide",
    "components.register", "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  const blockedEntities = new Map();

  ctx.components.register("Transform");
  ctx.components.register("Input");

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    if (spec.movable === false) return;
    const spawn = spec.position ?? map.nextSpawn(spec.team ?? 1);
    physics.createCharacter(entityId, spawn);
    ctx.components.add(entityId, "Transform", {
      x: spawn.x,
      y: Number(spawn.y) || 0,
      z: spawn.z,
      angle: spawn.angle ?? 0,
      stepDistance: 0,
      stepIndex: 0,
      verticalVelocity: 0,
      grounded: false,
    });
    ctx.components.add(entityId, "Input", {
      forward: 0,
      strafe: 0,
      turn: 0,
      sprint: false,
      fireHeld: false,
    });
  });

  ctx.events.on("entity:died", ({ entityId }) => {
    physics.setCharacterEnabled(entityId, false);
    blockedEntities.delete(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (transform) {
      transform.verticalVelocity = 0;
      transform.grounded = false;
    }
    const input = ctx.components.get(entityId, "Input");
    if (input) {
      input.forward = 0;
      input.strafe = 0;
      input.turn = 0;
      input.sprint = false;
      input.fireHeld = false;
    }
  });

  ctx.events.on("entity:respawned", ({ entityId }) => {
    physics.setCharacterEnabled(entityId, true);
    blockedEntities.delete(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (transform) {
      transform.stepDistance = 0;
      transform.verticalVelocity = 0;
      transform.grounded = false;
    }
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    blockedEntities.delete(entityId);
    physics.removeCharacter(entityId);
    ctx.components.remove(entityId, "Transform");
    ctx.components.remove(entityId, "Input");
  });

  const api = {
    setInput(entityId, input = {}) {
      const state = ctx.components.get(entityId, "Input");
      if (!state) return;
      state.forward = Math.max(-1, Math.min(1, Number(input.forward) || 0));
      state.strafe = Math.max(-1, Math.min(1, Number(input.strafe) || 0));
      state.turn = Math.max(-1, Math.min(1, Number(input.turn) || 0));
      state.sprint = Boolean(input.sprint);
      state.fireHeld = Boolean(input.fireHeld);
    },
    teleport(entityId, position) {
      const transform = ctx.components.get(entityId, "Transform");
      if (!transform) return;
      const target = {
        x: Number(position.x) || 0,
        y: Number.isFinite(position.y) ? Number(position.y) : transform.y,
        z: Number(position.z) || 0,
      };
      physics.teleport(entityId, target);
      transform.x = target.x;
      transform.y = target.y;
      transform.z = target.z;
      transform.verticalVelocity = 0;
      transform.grounded = false;
      if (Number.isFinite(position.angle)) transform.angle = position.angle;
      transform.stepDistance = 0;
      blockedEntities.delete(entityId);
    },
    tick(dt, now = Date.now()) {
      const safeDt = Math.max(0, Math.min(0.1, dt));
      physics.beginBatch?.();
      try {
        for (const [entityId, transform] of ctx.components.entries("Transform")) {
          const entity = entities.get(entityId);
          if (!entity?.alive) continue;
          const input = ctx.components.get(entityId, "Input");
          if (!input) continue;

          const turnSpeed = entity.bot ? BOT_TURN_SPEED : HUMAN_TURN_SPEED;
          transform.angle += input.turn * turnSpeed * safeDt;
          const speed = input.sprint ? 5.4 : 3.25;
          const rawForward = input.forward;
          const strafeFactor = entity.bot ? 0.7 : 1;
          const rawStrafe = input.strafe * strafeFactor;
          const inputLength = Math.hypot(rawForward, rawStrafe);
          const scale = inputLength > 1 ? 1 / inputLength : 1;
          const forward = rawForward * scale;
          const strafe = rawStrafe * scale;

          const distance = speed * safeDt;
          const dx = (
            Math.sin(transform.angle) * forward +
            Math.cos(transform.angle) * strafe
          ) * distance;
          const dz = (
            -Math.cos(transform.angle) * forward +
            Math.sin(transform.angle) * strafe
          ) * distance;

          const previousVerticalVelocity = Number(transform.verticalVelocity) || 0;
          const verticalVelocity = Math.max(
            -CHARACTER_MAX_FALL_SPEED,
            previousVerticalVelocity - CHARACTER_GRAVITY * safeDt,
          );
          const dy = verticalVelocity * safeDt;
          const beforeMove = { x: transform.x, y: transform.y, z: transform.z };
          let moved = physics.move(entityId, dx, dz, dy);

          // Do not let Rapier silently slide a human around loot crates when the
          // player only asked to walk straight. Preserve vertical correction, but
          // cancel the horizontal slide. A deliberate strafe still works.
          if (!entity.bot
            && Math.abs(rawStrafe) <= 0.08
            && Math.hypot(dx, dz) > 0.01
            && hasStickyObstacleCollision(moved)) {
            const current = physics.position(entityId);
            physics.teleport(entityId, {
              x: beforeMove.x,
              y: current?.y ?? beforeMove.y,
              z: beforeMove.z,
            });
            moved = { ...moved, x: 0, z: 0 };
          }

          transform.grounded = Boolean(moved.grounded);
          transform.verticalVelocity = moved.grounded ? 0 : verticalVelocity;

          const pos = physics.position(entityId);
          if (pos) {
            transform.x = pos.x;
            transform.y = Math.abs(pos.y) < 0.0001 ? 0 : pos.y;
            transform.z = pos.z;
          }

          if (!entity.bot) {
            const attempted = { x: dx, y: dy, z: dz };
            const rapierBlockage = blockageFromRapier(attempted, moved);
            const supportCorrection = !rapierBlockage && hasOnlyNavigableSupportCollisions(moved);
            const blockage = rapierBlockage
              ?? (!supportCorrection && typeof map.describeBlockedMove === "function"
                ? map.describeBlockedMove(
                  { x: transform.x, y: transform.y, z: transform.z },
                  attempted,
                  moved,
                )
                : null);
            if (blockage) {
              const key = blockageKey(blockage);
              if (blockedEntities.get(entityId) !== key) {
                blockedEntities.set(entityId, key);
                ctx.events.emit("movement:blocked", {
                  recipientId: entityId,
                  kind: blockage.kind,
                  speech: blockage.speech,
                  objectId: blockage.objectId ?? null,
                  objectName: blockage.objectName ?? null,
                  now,
                });
              }
            } else {
              blockedEntities.delete(entityId);
            }
          }

          const horizontalMoved = Math.hypot(moved.x, moved.z);
          if (horizontalMoved < 0.0001) continue;
          transform.stepDistance += horizontalMoved;
          const threshold = input.sprint ? 1.15 : 1.55;
          if (transform.stepDistance >= threshold) {
            transform.stepDistance %= threshold;
            const gait = input.sprint ? "run" : "walk";
            const surface = normalizeFootstepSurface(
              typeof map.surfaceAt === "function"
                ? map.surfaceAt({ x: transform.x, y: transform.y, z: transform.z })
                : map.defaultSurface,
            );
            const configuredCount = typeof map.footstepVariantCount === "function"
              ? Number(map.footstepVariantCount(surface, gait))
              : FOOTSTEP_VARIANT_COUNT;
            const variantCount = Math.max(1, Math.floor(configuredCount || FOOTSTEP_VARIANT_COUNT));
            transform.stepIndex = (transform.stepIndex % variantCount) + 1;
            ctx.events.emit("sound:spatial", {
              entityId,
              key: footstepKey(surface, transform.stepIndex),
              surface,
              gait,
              variant: transform.stepIndex,
              acousticZone: typeof map.acousticZoneAt === "function"
                ? map.acousticZoneAt(transform)
                : "outdoor",
              x: transform.x,
              y: transform.y,
              z: transform.z,
              radius: input.sprint ? FOOTSTEP_SPRINT_RADIUS : FOOTSTEP_WALK_RADIUS,
            });
          }
        }
      } finally {
        physics.endBatch?.();
      }
    },
  };

  ctx.services.provide("movement", api);
}
