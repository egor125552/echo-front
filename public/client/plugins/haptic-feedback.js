export const HAPTICS_ENABLED_KEY = "echo-front.haptics-enabled";
export const HAPTICS_INTENSITY_KEY = "echo-front.haptics-intensity";
export const DEFAULT_INTENSITY = 1;
export const BURST_WINDOW_MS = 260;
export const CRITICAL_DAMAGE_AMOUNT = 45;
export const CRITICAL_HEALTH_RATIO = 0.35;

export const HAPTIC_PRIORITY = Object.freeze({
  LOW: 1,
  ACTION: 2,
  HIGH: 3,
  BREAK: 4,
  CRITICAL: 5,
  FATAL: 6,
});

export const HAPTIC_PATTERNS = Object.freeze({
  shotSinglePistol: Object.freeze({ vibrate: 28, gamepad: Object.freeze({ duration: 42, weak: 0.16, strong: 0.42 }) }),
  shotSingleRifle: Object.freeze({ vibrate: 22, gamepad: Object.freeze({ duration: 46, weak: 0.22, strong: 0.50 }) }),
  shotBurstEntry: Object.freeze({
    vibrate: Object.freeze([10, 18, 10, 18, 10]),
    gamepad: Object.freeze({ duration: 48, weak: 0.44, strong: 0.22 }),
  }),
  shotBurstSustained: Object.freeze({
    vibrate: Object.freeze([11, 18, 11]),
    gamepad: Object.freeze({ duration: 36, weak: 0.42, strong: 0.20 }),
  }),
  damageArmorBreak: Object.freeze({
    vibrate: Object.freeze([85, 30, 150, 35, 95]),
    gamepad: Object.freeze({ duration: 360, weak: 0.85, strong: 0.96 }),
  }),
  damageCritical: Object.freeze({
    vibrate: Object.freeze([130, 35, 160, 40, 110]),
    gamepad: Object.freeze({ duration: 420, weak: 0.72, strong: 1.0 }),
  }),
  injuryDowned: Object.freeze({
    vibrate: Object.freeze([140, 45, 175, 45, 120]),
    gamepad: Object.freeze({ duration: 450, weak: 0.68, strong: 1.0 }),
  }),
  damageKilled: Object.freeze({
    vibrate: Object.freeze([150, 45, 210, 50, 140]),
    gamepad: Object.freeze({ duration: 450, weak: 0.75, strong: 1.0 }),
  }),
  hitConfirm: Object.freeze({ vibrate: 14, gamepad: Object.freeze({ duration: 28, weak: 0.34, strong: 0.12 }) }),
  hitConfirmBreak: Object.freeze({
    vibrate: Object.freeze([16, 22, 24]),
    gamepad: Object.freeze({ duration: 68, weak: 0.55, strong: 0.28 }),
  }),
  hitConfirmKill: Object.freeze({
    vibrate: Object.freeze([18, 24, 34]),
    gamepad: Object.freeze({ duration: 82, weak: 0.60, strong: 0.36 }),
  }),
  zoneDamage: Object.freeze({
    vibrate: Object.freeze([28, 40, 28]),
    gamepad: Object.freeze({ duration: 75, weak: 0.32, strong: 0.22 }),
  }),
  armorPlated: Object.freeze({ vibrate: 24, gamepad: Object.freeze({ duration: 42, weak: 0.30, strong: 0.18 }) }),
  injuryStim: Object.freeze({
    vibrate: Object.freeze([20, 32, 32]),
    gamepad: Object.freeze({ duration: 55, weak: 0.34, strong: 0.20 }),
  }),
});

export const manifest = {
  id: "haptic-feedback",
  requires: ["cloudflare-session"],
};

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function clampIntensity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_INTENSITY;
  return Math.max(0.2, Math.min(1, Math.round(numeric * 10) / 10));
}

export function scaleVibratePattern(pattern, intensity = 1) {
  const level = clampIntensity(intensity);
  if (Array.isArray(pattern)) {
    return pattern
      .map((segment, index) => {
        const raw = Math.max(0, Math.round(Number(segment) || 0));
        if (raw <= 0) return 0;
        if (index % 2 === 1) {
          return Math.max(18, Math.min(500, Math.round(raw * (0.65 + 0.35 * level))));
        }
        return Math.max(8, Math.min(500, Math.round(raw * level)));
      })
      .filter((segment) => segment > 0);
  }
  const single = Math.max(0, Math.round(Number(pattern) || 0));
  if (single <= 0) return 0;
  return Math.max(8, Math.min(500, Math.round(single * level)));
}

