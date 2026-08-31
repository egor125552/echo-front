export const manifest = {
  id: "gamepad-haptics",
  requires: ["cloudflare-session"],
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function activeGamepad() {
  if (typeof navigator.getGamepads !== "function") return null;
  const pads = Array.from(navigator.getGamepads() ?? []).filter(Boolean);
  return pads.find((pad) => pad.mapping === "standard") ?? pads[0] ?? null;
}

async function playRumble({ duration = 80, weak = 0.2, strong = 0.5 } = {}) {
  const gamepad = activeGamepad();
  if (!gamepad) return false;
  const safeDuration = Math.max(10, Math.min(450, Number(duration) || 80));
  const weakMagnitude = clamp01(weak);
  const strongMagnitude = clamp01(strong);

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

function impactStrength(payload = {}) {
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

export async function setup(ctx) {
  const network = ctx.services.get("network");
  let lastPulseAt = -Infinity;

  function rumble(options, { minimumGapMs = 18 } = {}) {
    const now = performance.now();
    if (now - lastPulseAt < minimumGapMs) return;
    lastPulseAt = now;
    void playRumble(options);
  }

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    const self = network.playerId;

    if (packet.event === "combat:damage" && payload.targetId === self) {
      if (payload.spawnProtected) return;
      const damage = Math.max(0,
        (Number(payload.healthApplied) || 0) + (Number(payload.armorAbsorbed) || 0));
      const amount = clamp01(damage / 85);
      rumble({
        duration: 65 + amount * 95,
        weak: 0.22 + amount * 0.38,
        strong: 0.38 + amount * 0.58,
      });
      return;
    }

    if (packet.event === "weapon:fired" && payload.entityId === self) {
      const rifle = payload.weaponId === "rifle";
      rumble({
        duration: rifle ? 58 : 42,
        weak: rifle ? 0.26 : 0.18,
        strong: rifle ? 0.52 : 0.38,
      }, { minimumGapMs: 30 });
      return;
    }

    if (packet.event === "vehicle:impact" && payload.driverId === self) {
      const impact = impactStrength(payload);
      const forceBacked = payload.impactSource === "rapier-contact-force";
      const amount = forceBacked
        ? clamp01((impact - 1.25) / 24)
        : clamp01((impact - 2.5) / 14);
      if (amount <= 0) return;
      rumble({
        duration: 75 + amount * 235,
        weak: 0.24 + amount * 0.60,
        strong: 0.38 + amount * 0.62,
      });
      return;
    }

    if (packet.event === "parachute:obstacle-impact" && payload.entityId === self) {
      const impact = Math.max(0, Number(payload.speedBefore) || Number(payload.airSpeed) || 0);
      const amount = clamp01(impact / 12);
      rumble({
        duration: 70 + amount * 120,
        weak: 0.24 + amount * 0.35,
        strong: 0.35 + amount * 0.52,
      });
      return;
    }

    if (String(packet.event).startsWith("ragdoll:") && payload.entityId === self) {
      const name = String(packet.event);
      if (!/(impact|collision|land|crash)/i.test(name)) return;
      const impact = impactStrength(payload);
      const amount = clamp01(impact / 11);
      rumble({
        duration: 75 + amount * 145,
        weak: 0.2 + amount * 0.45,
        strong: 0.32 + amount * 0.62,
      }, { minimumGapMs: 28 });
    }
  });

  ctx.events.on("network:disconnected", () => {
    lastPulseAt = -Infinity;
  });

  ctx.services.provide("gamepad-haptics", {
    rumble(options) { return playRumble(options); },
    supported() {
      const pad = activeGamepad();
      return Boolean(pad?.vibrationActuator || pad?.hapticActuators?.length);
    },
  });
}
