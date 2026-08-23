import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  releaseKeyboardKey,
  sampleInputState,
  sampleKeyboardState,
  shouldHandleControlClick,
} from "../client/plugins/input.js";

test("arrow keys move on both axes without camera turning", () => {
  const up = sampleKeyboardState(new Set(["ArrowUp"]));
  const down = sampleKeyboardState(new Set(["ArrowDown"]));
  const left = sampleKeyboardState(new Set(["ArrowLeft"]));
  const right = sampleKeyboardState(new Set(["ArrowRight"]));

  assert.equal(up.forward, 1);
  assert.equal(down.forward, -1);
  assert.equal(left.strafe, -1);
  assert.equal(right.strafe, 1);
  assert.equal(up.turn, 0);
  assert.equal(left.turn, 0);
  assert.equal(right.turn, 0);
});

test("diagonal movement keeps both directional axes", () => {
  const sample = sampleKeyboardState(new Set(["ArrowUp", "ArrowRight"]));
  assert.equal(sample.forward, 1);
  assert.equal(sample.strafe, 1);
  assert.equal(sample.turn, 0);
});

test("Z plus left or right selects a weapon without lateral movement", () => {
  const left = sampleKeyboardState(new Set(["KeyZ", "ArrowLeft"]), { selectDelta: -1 });
  const right = sampleKeyboardState(new Set(["KeyZ", "ArrowRight"]), { selectDelta: 1 });

  assert.equal(left.strafe, 0);
  assert.equal(left.turn, 0);
  assert.equal(left.selectDelta, -1);
  assert.equal(right.strafe, 0);
  assert.equal(right.turn, 0);
  assert.equal(right.selectDelta, 1);
});

test("releasing Z while an arrow remains held immediately restores movement", () => {
  const pressed = new Set(["KeyZ", "ArrowLeft"]);
  assert.equal(sampleKeyboardState(pressed).strafe, 0);
  releaseKeyboardKey(pressed, "KeyZ");
  assert.equal(pressed.has("ArrowLeft"), true);
  assert.equal(sampleKeyboardState(pressed).strafe, -1);
});

test("touch movement uses the same server input shape as keyboard", () => {
  const sample = sampleInputState(new Set(), {
    forward: true,
    right: true,
    sprint: true,
    fireHeld: true,
  });

  assert.equal(sample.forward, 1);
  assert.equal(sample.strafe, 1);
  assert.equal(sample.turn, 0);
  assert.equal(sample.sprint, true);
  assert.equal(sample.fireHeld, true);
});

test("assistive-technology synthetic clicks are never swallowed by pointer suppression", () => {
  assert.equal(shouldHandleControlClick(0, 100, 700), true);
});

test("a physical pointer follow-up click is suppressed only during its own suppression window", () => {
  assert.equal(shouldHandleControlClick(1, 100, 700), false);
  assert.equal(shouldHandleControlClick(1, 701, 700), true);
});

test("network sends control transitions immediately while retaining the 50 ms heartbeat", async () => {
  const source = await readFile(new URL("../client/plugins/network.js", import.meta.url), "utf8");
  assert.match(source, /ctx\.events\.on\("input:changed", sendInput\)/);
  assert.match(source, /setInterval\(sendInput, 50\)/);
});
