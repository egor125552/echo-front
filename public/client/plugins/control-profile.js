export const manifest = {
  id: "control-profile",
  requires: ["touch-control-settings"],
};

export const CONTROL_PROFILE_KEY = "echo-front.control-profile-v1";
export const CONTROL_PROFILES = Object.freeze([
  "auto",
  "keyboard",
  "touch-buttons",
  "touch-gestures",
  "gamepad-playstation",
  "gamepad-standard",
]);

const NON_PLAYSTATION_PATTERN = /(xbox|microsoft|045e|nintendo|switch|pro controller|joy-con|logitech|stadia|8bitdo)/i;
const PLAYSTATION_PATTERN = /(playstation|dualsense|dualshock|sony|054c|\bps4\b|\bps5\b|^wireless controller\b)/i;

export function normalizeControlProfile(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CONTROL_PROFILES.includes(normalized) ? normalized : "auto";
}

export function detectGamepadInfo(gamepads = []) {
  const pads = Array.from(gamepads ?? []).filter((pad) => Boolean(pad) && pad.connected !== false);
  if (!pads.length) return null;
  const preferred = pads.find((pad) => pad.mapping === "standard") ?? pads[0];
  const id = String(preferred.id ?? "").trim();
  const isPlayStation = !NON_PLAYSTATION_PATTERN.test(id) && PLAYSTATION_PATTERN.test(id);
  return {
    kind: isPlayStation ? "gamepad-playstation" : "gamepad-standard",
    label: isPlayStation ? "джойстик от PlayStation" : "геймпад",
    isPlayStation,
    id,
    index: Number(preferred.index) || 0,
  };
}

export function detectGamepadFromNavigator(nav = typeof navigator !== "undefined" ? navigator : null) {
  if (!nav || typeof nav.getGamepads !== "function") return null;
  try {
    return detectGamepadInfo(nav.getGamepads());
  } catch {
    return null;
  }
}

export function isTouchCapable(
  win = typeof window !== "undefined" ? window : null,
  nav = typeof navigator !== "undefined" ? navigator : null,
) {
  if ((Number(nav?.maxTouchPoints) || 0) > 0) return true;
  try {
    return Boolean(win?.matchMedia?.("(pointer: coarse)")?.matches);
  } catch {
    return false;
  }
}

export function controlProfileLabel(profile) {
  switch (normalizeControlProfile(profile)) {
    case "gamepad-playstation":
      return "Джойстик PlayStation";
    case "gamepad-standard":
      return "Геймпад";
    case "touch-gestures":
      return "Жесты на весь экран";
    case "touch-buttons":
      return "Экранные кнопки";
    case "keyboard":
      return "Клавиатура";
    default:
      return "Автоопределение";
  }
}

export function resolveActiveControlProfile({
  storedProfile = "auto",
  touchMode = "buttons",
  detectedGamepad = null,
  touchCapable = false,
} = {}) {
  const normalized = normalizeControlProfile(storedProfile);
  if (normalized !== "auto") return normalized;
  if (detectedGamepad?.kind) return detectedGamepad.kind;
  if (touchMode === "gestures") return "touch-gestures";
  if (touchCapable) return "touch-buttons";
  return "auto";
}

export async function setup(ctx) {
  const touchControlSettings = ctx.services.has?.("touch-control-settings")
    ? ctx.services.get("touch-control-settings")
    : null;
  const picker = typeof document !== "undefined"
    ? document.querySelector("#control-profile-mode")
    : null;
  const statusNode = typeof document !== "undefined"
    ? document.querySelector("#control-profile-status")
    : null;

  let storedProfile = "auto";
  try {
    storedProfile = normalizeControlProfile(localStorage.getItem(CONTROL_PROFILE_KEY));
  } catch {
    storedProfile = "auto";
  }

  function currentDetectedGamepad() {
    return detectGamepadFromNavigator();
  }

  function effectiveProfile() {
    return resolveActiveControlProfile({
      storedProfile,
      touchMode: touchControlSettings?.mode ?? "buttons",
      detectedGamepad: currentDetectedGamepad(),
      touchCapable: isTouchCapable(),
    });
  }

  function syncUi() {
    const resolved = effectiveProfile();
    if (picker) picker.value = storedProfile;
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.dataset.controlProfile = resolved;
    }
    if (statusNode) {
      const detected = currentDetectedGamepad();
      statusNode.textContent = storedProfile === "auto"
        ? (detected
          ? `Выбрано автоопределение: сейчас активен ${detected.label}.`
          : `Выбрано автоопределение (${controlProfileLabel(resolved)}).`)
        : `Активный профиль управления: ${controlProfileLabel(storedProfile)}.`;
    }
  }

  function setProfile(next, { syncTouchMode = true, announce = false } = {}) {
    const normalized = normalizeControlProfile(next);
    const previousEffective = effectiveProfile();
    const changedStored = normalized !== storedProfile;
    storedProfile = normalized;
    try { localStorage.setItem(CONTROL_PROFILE_KEY, storedProfile); } catch {}

    if (syncTouchMode && touchControlSettings) {
      if (storedProfile === "touch-gestures") touchControlSettings.setMode("gestures");
      else if (storedProfile === "touch-buttons") touchControlSettings.setMode("buttons");
    }

    syncUi();
    const nextEffective = effectiveProfile();
    if (changedStored || nextEffective !== previousEffective || announce) {
      ctx.events.emit("control-profile:changed", {
        profile: storedProfile,
        effectiveProfile: nextEffective,
        announce: Boolean(announce),
      });
    }
    return nextEffective;
  }

  picker?.addEventListener("change", () => {
    setProfile(picker.value, { syncTouchMode: true, announce: true });
  });

  ctx.events.on("touch-control:mode-changed", ({ mode } = {}) => {
    const target = mode === "gestures" ? "touch-gestures" : "touch-buttons";
    if (storedProfile === "touch-gestures" || storedProfile === "touch-buttons" || storedProfile === "auto") {
      setProfile(target, { syncTouchMode: false, announce: true });
    } else {
      syncUi();
    }
  });

  function handleGamepadConnect(eventPad = null) {
    const detected = eventPad
      ? detectGamepadInfo([eventPad]) ?? currentDetectedGamepad()
      : currentDetectedGamepad();
    syncUi();
    if (detected) {
      ctx.events.emit("control-profile:gamepad-detected", detected);
      if (storedProfile === "auto") {
        ctx.events.emit("control-profile:changed", {
          profile: storedProfile,
          effectiveProfile: effectiveProfile(),
          announce: false,
        });
      }
    }
  }

  ctx.events.on("gamepad:connected", (info) => {
    handleGamepadConnect(info ? { ...info, connected: true } : null);
  });
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("gamepadconnected", (event) => handleGamepadConnect(event?.gamepad ?? null));
    window.addEventListener("gamepaddisconnected", () => syncUi());
  }

  syncUi();

  ctx.services.provide("control-profile", {
    get profile() { return storedProfile; },
    get effectiveProfile() { return effectiveProfile(); },
    get detectedGamepad() { return currentDetectedGamepad(); },
    setProfile,
    label: controlProfileLabel,
  });
}
