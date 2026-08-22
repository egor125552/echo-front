import test from "node:test";
import assert from "node:assert/strict";
import { sampleKeyboardState } from "../client/plugins/input.js";

test("left and right arrows turn for aiming", () => {
  const left = sampleKeyboardState(new Set(["ArrowLeft"]));
  const right = sampleKeyboardState(new Set(["ArrowRight"]));

  assert.equal(left.turn, -1);
  assert.equal(left.strafe, 0);
  assert.equal(right.turn, 1);
  assert.equal(right.strafe, 0);
});

test("Q and E strafe without turning", () => {
  const left = sampleKeyboardState(new Set(["KeyQ"]));
  const right = sampleKeyboardState(new Set(["KeyE"]));

  assert.equal(left.strafe, -1);
  assert.equal(left.turn, 0);
  assert.equal(right.strafe, 1);
  assert.equal(right.turn, 0);
});

test("Z plus left or right does not also turn", () => {
  const left = sampleKeyboardState(new Set(["KeyZ", "ArrowLeft"]), { selectDelta: -1 });
  const right = sampleKeyboardState(new Set(["KeyZ", "ArrowRight"]), { selectDelta: 1 });

  assert.equal(left.turn, 0);
  assert.equal(left.selectDelta, -1);
  assert.equal(right.turn, 0);
  assert.equal(right.selectDelta, 1);
});
