export const manifest = {
  id: "developer-settings",
  version: "1.1.0",
  requires: [
    "battle-royale-ragdoll-tuning",
    "battle-royale-ragdoll-stability",
    "battle-royale-ragdoll",
    "battle-royale-parkour-ragdoll",
    "battle-royale-parachute",
    "entities",
    "social",
    "match-api",
    "rapier-physics",
  ],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "components.write",
    "events.on",
  ],
};

const RAGDOLL_FIELDS = Object.freeze({
  linearDamping: {
    label: "Линейное затухание",
    min: 0, max: 0.15, step: 0.001,
    description: "Насколько быстро тело теряет обычную скорость полёта. Меньше — дольше летит, больше — быстрее тормозит.",
    priority: "advanced",
  },
  angularDamping: {
    label: "Угловое затухание",
    min: 0, max: 0.25, step: 0.001,
    description: "Как быстро прекращаются кувырки. Меньше — тело дольше вращается, больше — быстрее успокаивается.",
    priority: "recommended",
  },
  headAngularDamping: {
    label: "Затухание вращения головы",
    min: 0, max: 0.30, step: 0.001,
    description: "Отдельное затухание вращения головы. Обычно лучше оставить близко к исходному значению.",
    priority: "advanced",
  },
  friction: {
    label: "Трение",
    min: 0.12, max: 1, step: 0.01,
    description: "Как сильно тело цепляется за землю и стены. Меньше — больше скользит после падения, больше — быстрее останавливается.",
    priority: "recommended",
  },
  x: {
    label: "Кувырок вперёд и назад",
    min: 0, max: 12, step: 0.05,
    description: "Базовая сила вращения по первой оси ragdoll.",
    priority: "recommended",
  },
  y: {
    label: "Разворот вокруг себя",
    min: 0, max: 3, step: 0.05,
    description: "Базовая сила вращения вокруг вертикальной оси.",
    priority: "normal",
  },
  z: {
    label: "Боковой переворот",
    min: 0, max: 12, step: 0.05,
    description: "Базовая сила вращения по второй горизонтальной оси ragdoll.",
    priority: "recommended",
  },
  scaleStartKph: {
    label: "С какой скорости усиливать вращение, км/ч",
    min: 0, max: 180, step: 1,
    description: "До этой скорости дополнительного усиления почти нет. После неё вращение начинает расти.",
    priority: "normal",
  },
  scaleSpanKph: {
    label: "Насколько плавно усиливать вращение, км/ч",
    min: 20, max: 320, step: 1,
    description: "Меньше — усиление приходит резко, больше — нарастает плавнее по мере роста скорости.",
    priority: "normal",
  },
  scaleMaxExtra: {
    label: "Максимальное усиление от скорости",
    min: 0, max: 3, step: 0.05,
    description: "Ограничивает, насколько скорость может усилить базовое вращение.",
    priority: "recommended",
  },
  parkourSpinMultiplier: {
    label: "Множитель вращения позы C",
    min: 0, max: 3, step: 0.05,
    description: "Только для позы паркура по C. 1 — штатное сальто, 0 — убрать дополнительное вращение, 2 — удвоить.",
    priority: "recommended",
  },
  speedMode: {
    label: "Какая скорость усиливает вращение",
    type: "select",
    options: ["none", "horizontal", "vertical", "total"],
    description: "Для машины обычно подходит скорость по земле, для падения — полная или вертикальная.",
    priority: "normal",
  },
});

const PARACHUTE_FIELDS = Object.freeze({
  canopyGlideMultiplier: {
    label: "Скорость планирования под куполом",
    min: 0.25, max: 2.5, step: 0.05,
    description: "Множитель горизонтальной скорости под раскрытым парашютом. 1 — штатно, 0.5 — примерно вдвое медленнее, 2 — примерно вдвое быстрее.",
    priority: "recommended",
  },
  freefallControlMultiplier: {
    label: "Горизонтальное управление в свободном падении",
    min: 0, max: 2.5, step: 0.05,
    description: "Множитель перемещения вперёд и в стороны до раскрытия парашюта. 0 убирает горизонтальное управление, 1 оставляет штатное.",
    priority: "recommended",
  },
  windMultiplier: {
    label: "Влияние ветра",
    min: 0, max: 3, step: 0.05,
    description: "Множитель ветра. 0 отключает снос ветром, 1 оставляет штатный, значения больше 1 усиливают снос.",
    priority: "normal",
  },
  descentMultiplier: {
    label: "Скорость снижения",
    min: 0.35, max: 2.5, step: 0.05,
    description: "Множитель вертикальной скорости вниз. Меньше 1 — медленнее снижаешься, больше 1 — быстрее.",
    priority: "recommended",
  },
});

