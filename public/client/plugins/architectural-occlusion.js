export const manifest = {
  id: "architectural-occlusion",
  requires: ["spatial-audio-web"],
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function architecturalGainFactor(occlusion) {
  const amount = clamp01(occlusion);
  if (amount <= 0) return 1;
  return Math.max(0.2, 1 - Math.pow(amount, 1.08) * 0.76);
}

function withArchitecturalOcclusion(options = {}) {
  const occlusion = clamp01(options.occlusion);
  if (occlusion <= 0) return options;
  const gain = Number.isFinite(Number(options.gain)) ? Number(options.gain) : 1;
  return {
    ...options,
    gain: gain * architecturalGainFactor(occlusion),
    // Keep the low-pass stage at full physical strength while the gain stage
    // supplies the missing sense of a wall or closed door between spaces.
    occlusion: Math.min(1, occlusion * 1.08),
  };
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const originalPlaySpatial = audio.playSpatial.bind(audio);
  const originalPlaySpatialBuffer = audio.playSpatialBuffer.bind(audio);

  audio.playSpatial = (url, position, options = {}) => (
    originalPlaySpatial(url, position, withArchitecturalOcclusion(options))
  );
  audio.playSpatialBuffer = (buffer, position, options = {}) => (
    originalPlaySpatialBuffer(buffer, position, withArchitecturalOcclusion(options))
  );

  ctx.services.provide?.("architectural-occlusion", {
    gainFactor: architecturalGainFactor,
  });
}
