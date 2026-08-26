export const manifest = {
  id: "parachute-audio-preload",
  requires: ["cloudflare-session", "spatial-audio-web"],
};

const ROOT = "/assets/audio/core/parachute";

export const PARACHUTE_AUDIO_URLS = [
  `${ROOT}/wind/eye-of-storm.mp3`,
  `${ROOT}/wind/turbulent-wind.mp3`,
  `${ROOT}/wind/wind-rush.mp3`,
  `${ROOT}/open-air/cut-sweep.mp3`,
  `${ROOT}/open-air/debris-whoosh.mp3`,
  `${ROOT}/open-air/deploy-swish.mp3`,
  `${ROOT}/cloth/canvas-flap.mp3`,
  `${ROOT}/cloth/page-flutter.mp3`,
  `${ROOT}/cloth/paper-rattle.mp3`,
  `${ROOT}/cloth/rummage.mp3`,
  `${ROOT}/cloth/wrapping-flutter.mp3`,
  `${ROOT}/rig/carabiner-lock.mp3`,
  `${ROOT}/rig/carabiner-rope.mp3`,
  `${ROOT}/rig/metal-rattle.mp3`,
  `${ROOT}/rig/spring-wire.mp3`,
  `${ROOT}/rig/tension-thunk.mp3`,
  `${ROOT}/close/measuring-tape.mp3`,
  `${ROOT}/close/retract.mp3`,
  `${ROOT}/landing/body-impact.mp3`,
  `${ROOT}/landing/gear-clatter.mp3`,
  `${ROOT}/landing/ground-thump.mp3`,
];

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  let started = false;
  let ready = Promise.resolve([]);

  function start(mode) {
    if (started || mode !== "battle-royale") return ready;
    started = true;
    ready = Promise.allSettled(PARACHUTE_AUDIO_URLS.map((url) => audio.load(url)));
    return ready;
  }

  ctx.events.on("network:welcome", (data) => start(data?.mode));
  ctx.events.on("game:snapshot", (snapshot) => start(snapshot?.mode));

  ctx.services.provide("parachute-audio-preload", {
    urls: PARACHUTE_AUDIO_URLS,
    start,
    get started() { return started; },
    get ready() { return ready; },
  });
}
