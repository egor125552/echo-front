from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}")
    p.write_text(text.replace(old, new, 1))


nav = "src/plugins/battle-royale-navigation/server.js"
replace_once(
    nav,
    '''  function updatePlayer(playerId, now = Date.now()) {\n''',
    '''  function replanActiveForModeChange(playerId, now = Date.now()) {\n    const state = playerStates.get(playerId);\n    if (!state?.activeTargetId) return false;\n    const target = resolveTarget(playerId, state.activeTargetId);\n    if (!target) return false;\n    return replan(playerId, target, now);\n  }\n\n  function updatePlayer(playerId, now = Date.now()) {\n''',
)
replace_once(
    nav,
    '''  function publicState(playerId, now = Date.now()) {\n    const state = playerState(playerId);\n    const targets = availableTargets(playerId);\n    const selected = targets.find((target) => target.id === state.selectedTargetId) ?? null;\n    const active = targets.find((target) => target.id === state.activeTargetId) ?? null;\n    const transform = transformFor(playerId);\n''',
    '''  function publicState(playerId, now = Date.now()) {\n    const state = playerState(playerId);\n    let targets = availableTargets(playerId);\n    let selected = targets.find((target) => target.id === state.selectedTargetId) ?? null;\n    let active = targets.find((target) => target.id === state.activeTargetId) ?? null;\n\n    // Entering or leaving a vehicle changes both route geometry and building\n    // approach points. Replan before exposing a snapshot so spoken distance\n    // never gets stuck on the old vehicle route until navigation is toggled.\n    if (active && state.routeMeta?.mode !== routeModeFor(playerId)) {\n      replan(playerId, active, now);\n      targets = availableTargets(playerId);\n      selected = targets.find((target) => target.id === state.selectedTargetId) ?? null;\n      active = targets.find((target) => target.id === state.activeTargetId) ?? null;\n    }\n\n    const transform = transformFor(playerId);\n''',
)
replace_once(
    nav,
    '''  ctx.events.on("entity:removed", ({ entityId }) => {\n    playerStates.delete(entityId);\n  });\n\n  ctx.services.provide("navigation", {\n''',
    '''  ctx.events.on("vehicle:entered", ({ entityId, now }) => {\n    if (entityId) replanActiveForModeChange(entityId, Number(now) || Date.now());\n  });\n  ctx.events.on("vehicle:exited", ({ entityId, now }) => {\n    if (entityId) replanActiveForModeChange(entityId, Number(now) || Date.now());\n  });\n  ctx.events.on("vehicle:driver-lost", ({ entityId, now }) => {\n    if (entityId) replanActiveForModeChange(entityId, Number(now) || Date.now());\n  });\n\n  ctx.events.on("entity:removed", ({ entityId }) => {\n    playerStates.delete(entityId);\n  });\n\n  ctx.services.provide("navigation", {\n''',
)

validator = "src/plugins/battle-royale-building-design-validator/server.js"
replace_once(
    validator,
    '''  for (const stair of spec?.stairs ?? []) {\n''',
    '''  const primaryDoor = spec?.doors?.[0] ?? null;\n  if (primaryDoor) {\n    const primarySide = String(primaryDoor.side ?? "east");\n    const primaryOffset = Math.abs(finite(primaryDoor.offset));\n    const primaryWidth = Math.max(0.8, Math.abs(finite(primaryDoor.width, 2.2)));\n    if (primarySide !== "east") {\n      warnings.push(`primary door ${primaryDoor.id ?? "unnamed"} does not face east like the warehouse front entrance`);\n    }\n    if (primaryOffset > 0.35) {\n      warnings.push(`primary door ${primaryDoor.id ?? "unnamed"} is not centered on the front wall`);\n    }\n    if (primaryWidth < 3.2) {\n      warnings.push(`primary door ${primaryDoor.id ?? "unnamed"} is narrower than the preferred 3.2 meter accessible entrance`);\n    }\n  }\n\n  for (const stair of spec?.stairs ?? []) {\n''',
)
replace_once(
    validator,
    '''  const failed = reports.filter((report) => !report.ok);\n  if (failed.length) {\n''',
    '''  const failed = reports.filter((report) => !report.ok);\n  const warned = reports.filter((report) => report.warnings.length);\n  if (warned.length) {\n    console.warn(\n      `Building design warnings: ${warned.map((report) => `${report.id}: ${report.warnings.join("; ")}`).join(" | ")}`,\n    );\n  }\n  if (failed.length) {\n''',
)

print("Navigation mode replan and house entrance guard patched.")
