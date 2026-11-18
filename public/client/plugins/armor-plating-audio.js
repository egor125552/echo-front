const START_URL = "/assets/audio/armor-plating/plate-insert-start.mp3";
const BREAK_URL = "/assets/audio/core/armor-break.mp3";
const COMPLETE_URLS = {
  1: "/assets/audio/armor-plating/plate-install-1.mp3",
  2: "/assets/audio/armor-plating/plate-install-2.mp3",
  3: "/assets/audio/armor-plating/plate-install-3.mp3",
  4: "/assets/audio/armor-plating/plate-install-heavy.mp3",
};

export const manifest = {
  id: "armor-plating-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  const trackedEntities = new Set();
  const entityPlates = new Map();
  const entityPositions = new Map();

  ctx.events.on("game:snapshot", (snapshot) => {
    for (const entity of snapshot?.entities ?? []) {
      if (!entity?.id) continue;
      entityPositions.set(entity.id, {
        x: Number(entity.x) || 0,
        y: Number(entity.y) || 0,
        z: Number(entity.z) || 0,
      });
      if (entity.armorPlates != null && !entityPlates.has(entity.id)) {
        entityPlates.set(entity.id, Number(entity.armorPlates));
      }
    }
  });

  function positionFor(payload = {}) {
    if (Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.z))) {
      return {
        x: Number(payload.x) || 0,
        y: Number(payload.y) || 0,
        z: Number(payload.z) || 0,
      };
    }
    return entityPositions.get(payload.entityId) ?? null;
  }

  async function playStart(payload = {}) {
    const entityId = payload.entityId;
    const isSelf = !entityId || entityId === network.playerId;
    try {
      if (isSelf) {
        await audio.playCentered(START_URL, {
          gain: 1,
          channel: "armor-plating-start",
          replace: true,
          foreground: true,
        });
        return;
      }
      const pos = positionFor(payload);
      if (!pos) return;
      trackedEntities.add(entityId);
      await audio.playSpatial(START_URL, pos, {
        gain: 0.95,
        radius: Number(payload.radius) || 34,
        referenceDistance: 2.5,
        rolloffFactor: 0.45,
        occlusion: Number(payload.occlusion) || 0,
        channel: `armor-plating-start:${entityId}`,
        replace: true,
      });
    } catch (error) {
      console.error("Echo Front plating start audio error", error);
    }
  }

  async function playComplete(plateNumber, payload = {}) {
    const entityId = payload.entityId;
    const isSelf = !entityId || entityId === network.playerId;
    const url = COMPLETE_URLS[Number(plateNumber)] ?? COMPLETE_URLS[4];
    try {
      if (isSelf) {
        await audio.playCentered(url, {
          gain: 1,
          channel: "armor-plating-complete",
          replace: true,
          foreground: true,
        });
        return;
      }
      const pos = positionFor(payload);
      if (!pos) return;
      trackedEntities.add(entityId);
      await audio.playSpatial(url, pos, {
        gain: 0.98,
        radius: Number(payload.radius) || 34,
        referenceDistance: 2.5,
        rolloffFactor: 0.45,
        occlusion: Number(payload.occlusion) || 0,
        channel: `armor-plating-complete:${entityId}`,
        replace: true,
      });
    } catch (error) {
      console.error("Echo Front plating completion audio error", error);
    }
  }

  function stopEntityPlatingAudio(entityId) {
    if (!entityId || entityId === network.playerId) {
      audio.stopChannel("armor-plating-start");
      audio.stopChannel("armor-plating-complete");
      return;
    }
    audio.stopChannel(`armor-plating-start:${entityId}`);
    audio.stopChannel(`armor-plating-complete:${entityId}`);
  }

  function stopPlatingAudio() {
    audio.stopChannel("armor-plating-start");
    audio.stopChannel("armor-plating-complete");
    for (const entityId of trackedEntities) {
      audio.stopChannel(`armor-plating-start:${entityId}`);
      audio.stopChannel(`armor-plating-complete:${entityId}`);
    }
    trackedEntities.clear();
  }

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};
    const entityId = payload.entityId;

    if (packet.event === "armor:plating-started") {
      void playStart(payload);
      return;
    }

    if (packet.event === "armor:plating-completed") {
      if (!entityId || entityId === network.playerId) {
        audio.stopChannel("armor-plating-start");
      } else {
        audio.stopChannel(`armor-plating-start:${entityId}`);
      }
      if (payload.plateNumber != null && entityId) {
        entityPlates.set(entityId, Number(payload.plateNumber));
      }
      void playComplete(payload.plateNumber, payload);
      return;
    }

    if (packet.event === "armor:plating-cancelled") {
      stopEntityPlatingAudio(entityId);
      return;
    }

    if (packet.event === "armor:changed" && entityId && entityId !== network.playerId) {
      const next = Number(payload.platesRemaining);
      const prev = entityPlates.get(entityId);
      if (Number.isFinite(next)) {
        if (prev != null && next < prev) {
          const pos = positionFor(payload);
          if (pos) {
            void audio.playSpatial(BREAK_URL, pos, {
              gain: 0.9,
              radius: 34,
              referenceDistance: 2.5,
              rolloffFactor: 0.45,
              occlusion: Number(payload.occlusion) || 0,
              channel: `armor-plate-lost:${entityId}`,
              replace: true,
            }).catch(() => {});
          }
        }
        entityPlates.set(entityId, next);
      }
    }
  });

  ctx.events.on("network:disconnected", stopPlatingAudio);

  ctx.services.provide("armor-plating-audio", {
    startUrl: START_URL,
    completeUrls: COMPLETE_URLS,
    stop: stopPlatingAudio,
  });
}
