import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EVENT_SOUNDS, setup } from "../client/plugins/event-sound-pack.js";

function createHarness() {
  const handlers = new Map();
  const played = [];
  const audio = {
    async playCentered(url, options = {}) {
      played.push({ url, options });
      return {};
    },
    async load() {},
  };
  const network = { playerId: "human" };
  const provided = new Map();
  const ctx = {
    events: {
      on(name, handler) {
        const list = handlers.get(name) ?? [];
        list.push(handler);
        handlers.set(name, list);
      },
    },
    services: {
      get(name) {
        if (name === "audio") return audio;
        if (name === "network") return network;
        throw new Error(`unknown service ${name}`);
      },
      provide(name, value) {
        provided.set(name, value);
      },
    },
  };

  function emit(name, payload) {
    for (const handler of handlers.get(name) ?? []) handler(payload);
  }

  return { ctx, emit, played, provided };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("event sound pack maps current match events to the intended cues", async () => {
  const harness = createHarness();
  await setup(harness.ctx);

  harness.emit("network:welcome", { team: 1 });

  harness.emit("game:event", { event: "match:started", payload: { roundNumber: 2 } });
  await flush();
  assert.equal(harness.played.at(-1)?.url, EVENT_SOUNDS["round.start"]);

  const beforeOtherUnlock = harness.played.length;
  harness.emit("game:event", {
    event: "weapon:unlocked",
    payload: { entityId: "someone-else", weaponId: "rifle" },
  });
  await flush();
  assert.equal(harness.played.length, beforeOtherUnlock);

  harness.emit("game:event", {
    event: "weapon:unlocked",
    payload: { entityId: "human", weaponId: "rifle" },
  });
  await flush();
  assert.equal(harness.played.at(-1)?.url, EVENT_SOUNDS["rifle.unlocked"]);

  harness.emit("game:event", { event: "match:ended", payload: { winner: 0 } });
  await flush();
  assert.equal(harness.played.at(-1)?.url, EVENT_SOUNDS["round.draw"]);

  harness.emit("game:event", { event: "match:ended", payload: { winner: 1 } });
  await flush();
  assert.equal(harness.played.at(-1)?.url, EVENT_SOUNDS["round.victory"]);

  harness.emit("game:event", { event: "match:ended", payload: { winner: 2 } });
  await flush();
  assert.equal(harness.played.at(-1)?.url, EVENT_SOUNDS["round.defeat"]);

  assert.ok(harness.played.every(({ options }) => options.channel === "event-cue" && options.replace === true));
});

test("event sound filenames are stable and public client stays mirrored", async () => {
  assert.deepEqual(EVENT_SOUNDS, {
    "round.start": "/assets/audio/events/round-start.mp3",
    "round.victory": "/assets/audio/events/round-victory.mp3",
    "round.defeat": "/assets/audio/events/round-defeat.mp3",
    "round.draw": "/assets/audio/events/round-draw.mp3",
    "rifle.unlocked": "/assets/audio/events/rifle-unlocked.mp3",
  });

  const sourcePlugin = await readFile(new URL("../client/plugins/event-sound-pack.js", import.meta.url), "utf8");
  const publicPlugin = await readFile(new URL("../public/client/plugins/event-sound-pack.js", import.meta.url), "utf8");
  const sourcePreset = await readFile(new URL("../client/presets/echo-front.js", import.meta.url), "utf8");
  const publicPreset = await readFile(new URL("../public/client/presets/echo-front.js", import.meta.url), "utf8");

  assert.equal(publicPlugin, sourcePlugin);
  assert.equal(publicPreset, sourcePreset);
  assert.match(sourcePreset, /event-sound-pack\.js/);
  assert.match(sourcePreset, /eventSoundPack/);
});
