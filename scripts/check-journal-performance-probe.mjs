import assert from "node:assert/strict";
import { test } from "node:test";
import { EventBus } from "../public/client/core/event-bus.js";
import { setup } from "../public/client/plugins/play-journal.js";

test("journal sends bounded probes and writes server and browser performance together", async () => {
  const originals = {
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    setInterval: globalThis.setInterval,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  let timer;
  let downloaded;
  let downloadedName;
  const sent = [];
  const fakeLink = { href: "", download: "", click() { downloadedName = this.download; }, remove() {} };
  globalThis.document = {
    querySelector: () => null,
    createElement: () => fakeLink,
    body: { append() {} },
  };
  globalThis.localStorage = { getItem: () => "true", setItem() {} };
  globalThis.setInterval = (callback, interval) => {
    assert.equal(interval, 2000);
    timer = callback;
    return 1;
  };
  URL.createObjectURL = (blob) => { downloaded = blob; return "blob:journal-test"; };
  URL.revokeObjectURL = () => {};
  try {
    const events = new EventBus();
    const services = new Map([["network", {
      connected: true,
      send(type, payload) { sent.push({ type, payload }); return true; },
    }]]);
    await setup({ events, services: {
      get(name) { return services.get(name); },
      provide(name, value) { services.set(name, value); },
    } });
    const journal = services.get("play-journal");
    assert(journal);
    assert.equal(journal.recordCount, 0);
    timer();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "perf-probe");
    const id = sent[0].payload.id;
    assert(Number.isInteger(id));
    // Wrong response cannot enter the journal.
    events.emit("network:perf-pong", { id: id + 1, server: { tickCount: 999 } });
    assert.equal(journal.recordCount, 0);
    events.emit("network:perf-pong", {
      id,
      receivedAt: performance.now() + 12,
      server: { tickCount: 44, maxTickGapMs: 180 },
      client: { maxSnapshotGapMs: 175, maxParseMs: 3 },
    });
    assert.equal(journal.recordCount, 1);
    await journal.download();
    assert(downloaded, "journal blob not created");
    const text = downloadedName.endsWith(".gz")
      ? await new Response(downloaded.stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : await downloaded.text();
    const records = text.trim().split("\n").map((line) => JSON.parse(line));
    const marker = records.find((record) => record[0] === "m" && record[2] === "performance");
    assert(marker, "no performance marker in exported journal");
    assert.equal(marker[3].server.tickCount, 44);
    assert.equal(marker[3].server.maxTickGapMs, 180);
    assert.equal(marker[3].client.maxSnapshotGapMs, 175);
    assert(marker[3].roundTripMs >= 0);
  } finally {
    globalThis.document = originals.document;
    globalThis.localStorage = originals.localStorage;
    globalThis.setInterval = originals.setInterval;
    URL.createObjectURL = originals.createObjectURL;
    URL.revokeObjectURL = originals.revokeObjectURL;
  }
});
