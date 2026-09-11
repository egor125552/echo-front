export const manifest = {
  id: "parachute-dynamics-audio",
  requires: ["cloudflare-session", "spatial-audio-web"],
};

const ROOT = "/assets/audio/core/parachute";
const CLOTH = [
  `${ROOT}/cloth/canvas-flap.mp3`,
  `${ROOT}/cloth/page-flutter.mp3`,
  `${ROOT}/cloth/paper-rattle.mp3`,
  `${ROOT}/cloth/rummage.mp3`,
  `${ROOT}/cloth/wrapping-flutter.mp3`,
];
const RIG = [
  `${ROOT}/rig/carabiner-rope.mp3`,
  `${ROOT}/rig/metal-rattle.mp3`,
  `${ROOT}/rig/spring-wire.mp3`,
  `${ROOT}/rig/tension-thunk.mp3`,
];

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)] ?? list[0];
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const audio = ctx.services.get("audio");
  let nextStressSoundAt = 0;
  let previousStall = 0;
  let previousCompression = 0;

  async function play(url, gain, fadeIn = 0.08) {
    try {
      await audio.resume();
      const handle = await audio.playCentered(url, {
        gain: fadeIn > 0 ? 0 : gain,
        foreground: true,
      });
      if (fadeIn > 0) handle?.setGain?.(gain, fadeIn);
    } catch {
      // Optional procedural detail must never break gameplay audio.
    }
  }

  function stressFrom(state) {
    const stall = clamp01(state?.stall);
    const compression = clamp01(state?.canopyCompression);
    const turn = clamp01(Math.abs(Number(state?.turnRate) || 0) / 1.05);
    const transient = clamp01(state?.turnTransient);
    return Math.max(stall, compression, turn * 0.5 + transient * 0.45);
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.mode !== "battle-royale") return;
    const self = snapshot.entities?.find((entity) => entity.id === network.playerId);
    const state = self?.parachute;
    if (!state || state.phase !== "deployed" || clamp01(state.inflation) < 0.75) {
      previousStall = clamp01(state?.stall);
      previousCompression = clamp01(state?.canopyCompression);
      return;
    }

    const stall = clamp01(state.stall);
    const compression = clamp01(state.canopyCompression);
    const stress = stressFrom(state);
    const now = performance.now();

    if (stall > previousStall + 0.12 && stall >= 0.3) {
      void play(pick(CLOTH), 0.07 + stall * 0.16, 0.16);
    }
    if (compression > previousCompression + 0.14 && compression >= 0.28) {
      void play(pick(RIG), 0.055 + compression * 0.14, 0.10);
    }

    if (stress >= 0.34 && now >= nextStressSoundAt) {
      const clothChance = 0.62 + stress * 0.18;
      const list = Math.random() < clothChance ? CLOTH : RIG;
      const gain = 0.035 + stress * 0.10;
      void play(pick(list), gain, 0.18);
      nextStressSoundAt = now + 850 + (1 - stress) * 1700 + Math.random() * 700;
    }

    previousStall = stall;
    previousCompression = compression;
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (payload.entityId !== network.playerId) return;

    if (packet.event === "parachute:stall") {
      void play(pick(CLOTH), 0.22, 0.22);
      setTimeout(() => void play(pick(RIG), 0.10, 0.12), 170);
      return;
    }

    if (packet.event === "parachute:stall-recovered") {
      void play(pick(CLOTH), 0.09, 0.25);
      return;
    }

    if (packet.event === "parachute:canopy-collapse") {
      void play(pick(CLOTH), 0.30, 0.06);
      setTimeout(() => void play(pick(RIG), 0.16, 0.04), 80);
    }
  });
}
