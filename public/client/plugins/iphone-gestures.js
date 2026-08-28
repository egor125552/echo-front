export const manifest = {
  id: "iphone-gestures",
  requires: ["keyboard-input"],
};

const MOVE_DEAD_ZONE_PX = 26;
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
  let fireHeld = false;
  let sessionStartedAt = 0;
  let sessionStartX = 0;
  let sessionStartY = 0;
  let sessionMaxMove = 0;
  let multiTouchUsed = false;
  let pendingTapTimer = null;
  let pendingTap = null;

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

  function setFire(next) {
    const value = Boolean(next);
    if (fireHeld === value) return;
    fireHeld = value;
    input.setVirtualControl?.("fire", value);
  }

  function choosePrimary() {
    const next = tracked.values().next().value ?? null;
    primaryId = next?.id ?? null;
    setDirection(null);
    if (next) {
      next.originX = next.x;
      next.originY = next.y;
    }
  }

  function updateMovement() {
    const primary = primaryId == null ? null : tracked.get(primaryId);
    if (!primary) {
      setDirection(null);
      return;
    }

    const dx = primary.x - primary.originX;
    const dy = primary.y - primary.originY;
    const move = Math.hypot(dx, dy);
    sessionMaxMove = Math.max(sessionMaxMove, distance(sessionStartX, sessionStartY, primary.x, primary.y));
    if (move < MOVE_DEAD_ZONE_PX) {
      setDirection(null);
      return;
    }

    if (Math.abs(dy) >= Math.abs(dx)) setDirection(dy < 0 ? "forward" : "back");
    else setDirection(dx < 0 ? "left" : "right");
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
    setDirection(null);
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

  panel.addEventListener("touchstart", (event) => {
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

  panel.addEventListener("touchmove", (event) => {
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

  panel.addEventListener("touchend", endTouches, { capture: true, passive: false });
  panel.addEventListener("touchcancel", endTouches, { capture: true, passive: false });

  function reset() {
    tracked.clear();
    primaryId = null;
    setDirection(null);
    setFire(false);
    cancelPendingTap();
    sessionStartedAt = 0;
    sessionMaxMove = 0;
    multiTouchUsed = false;
  }

  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
}
