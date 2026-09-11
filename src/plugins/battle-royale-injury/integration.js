import { createStimulants } from "./stimulants.js";

export const manifest = {
  id: "battle-royale-injury-integration",
  requires: ["battle-royale-injury", "battle-royale-parachute", "battle-royale-vehicle", "battle-royale-navigation-lifecycle"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on", "events.emit"],
};

const interrupting = input => Boolean(input.forward || input.strafe || input.turn || input.sprint
  || input.fireHeld || input.firePressed || input.reload || input.interactPressed
  || input.platePressed || input.parachutePressed || input.jumpPressed || input.posePressed);

export async function setup(ctx) {
  const match = ctx.services.get("match-api");
  const injury = ctx.services.get("injury");
  const movement = ctx.services.get("movement");
  const battleRoyale = ctx.services.get("battle-royale");
  const ragdoll = ctx.services.get("ragdoll");
  const navigation = ctx.services.get("navigation");
  const meds = createStimulants(ctx);
  ctx.services.provide("stimulants", meds);
  const handle = match.handleInput.bind(match);
  match.handleInput = (id, input = {}, now = Date.now()) => {
    if (!battleRoyale.canAct(now)) { movement.setInput(id, {}); return; }
    if (input.stimulantPressed && meds.start(id, now)) { handle(id, {}, now); return; }
    if (meds.isUsing(id)) {
      if (interrupting(input)) meds.cancel(id);
      else { handle(id, {}, now); return; }
    }
    if (injury.isDowned(id)) {
      // Bypass jump, parachute, weapon and vehicle input handlers while crawling.
      movement.setInput(id, ragdoll.isActive(id) ? {} : {
        forward: input.forward, strafe: input.strafe, turn: input.turn,
      });
      return;
    }
    return handle(id, input, now);
  };
  const step = match.step.bind(match);
  match.step = (dt, now = Date.now()) => {
    if (battleRoyale.isActive()) { injury.tick(now); meds.tick(now); }
    return step(dt, now);
  };
  for (const method of ["snapshot", "snapshotFor"]) {
    const original = match[method].bind(match);
    match[method] = (...args) => {
      const snap = original(...args);
      return { ...snap, entities: snap.entities.map(e => ({ ...e, ...meds.describe(e.id) })) };
    };
  }
  const events = match.eventsForPlayer.bind(match);
  match.eventsForPlayer = (id, packets) => {
    const base = events(id, packets);
    const seen = new Set(base);
    return [...base, ...packets.filter(p => !seen.has(p) && p.event.startsWith("injury:") && p.payload.entityId === id)];
  };
  for (const method of ["suspendHuman", "disconnectHuman"]) {
    const original = match[method].bind(match);
    match[method] = (id, ...args) => { meds.cancel(id, "disconnect"); return original(id, ...args); };
  }
  ctx.events.on("injury:downed", ({ entityId, now }) => {
    meds.cancel(entityId, "downed");
    navigation.stop(entityId, now, "downed", { announce: false });
    ctx.services.get("vehicles").exit(entityId, now, "downed");
  });
}
