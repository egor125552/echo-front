import { createStimulants } from "./stimulants.js";
import { TEAM_REVIVE_RANGE } from "./server.js";

export const DOWNED_TEAMMATE_MAP_RADIUS = 35;
export const DOWNED_TEAMMATE_PROMPT_RANGE = 2.5;
export const DOWNED_TEAMMATE_PROMPT_COOLDOWN_MS = 8_000;

export const manifest = {
  id: "battle-royale-injury-integration",
  requires: ["battle-royale-injury", "battle-royale-parachute", "battle-royale-vehicle", "battle-royale-navigation-lifecycle"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on", "events.emit"],
};

// Walking, turning and sprinting do not interrupt ordinary healing.
// Reviving while downed still requires staying put.
const interrupting = (input, downed = false) => Boolean(
  (downed && (input.forward || input.strafe || input.turn || input.sprint))
  || input.fireHeld || input.firePressed
  || input.reload || input.interactPressed || input.platePressed
  || input.parachutePressed || input.jumpPressed || input.posePressed);

const interruptingTeamRevive = input => Boolean(
  Math.abs(Number(input.forward) || 0) > 0.05
  || Math.abs(Number(input.strafe) || 0) > 0.05
  || input.sprint
  || input.fireHeld || input.firePressed
  || input.reload || input.platePressed || input.stimulantPressed
  || input.fastStimulantPressed || input.turboStimulantPressed
  || input.parachutePressed || input.jumpPressed);

const walkingInput = input => ({
  forward: input.forward, strafe: input.strafe, turn: input.turn,
  sprint: input.sprint,
});

function downedTeammateLabel(entity) {
  const rawName = String(entity?.name ?? "").trim();
  if (!rawName) return "Лежащий напарник";
  if (/^напарник(\s|$)/i.test(rawName)) {
    return `Лежащий ${rawName.charAt(0).toLowerCase()}${rawName.slice(1)}`;
  }
  return `Лежащий напарник ${rawName}`;
}

export async function setup(ctx) {
  const match = ctx.services.get("match-api");
  const entities = ctx.services.get("entities");
  const injury = ctx.services.get("injury");
  const movement = ctx.services.get("movement");
  const battleRoyale = ctx.services.get("battle-royale");
  const ragdoll = ctx.services.get("ragdoll");
  const navigation = ctx.services.get("navigation");
  const vehicles = ctx.services.get("vehicles");
  const meds = createStimulants(ctx);
  const proximityPrompts = new Map();
  ctx.services.provide("stimulants", meds);

  navigation.registerProvider?.("downed-teammates", (playerId) => {
    return injury.downedTeammates(playerId, DOWNED_TEAMMATE_MAP_RADIUS).map((entry, index) => ({
      id: `teammate:${entry.entityId}`,
      name: downedTeammateLabel(entry.entity),
      kind: "teammate",
      order: 4 + index * 0.01,
      arriveDistance: 2.0,
      position: {
        x: Number(entry.transform.x) || 0,
        y: Number(entry.transform.y) || 0,
        z: Number(entry.transform.z) || 0,
      },
      metadata: {
        teammateId: entry.entityId,
        reviveProgressMs: entry.reviveProgressMs,
        verticalTolerance: 1.8,
      },
    }));
  });

  const handle = match.handleInput.bind(match);
  match.handleInput = (id, input = {}, now = Date.now()) => {
    if (!battleRoyale.canAct(now)) { movement.setInput(id, {}); return; }
    const requestedKind = input.turboStimulantPressed
      ? "turbo"
      : (input.fastStimulantPressed ? "fast" : (input.stimulantPressed ? "auto" : null));
    if (requestedKind && !interrupting(input, injury.isDowned(id)) && meds.start(id, now, requestedKind)) {
      if (injury.isRevivingTeammate(id)) injury.pauseTeamRevive(id, "stimulant", now);
      handle(id, injury.isDowned(id) ? {} : walkingInput(input), now);
      return;
    }
    if (meds.isUsing(id)) {
      if (interrupting(input, injury.isDowned(id))) meds.cancel(id);
      else {
        handle(id, injury.isDowned(id) ? {} : walkingInput(input), now);
        return;
      }
    }
    if (injury.isDowned(id)) {
      // Bypass jump, parachute, weapon and vehicle input handlers while crawling.
      movement.setInput(id, ragdoll.isActive(id) ? {} : {
        forward: input.forward, strafe: input.strafe, turn: input.turn,
      });
      return;
    }
    if (injury.isRevivingTeammate(id) && interruptingTeamRevive(input)) {
      injury.pauseTeamRevive(id, "action", now);
    }
    if ((input.interactPressed || input.interactHeld) && !vehicles.isDriving?.(id) && !vehicles.isPassenger?.(id)) {
      const nearDowned = injury.nearestDownedTeammate(id, TEAM_REVIVE_RANGE);
      if (nearDowned && injury.startTeamRevive(id, nearDowned.entityId, now)) {
        movement.setInput(id, {});
        return;
      }
    }
    return handle(id, input, now);
  };

  function checkHumanTeammateProximity(now) {
    for (const entity of entities.all()) {
      if (!entity?.alive || entity.bot || entity.kind !== "human") continue;
      if (injury.isDowned(entity.id) || vehicles.isDriving?.(entity.id) || vehicles.isPassenger?.(entity.id)) continue;
      const near = injury.nearestDownedTeammate(entity.id, DOWNED_TEAMMATE_PROMPT_RANGE);
      const stateKey = entity.id;
      if (!near) {
        const prev = proximityPrompts.get(stateKey);
        if (prev && injury.nearestDownedTeammate(entity.id, DOWNED_TEAMMATE_PROMPT_RANGE + 1.0) == null) {
          proximityPrompts.delete(stateKey);
        }
        continue;
      }
      const prev = proximityPrompts.get(stateKey);
      if (
        !prev
        || prev.teammateId !== near.entityId
        || now - prev.announcedAt >= DOWNED_TEAMMATE_PROMPT_COOLDOWN_MS
      ) {
        proximityPrompts.set(stateKey, { teammateId: near.entityId, announcedAt: now });
        injury.emit("downed-teammate-nearby", entity.id, {
          teammateId: near.entityId,
          teammateName: near.entity?.name ?? "Напарник",
          distance: Number(near.distance.toFixed(2)),
          reviveProgressMs: near.reviveProgressMs,
          now,
        });
      }
    }
  }

  const step = match.step.bind(match);
  match.step = (dt, now = Date.now()) => {
    if (battleRoyale.isActive()) {
      checkHumanTeammateProximity(now);
      injury.tick(now);
      meds.tick(now);
    }
    return step(dt, now);
  };
  for (const method of ["snapshot", "snapshotFor"]) {
    const original = match[method].bind(match);
    match[method] = (...args) => {
      const snap = original(...args);
      return { ...snap, entities: snap.entities.map(e => ({ ...e, ...meds.describe(e.id) })) };
    };
  }
  const teams = ctx.services.has("teams") ? ctx.services.get("teams") : null;
  const events = match.eventsForPlayer.bind(match);
  match.eventsForPlayer = (id, packets) => {
    const base = events(id, packets);
    const seen = new Set(base);
    const ownTeam = Number(teams?.teamOf?.(id)) || 0;
    const self = ctx.components.get(id, "Transform");
    return [
      ...base,
      ...packets.filter(p => {
        if (seen.has(p) || !p.event.startsWith("injury:")) return false;
        const payload = p.payload ?? {};
        if (payload.entityId === id || payload.reviverId === id) return true;
        const targetTeam = Number(payload.teamId || teams?.teamOf?.(payload.entityId)) || 0;
        if (ownTeam > 0 && targetTeam === ownTeam) return true;
        if (
          self
          && Number.isFinite(payload.x)
          && Number.isFinite(payload.z)
          && (
            p.event === "injury:stim-started"
            || p.event === "injury:stim-completed"
            || p.event === "injury:stim-cancelled"
            || p.event === "injury:team-revive-started"
            || p.event === "injury:team-revive-paused"
            || p.event === "injury:team-revive-completed"
            || p.event === "injury:revived"
          )
        ) {
          const dist = Math.hypot((Number(self.x) || 0) - Number(payload.x), (Number(self.z) || 0) - Number(payload.z));
          return dist <= Number(payload.radius ?? 36) + 4;
        }
        return false;
      }),
    ];
  };
  for (const method of ["suspendHuman", "disconnectHuman"]) {
    const original = match[method].bind(match);
    match[method] = (id, ...args) => {
      injury.pauseTeamRevive(id, "disconnect");
      meds.cancel(id, "disconnect");
      proximityPrompts.delete(id);
      return original(id, ...args);
    };
  }
  ctx.events.on("injury:downed", ({ entityId, now }) => {
    injury.pauseTeamRevive(entityId, "downed", now);
    meds.cancel(entityId, "downed");
    navigation.stop(entityId, now, "downed", { announce: false });
    vehicles.exit(entityId, now, "downed");
  });
}