export function patternDurationMs(pattern) {
  if (Array.isArray(pattern)) {
    return pattern.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  }
  return Math.max(0, Number(pattern) || 0);
}

export function activeGamepad() {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
  const pads = Array.from(navigator.getGamepads() ?? []).filter(Boolean);
  return pads.find((pad) => pad.mapping === "standard") ?? pads[0] ?? null;
}

export function gamepadHasHaptics(pad = activeGamepad()) {
  return Boolean(pad?.vibrationActuator || pad?.hapticActuators?.length);
}

export function vibrationApiSupported() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export async function playGamepadRumble({ duration = 80, weak = 0.2, strong = 0.5 } = {}, intensity = 1) {
  const gamepad = activeGamepad();
  if (!gamepad) return false;
  const level = clampIntensity(intensity);
  const safeDuration = Math.max(10, Math.min(450, Number(duration) || 80));
  const weakMagnitude = clamp01((Number(weak) || 0) * level);
  const strongMagnitude = clamp01((Number(strong) || 0) * level);

  try {
    const actuator = gamepad.vibrationActuator;
    if (actuator?.playEffect) {
      await actuator.playEffect("dual-rumble", {
        startDelay: 0,
        duration: safeDuration,
        weakMagnitude,
        strongMagnitude,
      });
      return true;
    }
    if (actuator?.pulse) {
      await actuator.pulse(Math.max(weakMagnitude, strongMagnitude), safeDuration);
      return true;
    }

    const haptic = gamepad.hapticActuators?.[0];
    if (haptic?.pulse) {
      await haptic.pulse(Math.max(weakMagnitude, strongMagnitude), safeDuration);
      return true;
    }
  } catch {}
  return false;
}

export function impactStrength(payload = {}) {
  const forceSeverity = Number(payload.crashSeverity);
  if (Number.isFinite(forceSeverity) && forceSeverity > 0) return forceSeverity;
  return Math.max(
    0,
    Number(payload.deltaSpeed) || 0,
    Number(payload.impactSpeed) || 0,
    Number(payload.speedBefore) || 0,
    Number(payload.speed) || 0,
  );
}

export function createShotTracker(burstWindowMs = BURST_WINDOW_MS) {
  let lastWeaponId = null;
  let lastShotAt = -Infinity;
  let count = 0;

  return {
    nextShot(weaponId, now = 0) {
      const normalizedWeapon = weaponId ?? "pistol";
      const currentNow = Number(now) || 0;
      const withinBurst = normalizedWeapon === lastWeaponId
        && currentNow - lastShotAt <= burstWindowMs
        && count >= 1;
      count = withinBurst ? count + 1 : 1;
      lastWeaponId = normalizedWeapon;
      lastShotAt = currentNow;
      const mode = count === 1
        ? "single"
        : count === 2
          ? "burst-entry"
          : "burst-sustained";
      return { mode, count };
    },
    onFireStop() {
      lastShotAt = -Infinity;
      count = 0;
    },
    reset() {
      lastWeaponId = null;
      lastShotAt = -Infinity;
      count = 0;
    },
  };
}

export function createHapticArbitrator() {
  let activePriority = 0;
  let activeUntil = -Infinity;
  const lastByKind = new Map();

  return {
    shouldPlay({ kind, priority = HAPTIC_PRIORITY.ACTION, cooldownMs = 0, durationMs = 0 } = {}, now = 0) {
      const key = String(kind ?? "default");
      const lastAt = lastByKind.get(key) ?? -Infinity;
      if (now - lastAt < Math.max(0, Number(cooldownMs) || 0)) {
        return false;
      }
      if (now < activeUntil && priority <= activePriority) {
        return false;
      }
      activePriority = priority;
      activeUntil = now + Math.max(0, Number(durationMs) || 0);
      lastByKind.set(key, now);
      return true;
    },
    reset() {
      activePriority = 0;
      activeUntil = -Infinity;
      lastByKind.clear();
    },
  };
}