const ALL_RAGDOLL_FIELDS = Object.freeze(Object.keys(RAGDOLL_FIELDS));
const PARKOUR_EFFECTIVE_FIELDS = Object.freeze([
  "linearDamping",
  "angularDamping",
  "headAngularDamping",
  "friction",
  "parkourSpinMultiplier",
]);

export async function setup(ctx) {
  const tuning = ctx.services.get("ragdoll-tuning");
  const social = ctx.services.get("social");
  const matchApi = ctx.services.get("match-api");
  const physics = ctx.services.get("physics");
  const world = physics.world;
  const parachute = ctx.services.get("parachute");
  const stability = ctx.services.get("ragdoll-stability");
  const ragdoll = ctx.services.get("ragdoll");
  const parkour = ctx.services.get("parkour-ragdoll");
  const entities = ctx.services.get("entities");
  let revision = 1;
  let lastMessage = "Режим разработчика готов";
  let lastError = null;
  const lastAppliedRagdoll = new Map();
  const parkourBodies = new Map();
  const recentBodies = [];
  let parkourSpinMultiplier = 1;
  let parachuteTuning = {
    canopyGlideMultiplier: 1,
    freefallControlMultiplier: 1,
    windMultiplier: 1,
    descentMultiplier: 1,
  };

  const originalCreateRigidBody = world.createRigidBody.bind(world);
  world.createRigidBody = (descriptor) => {
    const body = originalCreateRigidBody(descriptor);
    recentBodies.push(body);
    if (recentBodies.length > 64) recentBodies.splice(0, recentBodies.length - 64);
    return body;
  };

  const originalParachutePrepareMovement = parachute.prepareMovement.bind(parachute);
  parachute.prepareMovement = (dt, now = Date.now()) => {
    const result = originalParachutePrepareMovement(dt, now);

    for (const entity of entities.all()) {
      if (!entity?.alive || entity.bot || entity.kind !== "human") continue;
      const state = ctx.components.get(entity.id, "Parachute");
      const transform = ctx.components.get(entity.id, "Transform");
      const input = ctx.components.get(entity.id, "Input");
      if (!state?.airborne || !transform) continue;

      const oldSimulatedVertical = Number(state.simulatedVerticalVelocity) || 0;
      const movementVerticalOffset = (Number(transform.verticalVelocity) || 0) - oldSimulatedVertical;
      const downward = Math.max(0, -oldSimulatedVertical);
      const tunedDownward = downward * parachuteTuning.descentMultiplier;
      state.simulatedVerticalVelocity = -tunedDownward;
      transform.verticalVelocity = state.simulatedVerticalVelocity + movementVerticalOffset;

      state.windX = (Number(state.windX) || 0) * parachuteTuning.windMultiplier;
      state.windZ = (Number(state.windZ) || 0) * parachuteTuning.windMultiplier;
      state.windSpeed = Math.max(0, Number(state.windSpeed) || 0) * parachuteTuning.windMultiplier;

      if (state.phase === "deployed") {
        state.glideSpeed = Math.max(0, Number(state.glideSpeed) || 0) * parachuteTuning.canopyGlideMultiplier;
        if (Number.isFinite(Number(state.rapierGlideSpeed))) {
          state.rapierGlideSpeed = Math.max(0, Number(state.rapierGlideSpeed) || 0)
            * parachuteTuning.canopyGlideMultiplier;
        }
        if (input) {
          input.forward = Math.max(-1, Math.min(
            1,
            (Number(input.forward) || 0) * parachuteTuning.canopyGlideMultiplier,
          ));
        }
      } else {
        state.freefallVelocityX = (Number(state.freefallVelocityX) || 0)
          * parachuteTuning.freefallControlMultiplier;
        state.freefallVelocityZ = (Number(state.freefallVelocityZ) || 0)
          * parachuteTuning.freefallControlMultiplier;
        state.glideSpeed = Math.max(0, Number(state.glideSpeed) || 0)
          * parachuteTuning.freefallControlMultiplier;
      }

      const horizontalSpeed = state.phase === "deployed"
        ? Math.max(0, Number(state.rapierGlideSpeed) || Number(state.glideSpeed) || 0)
        : Math.hypot(Number(state.freefallVelocityX) || 0, Number(state.freefallVelocityZ) || 0);
      state.airSpeed = Math.hypot(
        tunedDownward,
        horizontalSpeed,
        Math.max(0, Number(state.windSpeed) || 0),
      );
    }

    return result;
  };

  function ragdollStabilitySnapshot() {
    const summary = stability.summary();
    return {
      selfCollisionEnabled: Boolean(summary.selfCollisionEnabled),
      activeGroups: Number(summary.activeGroups) || 0,
      groupedBodies: Number(summary.groupedBodies) || 0,
      active: Array.isArray(summary.active) ? summary.active.map((group) => ({
        id: group.id,
        bodies: Number(group.bodies) || 0,
        peakSpread: Number(group.peakSpread) || 0,
        peakSpeed: Number(group.peakSpeed) || 0,
        peakRawSpeed: Number(group.peakRawSpeed) || 0,
        peakRawUpwardSpeed: Number(group.peakRawUpwardSpeed) || 0,
        energyClamps: Number(group.energyClamps) || 0,
        nonFinite: Boolean(group.nonFinite),
        intraGroupContacts: Number(group.intraGroupContacts) || 0,
      })) : [],
    };
  }

  function parachuteSnapshotFor(playerId) {
    const state = parachute.stateFor(playerId);
    const internal = ctx.components.get(playerId, "Parachute");
    return {
      tuning: { ...parachuteTuning },
      state: state ? {
        phase: state.phase,
        airborne: Boolean(state.airborne),
        altitude: Number(state.altitude) || 0,
        verticalVelocity: Number(state.verticalVelocity) || 0,
        downwardSpeed: Math.max(0, -(Number(internal?.simulatedVerticalVelocity) || 0)),
        glideSpeed: Number(state.glideSpeed) || 0,
        freefallHorizontalSpeed: Math.hypot(
          Number(internal?.freefallVelocityX) || 0,
          Number(internal?.freefallVelocityZ) || 0,
        ),
        airSpeed: Number(state.airSpeed) || 0,
        windSpeed: Number(state.windSpeed) || 0,
        inflation: Number(state.inflation) || 0,
        landingApproach: Boolean(state.landingApproach),
      } : null,
    };
  }

  function bodyCenter(bodies) {
    let totalMass = 0;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const body of bodies) {
      const mass = Math.max(0, Number(body?.mass?.()) || 0);
      const position = body?.translation?.();
      if (!(mass > 0) || !position) continue;
      totalMass += mass;
      x += position.x * mass;
      y += position.y * mass;
      z += position.z * mass;
    }
    if (!(totalMass > 0)) return { x: 0, y: 0, z: 0 };
    return { x: x / totalMass, y: y / totalMass, z: z / totalMass };
  }

  function cross(omega, offset) {
    return {
      x: omega.y * offset.z - omega.z * offset.y,
      y: omega.z * offset.x - omega.x * offset.z,
      z: omega.x * offset.y - omega.y * offset.x,
    };
  }

  function averageAngularVelocity(bodies) {
    if (!bodies.length) return { x: 0, y: 0, z: 0 };
    let x = 0;
    let y = 0;
    let z = 0;
    let count = 0;
    for (const body of bodies) {
      const angular = body?.angvel?.();
      if (!angular) continue;
      x += Number(angular.x) || 0;
      y += Number(angular.y) || 0;
      z += Number(angular.z) || 0;
      count += 1;
    }
    if (!count) return { x: 0, y: 0, z: 0 };
    return { x: x / count, y: y / count, z: z / count };
  }

  function setCoherentSpin(bodies, omega) {
    if (!bodies.length) return null;
    const center = bodyCenter(bodies);
    const current = averageAngularVelocity(bodies);
    const deltaOmega = {
      x: (Number(omega.x) || 0) - current.x,
      y: (Number(omega.y) || 0) - current.y,
      z: (Number(omega.z) || 0) - current.z,
    };

    for (const body of bodies) {
      body.setAngvel({
        x: Number(omega.x) || 0,
        y: Number(omega.y) || 0,
        z: Number(omega.z) || 0,
      }, true);

      const position = body.translation();
      const offset = {
        x: position.x - center.x,
        y: position.y - center.y,
        z: position.z - center.z,
      };
      const delta = cross(deltaOmega, offset);
      const linear = body.linvel();
      body.setLinvel({
        x: (Number(linear.x) || 0) + delta.x,
        y: (Number(linear.y) || 0) + delta.y,
        z: (Number(linear.z) || 0) + delta.z,
      }, true);
    }

    return {
      bodies: bodies.length,
      omega: { ...omega },
      angularSpeed: Math.hypot(
        Number(omega.x) || 0,
        Number(omega.y) || 0,
        Number(omega.z) || 0,
      ),
    };
  }

  function applyParkourTestSpin(entityId, angle = 0) {
    const bodies = parkourBodies.get(entityId) ?? [];
    const baseSpeed = Math.max(
      0,
      Number(parkour.summary?.()?.thresholds?.parkourFlipSpeed) || 8.8,
    );
    const speed = baseSpeed * parkourSpinMultiplier;
    const a = Number(angle) || 0;
    const omega = {
      x: Math.cos(a) * speed,
      y: 0,
      z: Math.sin(a) * speed,
    };
    const result = setCoherentSpin(bodies, omega);
    const previous = lastAppliedRagdoll.get(entityId);
    if (previous) {
      lastAppliedRagdoll.set(entityId, {
        ...previous,
        parkourSpinMultiplier,
        parkourOverlay: result ? {
          multiplier: parkourSpinMultiplier,
          bodies: result.bodies,
          angularSpeed: result.angularSpeed,
          testLaunch: true,
        } : null,
      });
    }
    return result;
  }

  function applyParkourSpinMultiplier(entityId) {
    const bodies = parkourBodies.get(entityId) ?? [];
    if (!bodies.length || Math.abs(parkourSpinMultiplier - 1) < 0.0001) return null;
    const center = bodyCenter(bodies);
    const reference = bodies[0]?.angvel?.();
    if (!reference) return null;
    const deltaOmega = {
      x: (Number(reference.x) || 0) * (parkourSpinMultiplier - 1),
      y: (Number(reference.y) || 0) * (parkourSpinMultiplier - 1),
      z: (Number(reference.z) || 0) * (parkourSpinMultiplier - 1),
    };
    for (const body of bodies) {
      const angular = body.angvel();
      body.setAngvel({
        x: (Number(angular.x) || 0) * parkourSpinMultiplier,
        y: (Number(angular.y) || 0) * parkourSpinMultiplier,
        z: (Number(angular.z) || 0) * parkourSpinMultiplier,
      }, true);
      const position = body.translation();
      const offset = {
        x: position.x - center.x,
        y: position.y - center.y,
        z: position.z - center.z,
      };
      const delta = cross(deltaOmega, offset);
      const linear = body.linvel();
      body.setLinvel({
        x: (Number(linear.x) || 0) + delta.x,
        y: (Number(linear.y) || 0) + delta.y,
        z: (Number(linear.z) || 0) + delta.z,
      }, true);
    }
    return {
      multiplier: parkourSpinMultiplier,
      bodies: bodies.length,
      angularSpeed: Math.hypot(
        Number(reference.x) || 0,
        Number(reference.y) || 0,
        Number(reference.z) || 0,
      ) * parkourSpinMultiplier,
    };
  }

  function requireHost(playerId) {
    if (!social.isHost(playerId)) throw new Error("Режим разработчика доступен только организатору комнаты");
  }

  function effectiveFieldsFor(reason) {
    return reason === "parkour-pose" ? PARKOUR_EFFECTIVE_FIELDS : ALL_RAGDOLL_FIELDS;
  }

  function catalog(playerId) {
    requireHost(playerId);
    return {
      revision,
      categories: [{
        id: "ragdoll",
        label: "Ragdoll",
        note: "Изменения действуют на следующие активации ragdoll. Для позы паркура по C отдельный модуль игры задаёт собственное вращение, поэтому здесь показаны только реально влияющие параметры.",
        reasons: tuning.reasons(),
        fields: RAGDOLL_FIELDS,
        effectiveFieldsByReason: Object.fromEntries(
          tuning.reasons().map((reason) => [reason, effectiveFieldsFor(reason)]),
        ),
        profiles: (() => {
          const profiles = tuning.profiles();
          profiles["parkour-pose"] = {
            ...profiles["parkour-pose"],
            parkourSpinMultiplier,
          };
          return profiles;
        })(),
      }, {
        id: "ragdoll-stability",
        label: "Стабильность Ragdoll",
        note: "Самоколлизия — это столкновения частей одного ragdoll между собой. Отключение обычно делает физику спокойнее и устойчивее, включение даёт больше внутренних столкновений.",
        fields: {
          selfCollisionEnabled: {
            label: "Самоколлизия частей тела",
            type: "boolean",
            description: "Включено — части одного ragdoll могут сталкиваться друг с другом. Выключено — внутренние столкновения отключаются, но суставы продолжают работать.",
            priority: "recommended",
          },
        },
        values: {
          selfCollisionEnabled: stability.isSelfCollisionEnabled(),
        },
        diagnostics: stability.summary(),
      }, {
        id: "parachute",
        label: "Парашют",
        note: "Эти четыре множителя накладываются временным dev-модулем поверх уже готовой логики парашюта. Удаление dev-модуля полностью возвращает штатное поведение.",
        fields: PARACHUTE_FIELDS,
        values: { ...parachuteTuning },
      }],
    };
  }

  function appliedRagdollFor(playerId) {
    const active = tuning.stateFor(playerId);
    const stored = lastAppliedRagdoll.get(playerId) ?? null;
    const value = active
      ? { ...(stored ?? {}), ...active, parkourOverlay: stored?.parkourOverlay ?? null }
      : stored;
    if (!value) return null;
    return {
      ...value,
      active: Boolean(active),
      parkourRotationOverridden: value.reason === "parkour-pose",
      parkourSpinMultiplier: value.reason === "parkour-pose" ? parkourSpinMultiplier : null,
      parkourNote: value.reason === "parkour-pose"
        ? "Штатное вращение позы паркура дополнительно масштабировано временным dev-модулем. Множитель: " + parkourSpinMultiplier + "."
        : null,
    };
  }

  ctx.events.on("ragdoll:started", ({ entityId }) => {
    const state = tuning.stateFor(entityId);
    const bodies = recentBodies.slice(-16);
    recentBodies.length = 0;
    if (bodies.length === 16) parkourBodies.set(entityId, bodies);
    if (!state) return;
    lastAppliedRagdoll.set(entityId, {
      ...state,
      profile: { ...state.profile },
      tumble: { ...state.tumble },
    });
  });

  ctx.events.on("ragdoll:parkour-pose", ({ entityId }) => {
    const overlay = applyParkourSpinMultiplier(entityId);
    const previous = lastAppliedRagdoll.get(entityId);
    if (previous) {
      lastAppliedRagdoll.set(entityId, {
        ...previous,
        parkourSpinMultiplier,
        parkourOverlay: overlay,
      });
    }
  });

  ctx.events.on("ragdoll:ended", ({ entityId }) => {
    const current = tuning.stateFor(entityId);
    if (current) {
      const previous = lastAppliedRagdoll.get(entityId) ?? {};
      lastAppliedRagdoll.set(entityId, {
        ...previous,
        ...current,
        profile: { ...current.profile },
        tumble: { ...current.tumble },
        parkourOverlay: previous.parkourOverlay ?? null,
      });
    }
    parkourBodies.delete(entityId);
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    lastAppliedRagdoll.delete(entityId);
    parkourBodies.delete(entityId);
  });

  function execute(playerId, command = {}) {
    requireHost(playerId);
    const action = String(command.action ?? "");
    try {
      let result;
      if (action === "set-ragdoll-profile") {
        const patch = { ...(command.patch ?? {}) };
        if (command.reason === "parkour-pose" && Object.hasOwn(patch, "parkourSpinMultiplier")) {
          parkourSpinMultiplier = Math.max(0, Math.min(3, Number(patch.parkourSpinMultiplier) || 0));
          delete patch.parkourSpinMultiplier;
        }
        result = tuning.configureReason(command.reason, patch);
        lastMessage = "Параметры Ragdoll применены";
      } else if (action === "reset-ragdoll-profile") {
        result = tuning.resetReason(command.reason);
        if (command.reason === "parkour-pose") parkourSpinMultiplier = 1;
        lastMessage = "Профиль Ragdoll сброшен";
      } else if (action === "reset-all-ragdoll") {
        result = tuning.reset();
        parkourSpinMultiplier = 1;
        lastMessage = "Все профили Ragdoll сброшены";
      } else if (action === "test-ragdoll") {
        const reason = String(command.reason ?? "default");
        const height = Math.max(2, Math.min(20, Number(command.height) || 8));
        const speed = Math.max(0, Math.min(20, Number(command.speed) || 6));
        const entity = entities.get(playerId);
        const transform = ctx.components.get(playerId, "Transform");
        if (!entity?.alive || !transform) throw new Error("Игрок недоступен для теста Ragdoll");
        if (ragdoll.isActive(playerId)) throw new Error("Ragdoll уже активен");

        const angle = Number(transform.angle) || 0;
        const velocity = {
          x: Math.sin(angle) * speed,
          y: 0,
          z: -Math.cos(angle) * speed,
        };
        const activated = ragdoll.activate(playerId, {
          reason,
          position: {
            x: Number(transform.x) || 0,
            y: (Number(transform.y) || 0) + height,
            z: Number(transform.z) || 0,
          },
          angle,
          velocity,
        }, Date.now());
        if (!activated) throw new Error("Не удалось запустить тестовый Ragdoll");
        const parkourSpin = reason === "parkour-pose"
          ? applyParkourTestSpin(playerId, angle)
          : null;
        result = {
          reason,
          height,
          speed,
          parkourSpin,
          applied: appliedRagdollFor(playerId),
        };
        lastMessage = "Тестовый Ragdoll запущен с высоты " + height + " м";
      } else if (action === "set-ragdoll-stability") {
        const enabled = Boolean(command.patch?.selfCollisionEnabled);
        stability.setSelfCollisionEnabled(enabled);
        result = {
          selfCollisionEnabled: stability.isSelfCollisionEnabled(),
          diagnostics: stability.summary(),
        };
        lastMessage = enabled
          ? "Самоколлизия Ragdoll включена"
          : "Самоколлизия Ragdoll выключена";
      } else if (action === "reset-ragdoll-stability") {
        stability.setSelfCollisionEnabled(true);
        result = {
          selfCollisionEnabled: stability.isSelfCollisionEnabled(),
          diagnostics: stability.summary(),
        };
        lastMessage = "Стабильность Ragdoll сброшена";
      } else if (action === "set-parachute") {
        const patch = command.patch ?? {};
        parachuteTuning = {
          canopyGlideMultiplier: Math.max(0.25, Math.min(
            2.5,
            Number(patch.canopyGlideMultiplier ?? parachuteTuning.canopyGlideMultiplier) || 0.25,
          )),
          freefallControlMultiplier: Math.max(0, Math.min(
            2.5,
            Number(patch.freefallControlMultiplier ?? parachuteTuning.freefallControlMultiplier) || 0,
          )),
          windMultiplier: Math.max(0, Math.min(
            3,
            Number(patch.windMultiplier ?? parachuteTuning.windMultiplier) || 0,
          )),
          descentMultiplier: Math.max(0.35, Math.min(
            2.5,
            Number(patch.descentMultiplier ?? parachuteTuning.descentMultiplier) || 0.35,
          )),
        };
        result = { ...parachuteTuning };
        lastMessage = "Параметры парашюта применены";
      } else if (action === "reset-parachute") {
        parachuteTuning = {
          canopyGlideMultiplier: 1,
          freefallControlMultiplier: 1,
          windMultiplier: 1,
          descentMultiplier: 1,
        };
        result = { ...parachuteTuning };
        lastMessage = "Параметры парашюта сброшены";
      } else {
        throw new Error("Неизвестная команда режима разработчика");
      }
      revision += 1;
      lastError = null;
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      revision += 1;
      throw error;
    }
  }

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    const command = input?.developerSettings;
    if (!command) return originalHandleInput(playerId, input, now);

    execute(playerId, command);
    const gameplayInput = { ...input };
    delete gameplayInput.developerSettings;
    if (Object.keys(gameplayInput).length > 0) {
      return originalHandleInput(playerId, gameplayInput, now);
    }
    return true;
  };

  const originalSnapshotFor = matchApi.snapshotFor?.bind(matchApi) ?? null;
  if (originalSnapshotFor) {
    matchApi.snapshotFor = (playerId, now = Date.now()) => {
      const base = originalSnapshotFor(playerId, now);
      if (!social.isHost(playerId)) return base;
      return {
        ...base,
        developerSettings: {
          enabled: true,
          revision,
          message: lastMessage,
          error: lastError,
          catalog: catalog(playerId),
          appliedRagdoll: appliedRagdollFor(playerId),
          ragdollStability: ragdollStabilitySnapshot(),
          parachute: parachuteSnapshotFor(playerId),
        },
      };
    };
  }

  ctx.services.provide("developer-settings", {
    catalog,
    execute,
    appliedRagdollFor,
    ragdollStabilitySnapshot,
    parachuteSnapshotFor,
  });
}
