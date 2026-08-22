import test from "node:test";
import assert from "node:assert/strict";
import { sampleInputState, sampleKeyboardState } from "../client/plugins/input.js";

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
