export const manifest = {
  id: "iphone-gestures",
  requires: ["keyboard-input"],
};

// Keep the same feel as Archipelago: a short drag starts walking and a
// deliberate long drag turns the same movement into a run.
const MOVE_DEAD_ZONE_PX = 26;
const RUN_THRESHOLD_PX = 125;
const TAP_MAX_MOVE_PX = 20;
const TAP_MAX_DURATION_MS = 260;
const DOUBLE_TAP_WINDOW_MS = 300;
const DOUBLE_TAP_DISTANCE_PX = 90;

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function interactiveTarget(target) {
  return target instanceof Element
    && Boolean(target.closest("button, input, select, textarea, a, summary, [contenteditable='true']"));
}

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const panel = document.getElementById("game-panel");
  if (!panel) return;

  const tracked = new Map();
  let primaryId = null;
  let currentDirection = null;
  let sprintHeld = false;
  let fireHeld = false;
  let sessionStartedAt = 0;
  let sessionStartX = 0;
  let sessionStartY = 0;
  let sessionMaxMove = 0;
  let multiTouchUsed = false;
  let pendingTapTimer = null;
  let pendingTap = null;

  function gameActive() {
    return !panel.hidden;
  }

  function prevent(event) {
    if (event.cancelable) event.preventDefault();
  }

  function cancelPendingTap() {
    if (pendingTapTimer != null) clearTimeout(pendingTapTimer);
    pendingTapTimer = null;
    pendingTap = null;
  }

  function setDirection(next) {
    if (currentDirection === next) return;
    if (currentDirection) input.setVirtualControl?.(currentDirection, false);
    currentDirection = next;
    if (currentDirection) input.setVirtualControl?.(currentDirection, true);
  }

  function setSprint(next) {
    const value = Boolean(next);
    if (sprintHeld === value) return;
    sprintHeld = value;
    input.setVirtualControl?.("sprint", value);
  }

  function setFire(next) {
    const value = Boolean(next);
    if (fireHeld === value) return;
    fireHeld = value;
    input.setVirtualControl?.("fire", value);
  }

  function releaseMovement() {
    setDirection(null);
    setSprint(false);
  }

  function choosePrimary() {
    const next = tracked.values().next().value ?? null;
    primaryId = next?.id ?? null;
    releaseMovement();
    if (next) {
      next.originX = next.x;
      next.originY = next.y;
    }
  }

  function updateMovement() {
    const primary = primaryId == null ? null : tracked.get(primaryId);
    if (!primary) {
      releaseMovement();
      return;
    }

    const dx = primary.x - primary.originX;
    const dy = primary.y - primary.originY;
    const move = Math.hypot(dx, dy);
    sessionMaxMove = Math.max(sessionMaxMove, distance(sessionStartX, sessionStartY, primary.x, primary.y));

    if (move < MOVE_DEAD_ZONE_PX) {
      releaseMovement();
      return;
    }

    if (Math.abs(dy) >= Math.abs(dx)) setDirection(dy < 0 ? "forward" : "back");
    else setDirection(dx < 0 ? "left" : "right");

    setSprint(move >= RUN_THRESHOLD_PX);
  }

  function dispatchJump() {
    const down = new KeyboardEvent("keydown", {
      code: "Space",
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    const up = new KeyboardEvent("keyup", {
      code: "Space",
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(down);
    window.dispatchEvent(up);
    ctx.events.emit("gesture:jump", { gesture: "double-tap" });
  }

  function handleTap(x, y, now) {
    if (pendingTap
      && now - pendingTap.time <= DOUBLE_TAP_WINDOW_MS
      && distance(pendingTap.x, pendingTap.y, x, y) <= DOUBLE_TAP_DISTANCE_PX) {
      cancelPendingTap();
      dispatchJump();
      return;
    }

    cancelPendingTap();
    pendingTap = { x, y, time: now };
    pendingTapTimer = setTimeout(() => {
      pendingTapTimer = null;
      pendingTap = null;
      input.triggerVirtualAction?.("interact");
      ctx.events.emit("gesture:action", { gesture: "single-tap", action: "interact" });
    }, DOUBLE_TAP_WINDOW_MS);
  }

  function startSession(touch, now) {
    sessionStartedAt = now;
    sessionStartX = touch.clientX;
    sessionStartY = touch.clientY;
    sessionMaxMove = 0;
    multiTouchUsed = false;
  }

  function finishSession(x, y, now) {
    releaseMovement();
    setFire(false);
    const duration = now - sessionStartedAt;
    if (!multiTouchUsed
      && duration <= TAP_MAX_DURATION_MS
      && sessionMaxMove <= TAP_MAX_MOVE_PX) {
      handleTap(x, y, now);
    }
    primaryId = null;
    sessionStartedAt = 0;
    sessionMaxMove = 0;
    multiTouchUsed = false;
  }

  function addChangedTouches(event) {
    let accepted = false;
    for (const touch of Array.from(event.changedTouches ?? [])) {
      // Buttons and other controls always stay controls. Every other point on
      // the screen becomes part of the game gesture surface while a match is visible.
      if (interactiveTarget(touch.target)) continue;
      const point = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        originX: touch.clientX,
        originY: touch.clientY,
      };
      tracked.set(touch.identifier, point);
      accepted = true;
      if (primaryId == null) {
        primaryId = touch.identifier;
        startSession(touch, performance.now());
      }
    }
    return accepted;
  }

  function updateChangedTouches(event) {
    for (const touch of Array.from(event.changedTouches ?? [])) {
      const point = tracked.get(touch.identifier);
      if (!point) continue;
      point.x = touch.clientX;
      point.y = touch.clientY;
      if (touch.identifier === primaryId) {
        sessionMaxMove = Math.max(
          sessionMaxMove,
          distance(sessionStartX, sessionStartY, touch.clientX, touch.clientY),
        );
      }
    }
  }

  function removeChangedTouches(event) {
    let lastX = sessionStartX;
    let lastY = sessionStartY;
    let primaryEnded = false;
    for (const touch of Array.from(event.changedTouches ?? [])) {
      if (!tracked.has(touch.identifier)) continue;
      lastX = touch.clientX;
      lastY = touch.clientY;
      if (touch.identifier === primaryId) primaryEnded = true;
      tracked.delete(touch.identifier);
    }
    return { lastX, lastY, primaryEnded };
  }

  // Capture gestures from the whole document, not just #game-panel. This is
  // what makes every free part of the visible screen usable and also prevents
  // an off-panel swipe from scrolling the page and carrying the controls away.
  document.addEventListener("touchstart", (event) => {
    if (!gameActive()) return;
    const hadTrackedTouches = tracked.size > 0;
    const accepted = addChangedTouches(event);
    if (!accepted && !hadTrackedTouches) return;
    prevent(event);

    if (tracked.size > 1) {
      multiTouchUsed = true;
      cancelPendingTap();
    }
    if (tracked.size >= 3) setFire(true);
    updateMovement();
  }, { capture: true, passive: false });

  document.addEventListener("touchmove", (event) => {
    if (!tracked.size) return;
    prevent(event);
    updateChangedTouches(event);
    updateMovement();
  }, { capture: true, passive: false });

  function endTouches(event) {
    if (!tracked.size) return;
    prevent(event);
    updateChangedTouches(event);
    const { lastX, lastY, primaryEnded } = removeChangedTouches(event);

    if (tracked.size < 3) setFire(false);
    if (!tracked.size) {
      finishSession(lastX, lastY, performance.now());
      return;
    }
    if (primaryEnded) choosePrimary();
    updateMovement();
  }

  document.addEventListener("touchend", endTouches, { capture: true, passive: false });
  document.addEventListener("touchcancel", endTouches, { capture: true, passive: false });

  function reset() {
    tracked.clear();
    primaryId = null;
    releaseMovement();
    setFire(false);
    cancelPendingTap();
    sessionStartedAt = 0;
    sessionMaxMove = 0;
    multiTouchUsed = false;
  }

  window.addEventListener("blur", reset);
  window.addEventListener("pagehide", reset);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
}