export function hapticCueForGameEvent(packet, playerId, context = {}) {
  if (!packet?.event || !playerId) return null;
  const payload = packet.payload ?? {};

  if (packet.event === "weapon:fired" && payload.entityId === playerId) {
    const rifle = payload.weaponId === "rifle";
    const shotMode = context.shotMode ?? "single";
    if (shotMode === "burst-entry") {
      return {
        kind: "weapon:burst-entry",
        pattern: "burst",
        priority: HAPTIC_PRIORITY.ACTION,
        cooldownMs: 38,
        vibrate: [...HAPTIC_PATTERNS.shotBurstEntry.vibrate],
        gamepad: { ...HAPTIC_PATTERNS.shotBurstEntry.gamepad },
      };
    }
    if (shotMode === "burst-sustained") {
      return {
        kind: "weapon:burst-sustained",
        pattern: "burst",
        priority: HAPTIC_PRIORITY.ACTION,
        cooldownMs: 38,
        vibrate: [...HAPTIC_PATTERNS.shotBurstSustained.vibrate],
        gamepad: { ...HAPTIC_PATTERNS.shotBurstSustained.gamepad },
      };
    }
    const preset = rifle ? HAPTIC_PATTERNS.shotSingleRifle : HAPTIC_PATTERNS.shotSinglePistol;
    return {
      kind: rifle ? "weapon:rifle" : "weapon:pistol",
      pattern: "single",
      priority: HAPTIC_PRIORITY.ACTION,
      cooldownMs: 35,
      vibrate: preset.vibrate,
      gamepad: { ...preset.gamepad },
    };
  }

  if (packet.event === "combat:damage" && payload.targetId === playerId) {
    if (payload.spawnProtected || payload.friendProtected) return null;
    const healthApplied = Math.max(0, Number(payload.healthApplied) || 0);
    const armorAbsorbed = Math.max(0, Number(payload.armorAbsorbed) || 0);
    const damage = healthApplied + armorAbsorbed;
    if (damage <= 0 && !payload.killed && !payload.armorBroke) return null;

    const amount = clamp01(damage / 85);
    const ratio = context.remainingHealthRatio;
    const lowRemainingHealth = Number.isFinite(ratio) && healthApplied > 0 && ratio <= CRITICAL_HEALTH_RATIO;
    const criticalHit = Boolean(payload.critical) || damage >= CRITICAL_DAMAGE_AMOUNT || lowRemainingHealth;

    if (payload.killed) {
      return {
        kind: "damage:killed",
        pattern: "critical",
        priority: HAPTIC_PRIORITY.FATAL,
        cooldownMs: 200,
        allowAfterDeath: true,
        vibrate: [...HAPTIC_PATTERNS.damageKilled.vibrate],
        gamepad: { ...HAPTIC_PATTERNS.damageKilled.gamepad },
      };
    }

    if (payload.armorBroke) {
      return {
        kind: "damage:armor-break",
        pattern: "critical",
        priority: HAPTIC_PRIORITY.BREAK,
        cooldownMs: 70,
        vibrate: [...HAPTIC_PATTERNS.damageArmorBreak.vibrate],
        gamepad: { ...HAPTIC_PATTERNS.damageArmorBreak.gamepad },
      };
    }

    if (criticalHit) {
      return {
        kind: "damage:critical",
        pattern: "critical",
        priority: HAPTIC_PRIORITY.CRITICAL,
        cooldownMs: 140,
        vibrate: [...HAPTIC_PATTERNS.damageCritical.vibrate],
        gamepad: { ...HAPTIC_PATTERNS.damageCritical.gamepad },
      };
    }

    if (healthApplied <= 0 && armorAbsorbed > 0) {
      return {
        kind: "damage:armor",
        pattern: "damage",
        priority: HAPTIC_PRIORITY.HIGH,
        cooldownMs: 55,
        vibrate: Math.round(32 + amount * 36),
        gamepad: {
          duration: 60 + amount * 65,
          weak: 0.48 + amount * 0.35,
          strong: 0.24 + amount * 0.36,
        },
      };
    }

    return {
      kind: "damage:health",
      pattern: "damage",
      priority: HAPTIC_PRIORITY.HIGH,
      cooldownMs: 55,
      vibrate: Math.round(52 + amount * 55),
      gamepad: {
        duration: 75 + amount * 95,
        weak: 0.24 + amount * 0.40,
        strong: 0.42 + amount * 0.56,
      },
    };
  }

  if (
    packet.event === "combat:damage"
    && payload.attackerId === playerId
    && payload.targetId !== playerId
  ) {
    if (payload.spawnProtected || payload.friendProtected) return null;
    const damage = Math.max(
      0,
      (Number(payload.healthApplied) || 0) + (Number(payload.armorAbsorbed) || 0),
    );
    if (damage <= 0 && !payload.killed && !payload.armorBroke) return null;

    if (payload.killed) {
      return {
        kind: "hit-confirm:killed",
        pattern: "confirm",
        priority: HAPTIC_PRIORITY.HIGH,
        cooldownMs: 40,
        vibrate: [...HAPTIC_PATTERNS.hitConfirmKill.vibrate],
        gamepad: { ...HAPTIC_PATTERNS.hitConfirmKill.gamepad },
      };
    }

    if (payload.armorBroke) {
      return {
        kind: "hit-confirm:armor-break",
        pattern: "confirm",
        priority: HAPTIC_PRIORITY.HIGH,
        cooldownMs: 40,
        vibrate: [...HAPTIC_PATTERNS.hitConfirmBreak.vibrate],
        gamepad: { ...HAPTIC_PATTERNS.hitConfirmBreak.gamepad },
      };
    }

    return {
      kind: "hit-confirm",
      pattern: "confirm",
      priority: HAPTIC_PRIORITY.ACTION,
      cooldownMs: 45,
      vibrate: HAPTIC_PATTERNS.hitConfirm.vibrate,
      gamepad: { ...HAPTIC_PATTERNS.hitConfirm.gamepad },
    };
  }

  if (packet.event === "battle-royale:zone-damage" && payload.entityId === playerId) {
    return {
      kind: "zone:damage",
      pattern: "zone",
      priority: HAPTIC_PRIORITY.LOW,
      cooldownMs: 950,
      vibrate: [...HAPTIC_PATTERNS.zoneDamage.vibrate],
      gamepad: { ...HAPTIC_PATTERNS.zoneDamage.gamepad },
    };
  }

  if (packet.event === "injury:downed" && payload.entityId === playerId) {
    return {
      kind: "injury:downed",
      pattern: "critical",
      priority: HAPTIC_PRIORITY.CRITICAL,
      cooldownMs: 150,
      vibrate: [...HAPTIC_PATTERNS.injuryDowned.vibrate],
      gamepad: { ...HAPTIC_PATTERNS.injuryDowned.gamepad },
    };
  }

  if (packet.event === "armor:plating-completed" && payload.entityId === playerId) {
    return {
      kind: "armor:plated",
      pattern: "utility",
      priority: HAPTIC_PRIORITY.LOW,
      cooldownMs: 120,
      vibrate: HAPTIC_PATTERNS.armorPlated.vibrate,
      gamepad: { ...HAPTIC_PATTERNS.armorPlated.gamepad },
    };
  }

  if (packet.event === "injury:stim-completed" && payload.entityId === playerId) {
    return {
      kind: "injury:stim",
      pattern: "utility",
      priority: HAPTIC_PRIORITY.LOW,
      cooldownMs: 120,
      vibrate: [...HAPTIC_PATTERNS.injuryStim.vibrate],
      gamepad: { ...HAPTIC_PATTERNS.injuryStim.gamepad },
    };
  }

  if (packet.event === "vehicle:impact" && (payload.driverId === playerId || payload.entityId === playerId)) {
    const impact = impactStrength(payload);
    const forceBacked = payload.impactSource === "rapier-contact-force";
    const amount = forceBacked
      ? clamp01((impact - 1.25) / 24)
      : clamp01((impact - 2.5) / 14);
    if (amount <= 0) return null;
    const severeCrash = amount >= 0.68;
    return {
      kind: "vehicle:impact",
      pattern: severeCrash ? "critical" : "impact",
      priority: severeCrash ? HAPTIC_PRIORITY.CRITICAL : HAPTIC_PRIORITY.HIGH,
      cooldownMs: 70,
      vibrate: severeCrash
        ? [110, 32, Math.round(110 + amount * 90)]
        : Math.round(45 + amount * 110),
      gamepad: {
        duration: 85 + amount * 265,
        weak: 0.24 + amount * 0.65,
        strong: 0.40 + amount * 0.60,
      },
    };
  }

  if (packet.event === "parachute:obstacle-impact" && payload.entityId === playerId) {
    const impact = Math.max(0, Number(payload.speedBefore) || Number(payload.airSpeed) || 0);
    const amount = clamp01(impact / 12);
    return {
      kind: "parachute:impact",
      pattern: "impact",
      priority: HAPTIC_PRIORITY.HIGH,
      cooldownMs: 65,
      vibrate: Math.round(40 + amount * 90),
      gamepad: {
        duration: 70 + amount * 120,
        weak: 0.24 + amount * 0.35,
        strong: 0.35 + amount * 0.52,
      },
    };
  }

  if (String(packet.event).startsWith("ragdoll:") && payload.entityId === playerId) {
    const name = String(packet.event);
    if (!/(impact|collision|land|crash)/i.test(name)) return null;
    const impact = impactStrength(payload);
    const amount = clamp01(impact / 11);
    return {
      kind: "ragdoll:impact",
      pattern: "impact",
      priority: HAPTIC_PRIORITY.HIGH,
      cooldownMs: 55,
      vibrate: Math.round(40 + amount * 95),
      gamepad: {
        duration: 75 + amount * 145,
        weak: 0.20 + amount * 0.45,
        strong: 0.32 + amount * 0.62,
      },
    };
  }

  return null;
}

