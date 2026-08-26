import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PARACHUTE_AUDIO_URLS as sourceUrls } from "../client/plugins/parachute-audio-preload.js";
import { PARACHUTE_AUDIO_URLS as servedUrls } from "../public/client/plugins/parachute-audio-preload.js";

test("parachute audio preload paths are mirrored and browser-served", async () => {
  assert.equal(sourceUrls.length, 21);
  assert.deepEqual(servedUrls, sourceUrls);

  for (const url of servedUrls) {
    assert.match(url, /^\/assets\/audio\/core\/parachute\/.+\.mp3$/);
    const publicFile = new URL(`../public${url}`, import.meta.url);
    await access(publicFile);
    const bytes = await readFile(publicFile);
    assert.ok(bytes.length > 1000, `${fileURLToPath(publicFile)} should contain audio data`);
  }
});
