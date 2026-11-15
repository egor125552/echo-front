export const manifest = {
  id: "iphone-gestures",
  requires: ["keyboard-input", "touch-control-settings"],
};

// Match the proven Archipelago feel: a short drag walks and a long drag runs.
const MOVE_DEAD_ZONE_PX = 26;
const RUN_THRESHOLD_PX = 125;
const TURN_MAX_OFFSET_PX = 110;
const SWIPE_MIN_DISTANCE_PX = 46;
const TAP_MAX_MOVE_PX = 20;
const TAP_MAX_DURATION_MS = 260;
const DOUBLE_TAP_WINDOW_MS = 300;
const DOUBLE_TAP_DISTANCE_PX = 90;
const SINGLE_HOLD_MS = 500;

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function clampTurn(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function interactiveTarget(target) {
  return target instanceof Element
    && Boolean(target.closest("button, input, select, textarea, a, summary, [contenteditable='true']"));
}

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const controlSettings = ctx.services.get("touch-control-settings");
  const panel = document.getElementById("game-panel");
  if (!panel) return;

  const tracked = new Map();
  let primaryId = null;
  let currentDirection = null;
  let sprintHeld = false;
  let fireHeld = false;
  let turnValue = 0;
  let interactHoldActive = false;
  let sessionStartedAt = 0;
  let sessionStartX = 0;
  let sessionStartY = 0;
  let sessionMaxMove = 0;
  let sessionMaxTouches = 0;
  let multiTouchUsed = false;
  let twoFingerSwipeTriggered = false;
  let fourFingerSwipeTriggered = false;
  let singleHoldTimer = null;
  let singleHoldTriggered = false;
  let pendingTapTimer = null;
  let pendingTap = null;
  let lastDoubleTap = null;
  let pendingTwoFingerTapTimer = null;
  let twoFingerTapCount = 0;
  let lastTwoFingerTapAt = 0;

  function gameActive() {
    return !panel.hidden && controlSettings.mode === "gestures"
      && document.getElementById("accessible-game-menu")?.hidden !== false;
  }

  function prevent(event) {
    if (event.cancelable) event.preventDefault();
  }

  function changedTouchesIncludeTracked(event) {
    return Array.from(event.changedTouches ?? []).some((touch) => tracked.has(touch.identifier));
  }

  function cancelPendingTap() {
    if (pendingTapTimer != null) clearTimeout(pendingTapTimer);
    pendingTapTimer = null;
    pendingTap = null;
  }

  function cancelPendingTwoFingerTap() {
    if (pendingTwoFingerTapTimer != null) clearTimeout(pendingTwoFingerTapTimer);
    pendingTwoFingerTapTimer = null;
    twoFingerTapCount = 0;
    lastTwoFingerTapAt = 0;
  }

  function cancelSingleHold() {
    if (singleHoldTimer != null) clearTimeout(singleHoldTimer);
    singleHoldTimer = null;
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

  function setTurn(next) {
    const value = clampTurn(next);
    if (Math.abs(turnValue - value) < 0.01) return;
    turnValue = value;
    input.setVirtualControl?.("turn", value);
  }

  function setInteractHold(next) {
    const value = Boolean(next);
    if (interactHoldActive === value) return;
    interactHoldActive = value;
    input.setVirtualControl?.("interact-hold", value);
  }

  function releaseMovement() {
    setDirection(null);
    setSprint(false);
    setTurn(0);
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

  function dispatchJump() {
    input.triggerVirtualAction?.("parachute");
    if (typeof KeyboardEvent === "function" && typeof window?.dispatchEvent === "function") {
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
    }
    ctx.events.emit("gesture:jump", { gesture: "double-tap" });
  }

  function handleSingleFingerTap(x, y, now) {
    // Triple tap within the double-tap window enters parkour pose (or announces
    // parachute flight status if currently airborne).
    if (lastDoubleTap
      && now - lastDoubleTap.time <= DOUBLE_TAP_WINDOW_MS
      && distance(lastDoubleTap.x, lastDoubleTap.y, x, y) <= DOUBLE_TAP_DISTANCE_PX) {
      lastDoubleTap = null;
      cancelPendingTap();
      input.triggerVirtualAction?.("parkour-pose");
      ctx.events.emit("gesture:action", { gesture: "triple-tap", action: "parkour-pose" });
      return;
    }

    if (pendingTap
      && now - pendingTap.time <= DOUBLE_TAP_WINDOW_MS
      && distance(pendingTap.x, pendingTap.y, x, y) <= DOUBLE_TAP_DISTANCE_PX) {
      cancelPendingTap();
      lastDoubleTap = { x, y, time: now };
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

  function commitTwoFingerTap(count) {
    cancelPendingTwoFingerTap();
    if (count === 1) {
      input.triggerVirtualAction?.("reload");
      ctx.events.emit("gesture:action", { gesture: "two-finger-tap", action: "reload" });
    } else if (count === 2) {
      input.triggerVirtualAction?.("armor-plate");
      ctx.events.emit("gesture:action", { gesture: "two-finger-double-tap", action: "armor-plate" });
    } else if (count >= 3) {
      input.triggerVirtualAction?.("stimulant");
      ctx.events.emit("gesture:action", { gesture: "two-finger-triple-tap", action: "stimulant" });
    }
  }

  function handleTwoFingerTap(now) {
    if (twoFingerTapCount > 0 && now - lastTwoFingerTapAt <= DOUBLE_TAP_WINDOW_MS) {
      twoFingerTapCount += 1;
    } else {
      twoFingerTapCount = 1;
    }
    lastTwoFingerTapAt = now;

    if (pendingTwoFingerTapTimer != null) clearTimeout(pendingTwoFingerTapTimer);
    if (twoFingerTapCount >= 3) {
      commitTwoFingerTap(3);
      return;
    }
    const countSnapshot = twoFingerTapCount;
    pendingTwoFingerTapTimer = setTimeout(() => {
      pendingTwoFingerTapTimer = null;
      commitTwoFingerTap(countSnapshot);
    }, DOUBLE_TAP_WINDOW_MS);
  }

  function updateSingleFingerMovement(primary) {
    const dx = primary.x - primary.originX;
    const dy = primary.y - primary.originY;
    const move = Math.hypot(dx, dy);

    if (move < MOVE_DEAD_ZONE_PX) {
      setDirection(null);
      setSprint(false);
      return;
    }

    cancelSingleHold();
    if (Math.abs(dy) >= Math.abs(dx)) setDirection(dy < 0 ? "forward" : "back");
    else setDirection(dx < 0 ? "left" : "right");

    setSprint(move >= RUN_THRESHOLD_PX);
  }

  function updateTwoFingerGesture(points) {
    const [first, second] = points;
    const primary = (primaryId != null && tracked.get(primaryId)) || first;
    const secondary = primary === first ? second : first;

    // If the player was already moving with the primary finger before placing
    // the second finger, keep walking/running with the primary finger and let
    // the second finger smoothly turn the camera left/right.
    if (currentDirection != null && secondary) {
      updateSingleFingerMovement(primary);
      const dx2 = secondary.x - secondary.originX;
      if (Math.abs(dx2) >= MOVE_DEAD_ZONE_PX) {
        const signed = Math.sign(dx2) * Math.max(0.35, (Math.abs(dx2) - MOVE_DEAD_ZONE_PX) / TURN_MAX_OFFSET_PX);
        setTurn(signed);
      } else {
        setTurn(0);
      }
      return;
    }

    const avgDx = ((first.x - first.originX) + (second.x - second.originX)) * 0.5;
    const avgDy = ((first.y - first.originY) + (second.y - second.originY)) * 0.5;

    // Vertical two-finger swipes: up switches weapon, down opens the Map.
    if (!twoFingerSwipeTriggered
      && Math.abs(avgDy) >= SWIPE_MIN_DISTANCE_PX
      && Math.abs(avgDy) > Math.abs(avgDx) * 1.15) {
      twoFingerSwipeTriggered = true;
      setTurn(0);
      if (avgDy < 0) {
        const action = avgDx < -28 ? "weapon-prev" : "weapon-next";
        input.triggerVirtualAction?.(action);
        ctx.events.emit("gesture:action", { gesture: "two-finger-swipe-up", action });
      } else {
        input.triggerVirtualAction?.("map");
        ctx.events.emit("gesture:action", { gesture: "two-finger-swipe-down", action: "map" });
      }
      return;
    }

    // Horizontal two-finger drag rotates the camera/facing direction.
    if (Math.abs(avgDx) >= MOVE_DEAD_ZONE_PX && Math.abs(avgDx) >= Math.abs(avgDy)) {
      const signed = Math.sign(avgDx) * Math.max(0.35, (Math.abs(avgDx) - MOVE_DEAD_ZONE_PX) / TURN_MAX_OFFSET_PX);
      setTurn(signed);
    } else {
      setTurn(0);
    }
  }

  function updateMovement() {
    const count = tracked.size;
    if (!count) {
      releaseMovement();
      return;
    }

    if (count === 1) {
      setTurn(0);
      const primary = (primaryId != null && tracked.get(primaryId)) ?? tracked.values().next().value;
      if (!primary) {
        releaseMovement();
        return;
      }
      updateSingleFingerMovement(primary);
      return;
    }

    const points = [...tracked.values()];
    if (count === 2) {
      updateTwoFingerGesture(points);
      return;
    }

    if (count === 3) {
      // While firing with 3 fingers, allow the primary finger to steer movement
      // and the second finger to turn the camera.
      const primary = (primaryId != null && tracked.get(primaryId)) ?? points[0];
      updateSingleFingerMovement(primary);
      const secondary = points.find((p) => p !== primary);
      if (secondary) {
        const dx2 = secondary.x - secondary.originX;
        if (Math.abs(dx2) >= MOVE_DEAD_ZONE_PX) {
          const signed = Math.sign(dx2) * Math.max(0.35, (Math.abs(dx2) - MOVE_DEAD_ZONE_PX) / TURN_MAX_OFFSET_PX);
          setTurn(signed);
        } else {
          setTurn(0);
        }
      }
      return;
    }

    // 4+ fingers: check for vertical swipe down to announce parachute status.
    if (count >= 4 && !fourFingerSwipeTriggered) {
      const avgDy = points.reduce((sum, p) => sum + (p.y - p.originY), 0) / points.length;
      if (avgDy >= SWIPE_MIN_DISTANCE_PX) {
        fourFingerSwipeTriggered = true;
        input.triggerVirtualAction?.("parachute-status");
        ctx.events.emit("gesture:action", { gesture: "four-finger-swipe-down", action: "parachute-status" });
      }
    }
  }

  function startSession(touch, now) {
    sessionStartedAt = now;
    sessionStartX = touch.clientX;
    sessionStartY = touch.clientY;
    sessionMaxMove = 0;
    sessionMaxTouches = 1;
    multiTouchUsed = false;
    twoFingerSwipeTriggered = false;
    fourFingerSwipeTriggered = false;
    singleHoldTriggered = false;
    cancelSingleHold();
    singleHoldTimer = setTimeout(() => {
      singleHoldTimer = null;
      if (tracked.size !== 1 || multiTouchUsed || sessionMaxMove > TAP_MAX_MOVE_PX) return;
      singleHoldTriggered = true;
      setInteractHold(true);
      ctx.events.emit("gesture:hold", { gesture: "single-hold" });
    }, SINGLE_HOLD_MS);
  }

  function finishSession(x, y, now) {
    cancelSingleHold();
    const hadSingleHold = singleHoldTriggered;
    const maxMove = sessionMaxMove;
    const maxTouches = sessionMaxTouches;
    const duration = Math.max(0, now - sessionStartedAt);

    releaseMovement();
    setFire(false);
    setInteractHold(false);

    if (hadSingleHold) {
      // Stationary 1-finger hold without dragging toggles route auto-guidance (Y).
      if (maxMove <= TAP_MAX_MOVE_PX) {
        input.triggerVirtualAction?.("navigation-face");
        ctx.events.emit("gesture:action", { gesture: "single-hold", action: "navigation-face" });
      }
    } else if (!multiTouchUsed && duration <= TAP_MAX_DURATION_MS && maxMove <= TAP_MAX_MOVE_PX) {
      handleSingleFingerTap(x, y, now);
    } else if (maxTouches === 2 && !twoFingerSwipeTriggered && duration <= TAP_MAX_DURATION_MS && maxMove <= TAP_MAX_MOVE_PX) {
      handleTwoFingerTap(now);
    } else if (maxTouches >= 4 && !fourFingerSwipeTriggered && duration <= 320 && maxMove <= 30) {
      input.triggerVirtualAction?.("navigation-face");
      ctx.events.emit("gesture:action", { gesture: "four-finger-tap", action: "navigation-face" });
    }

    primaryId = null;
    sessionStartedAt = 0;
    sessionMaxMove = 0;
    sessionMaxTouches = 0;
    multiTouchUsed = false;
    twoFingerSwipeTriggered = false;
    fourFingerSwipeTriggered = false;
    singleHoldTriggered = false;
  }

  function addChangedTouches(event) {
    let accepted = false;
    const now = nowMs();
    for (const touch of Array.from(event.changedTouches ?? [])) {
      // Controls are never part of a gesture. This stays true even when another
      // finger is already steering, so buttons remain usable during movement.
      if (interactiveTarget(touch.target)) continue;
      const point = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        startX: touch.clientX,
        startY: touch.clientY,
        originX: touch.clientX,
        originY: touch.clientY,
        startedAt: now,
      };
      tracked.set(touch.identifier, point);
      accepted = true;
      if (primaryId == null) {
        primaryId = touch.identifier;
        startSession(touch, now);
      }
    }
    sessionMaxTouches = Math.max(sessionMaxTouches, tracked.size);
    return accepted;
  }

  function updateChangedTouches(event) {
    for (const touch of Array.from(event.changedTouches ?? [])) {
      const point = tracked.get(touch.identifier);
      if (!point) continue;
      point.x = touch.clientX;
      point.y = touch.clientY;
      const moved = distance(point.startX, point.startY, touch.clientX, touch.clientY);
      sessionMaxMove = Math.max(sessionMaxMove, moved);
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

  // During a visible match, every non-control point in the document is a game
  // gesture surface. A swipe that starts outside #game-panel therefore cannot
  // turn into normal page scrolling and carry the controls off-screen.
  document.addEventListener("touchstart", (event) => {
    if (!gameActive()) return;
    const accepted = addChangedTouches(event);
    if (!accepted) return;
    prevent(event);

    if (tracked.size > 1) {
      multiTouchUsed = true;
      cancelPendingTap();
      cancelSingleHold();
    }
    if (tracked.size === 3) setFire(true);
    else if (tracked.size >= 4) setFire(false);
    updateMovement();
  }, { capture: true, passive: false });

  document.addEventListener("touchmove", (event) => {
    if (!tracked.size || !changedTouchesIncludeTracked(event)) return;
    prevent(event);
    updateChangedTouches(event);
    updateMovement();
  }, { capture: true, passive: false });

  function endTouches(event) {
    if (!tracked.size || !changedTouchesIncludeTracked(event)) return;
    prevent(event);
    updateChangedTouches(event);
    const { lastX, lastY, primaryEnded } = removeChangedTouches(event);

    if (tracked.size !== 3) setFire(false);
    if (!tracked.size) {
      finishSession(lastX, lastY, nowMs());
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
    cancelSingleHold();
    releaseMovement();
    setFire(false);
    setInteractHold(false);
    cancelPendingTap();
    cancelPendingTwoFingerTap();
    lastDoubleTap = null;
    sessionStartedAt = 0;
    sessionMaxMove = 0;
    sessionMaxTouches = 0;
    multiTouchUsed = false;
    twoFingerSwipeTriggered = false;
    fourFingerSwipeTriggered = false;
    singleHoldTriggered = false;
  }

  ctx.events.on("touch-control:mode-changed", reset);
  ctx.events.on("ui:menu", ({ open } = {}) => { if (open) reset(); });
  window.addEventListener("blur", reset);
  window.addEventListener("pagehide", reset);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
}