function nowTime() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function readStoredFlag(key, fallback = true) {
  try {
    const value = localStorage.getItem(key);
    if (value == null) return fallback;
    return value !== "false";
  } catch {
    return fallback;
  }
}

function readStoredIntensity(key) {
  try {
    return clampIntensity(localStorage.getItem(key) ?? DEFAULT_INTENSITY);
  } catch {
    return DEFAULT_INTENSITY;
  }
}

function canCallVibrate() {
  if (!vibrationApiSupported()) return false;
  if (typeof document !== "undefined" && document.hidden) return false;
  const activation = typeof navigator !== "undefined" ? navigator.userActivation : null;
  if (activation && activation.hasBeenActive === false && activation.isActive !== true) {
    return false;
  }
  return true;
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const enabledInput = document.querySelector("#haptics-enabled");
  const intensityInput = document.querySelector("#haptics-intensity");
  const intensityValue = document.querySelector("#haptics-intensity-value");
  const testPatternSelect = document.querySelector("#haptics-test-pattern");
  const testButton = document.querySelector("#haptics-test");
  const statusNode = document.querySelector("#haptics-status");

  let enabled = readStoredFlag(HAPTICS_ENABLED_KEY, true);
  let intensity = readStoredIntensity(HAPTICS_INTENSITY_KEY);
  let selfAlive = true;
  let selfHealth = null;
  let selfHealthMax = null;
  const arbitrator = createHapticArbitrator();
  const shotTracker = createShotTracker();

  function capabilities() {
    return {
      vibrate: vibrationApiSupported(),
      gamepad: gamepadHasHaptics(),
    };
  }

  function capabilityMessage({ tested = false, vibrated = false, rumbled = false } = {}) {
    const caps = capabilities();
    if (!enabled) return "Тактильная отдача отключена.";
    if (tested) {
      if (vibrated && rumbled) return "Проверка: сработали вибрация устройства и геймпада.";
      if (vibrated) return "Проверка: вибрация устройства сработала.";
      if (rumbled) return "Проверка: виброотдача геймпада сработала.";
      if (caps.vibrate) return "Браузер заблокировал вибрацию — нажмите ещё раз или проверьте системные настройки устройства.";
      return "В этом браузере вибрация экрана недоступна (Apple Safari не поддерживает Web Vibration API), но отдача сработает при подключении геймпада.";
    }
    if (caps.vibrate && caps.gamepad) return "Поддерживаются вибрация устройства и геймпада.";
    if (caps.vibrate) return "Вибрация устройства поддерживается.";
    if (caps.gamepad) return "Подключён геймпад с виброотдачей.";
    return "Вибрация экрана зависит от браузера и устройства; на геймпаде отдача поддерживается.";
  }

  function syncUi({ announce = false, statusText = null } = {}) {
    if (enabledInput) enabledInput.checked = enabled;
    if (intensityInput) {
      intensityInput.value = String(intensity);
      intensityInput.disabled = !enabled;
    }
    if (testPatternSelect) testPatternSelect.disabled = !enabled;
    if (intensityValue) intensityValue.textContent = `${Math.round(intensity * 100)}%`;
    if (statusNode) {
      const nextText = statusText ?? capabilityMessage();
      if (announce) {
        statusNode.textContent = "";
        requestAnimationFrame(() => {
          statusNode.textContent = nextText;
        });
      } else {
        statusNode.textContent = nextText;
      }
    }
    ctx.events.emit("haptics:settings-changed", {
      enabled,
      intensity,
      ...capabilities(),
    });
  }

  function stop() {
    arbitrator.reset();
    shotTracker.reset();
    if (vibrationApiSupported()) {
      try { navigator.vibrate(0); } catch {}
    }
  }

  function dispatchVibrate(pattern) {
    if (!canCallVibrate()) return false;
    const scaled = scaleVibratePattern(pattern, intensity);
    if (!scaled || (Array.isArray(scaled) && scaled.length === 0)) return false;
    try {
      return Boolean(navigator.vibrate(scaled));
    } catch {
      return false;
    }
  }

  async function trigger(cue, { bypassArbitrator = false } = {}) {
    if (!enabled || !cue) return { vibrate: false, gamepad: false };
    if (typeof document !== "undefined" && document.hidden) {
      return { vibrate: false, gamepad: false };
    }

    const scaledVibrate = cue.vibrate != null ? scaleVibratePattern(cue.vibrate, intensity) : 0;
    const vibrateActive = canCallVibrate();
    const padActive = gamepadHasHaptics();
    const vibrateDuration = vibrateActive ? patternDurationMs(scaledVibrate) : 0;
    const padDuration = padActive ? (Number(cue.gamepad?.duration) || 0) : 0;
    const durationMs = Math.max(
      vibrateDuration,
      padDuration,
      !vibrateActive && !padActive ? patternDurationMs(scaledVibrate) : 0,
    );

    if (!bypassArbitrator) {
      const allowed = arbitrator.shouldPlay({
        kind: cue.kind ?? "custom",
        priority: cue.priority ?? HAPTIC_PRIORITY.ACTION,
        cooldownMs: cue.cooldownMs ?? 0,
        durationMs,
      }, nowTime());
      if (!allowed) return { vibrate: false, gamepad: false };
    }

    const vibrateResult = cue.vibrate != null ? dispatchVibrate(cue.vibrate) : false;
    const gamepadResult = cue.gamepad
      ? await playGamepadRumble(cue.gamepad, intensity)
      : false;
    return { vibrate: vibrateResult, gamepad: gamepadResult };
  }

  async function test(kind = "default") {
    if (!enabled) {
      syncUi({ announce: true, statusText: "Сначала включите тактильную отдачу в настройках." });
      return { vibrate: false, gamepad: false };
    }
    const presetCue = kind === "single"
      ? {
          kind: "manual:test:single",
          priority: HAPTIC_PRIORITY.CRITICAL,
          vibrate: HAPTIC_PATTERNS.shotSinglePistol.vibrate,
          gamepad: { ...HAPTIC_PATTERNS.shotSinglePistol.gamepad },
        }
      : kind === "burst"
        ? {
            kind: "manual:test:burst",
            priority: HAPTIC_PRIORITY.CRITICAL,
            vibrate: [...HAPTIC_PATTERNS.shotBurstEntry.vibrate],
            gamepad: { ...HAPTIC_PATTERNS.shotBurstEntry.gamepad },
          }
        : kind === "critical"
          ? {
              kind: "manual:test:critical",
              priority: HAPTIC_PRIORITY.FATAL,
              vibrate: [...HAPTIC_PATTERNS.damageCritical.vibrate],
              gamepad: { ...HAPTIC_PATTERNS.damageCritical.gamepad },
            }
          : {
              kind: "manual:test",
              priority: HAPTIC_PRIORITY.CRITICAL,
              vibrate: [40, 45, 75],
              gamepad: { duration: 130, weak: 0.5, strong: 0.8 },
            };

    const result = await trigger(presetCue, { bypassArbitrator: true });
    syncUi({
      announce: true,
      statusText: capabilityMessage({ tested: true, vibrated: result.vibrate, rumbled: result.gamepad }),
    });
    return result;
  }

  function setEnabled(value) {
    const next = Boolean(value);
    enabled = next;
    try { localStorage.setItem(HAPTICS_ENABLED_KEY, String(enabled)); } catch {}
    if (!enabled) stop();
    syncUi({ announce: true });
  }

  function setIntensity(value) {
    intensity = clampIntensity(value);
    try { localStorage.setItem(HAPTICS_INTENSITY_KEY, String(intensity)); } catch {}
    syncUi();
  }

  enabledInput?.addEventListener("change", () => {
    setEnabled(enabledInput.checked);
  });

  intensityInput?.addEventListener("input", () => {
    setIntensity(intensityInput.value);
  });

  testButton?.addEventListener("click", () => {
    void test(testPatternSelect?.value ?? "default");
  });

  ctx.events.on("input:fire-stop", () => {
    shotTracker.onFireStop();
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (!self) return;
    selfAlive = Boolean(self.alive);
    if (Number.isFinite(Number(self.health))) selfHealth = Number(self.health);
    if (Number.isFinite(Number(self.healthMax)) && Number(self.healthMax) > 0) {
      selfHealthMax = Number(self.healthMax);
    }
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    const self = network.playerId;

    if (packet?.event === "entity:respawned" && payload.entityId === self) {
      selfAlive = true;
      selfHealth = selfHealthMax;
      arbitrator.reset();
      shotTracker.reset();
      return;
    }

    if (packet?.event === "weapon:selected" && payload.entityId === self) {
      shotTracker.reset();
      return;
    }

    let eventContext = {};
    if (packet?.event === "weapon:fired" && payload.entityId === self) {
      const shot = shotTracker.nextShot(payload.weaponId, nowTime());
      eventContext = { shotMode: shot.mode, shotCount: shot.count };
    } else if (
      packet?.event === "combat:damage"
      && payload.targetId === self
      && !payload.spawnProtected
      && !payload.friendProtected
    ) {
      const applied = Math.max(0, Number(payload.healthApplied) || 0);
      if (Number.isFinite(selfHealth) && Number.isFinite(selfHealthMax) && selfHealthMax > 0) {
        selfHealth = Math.max(0, selfHealth - applied);
        eventContext = { remainingHealthRatio: selfHealth / selfHealthMax };
      }
    }

    const cue = hapticCueForGameEvent(packet, self, eventContext);
    if (!cue) {
      if (packet?.event === "entity:died" && payload.entityId === self) {
        selfAlive = false;
        shotTracker.reset();
      }
      return;
    }

    if (!selfAlive && !cue.allowAfterDeath) return;
    if (cue.kind === "damage:killed") {
      selfAlive = false;
      shotTracker.reset();
    }

    void trigger(cue);
  });

  ctx.events.on("network:disconnected", () => {
    selfAlive = true;
    selfHealth = null;
    selfHealthMax = null;
    stop();
  });

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
    });
  }

  window.addEventListener("gamepadconnected", () => syncUi());
  window.addEventListener("gamepaddisconnected", () => syncUi());

  syncUi();

  ctx.services.provide("haptic-feedback", {
    get enabled() { return enabled; },
    setEnabled,
    get intensity() { return intensity; },
    setIntensity,
    patterns: HAPTIC_PATTERNS,
    capabilities,
    supported() {
      const caps = capabilities();
      return caps.vibrate || caps.gamepad;
    },
    trigger,
    test,
    stop,
    rumbleGamepad(options) {
      if (!enabled) return Promise.resolve(false);
      return playGamepadRumble(options, intensity);
    },
    gamepadSupported() {
      return gamepadHasHaptics();
    },
  });
}
