// The slope supports walking; the solid side and back faces block it.
export function isStairSideCollision(collision) {
  return collision?.worldObject?.kind === "building-stair"
    && Number.isFinite(collision.normal?.y)
    && Math.abs(collision.normal.y) < 0.3;
}
