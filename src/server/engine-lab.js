/**
 * An interactive experiment over the actual Engine Control game and Rapier world.
 * This is a separate, token-gated Durable Object room. Nothing here is a second
 * physics engine or a mock of game behavior.
 */
const MAX_SAMPLES = 2400;
const MAX_EVENTS = 180;
const MAX_ANOMALIES = 120;
const SETUP_COMMANDS = new Set([
  "entity.spawn", "entity.remove", "component.patch", "component.set",
  "game.step", "physics.raycast", "physics.stats", "physics.contact-forces",
  "entity.inspect", "bot.inspect", "match.info",
]);
const SETUP_SERVICES = new Map([
  ["match-api", new Set(["connectHuman", "handleInput"])],
  ["movement", new Set(["teleport"])],
  ["bot-vehicles", new Set(["assign"])],
  ["physics", new Set([
    "createWall", "setDynamicBodyTranslation", "setDynamicBodyLinearVelocity",
  ])],
  ["vehicles", new Set(["setInput"])],
]);

function bounded(value, fallback, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, Math.floor(n))) : fallback;
}
function elapsedText(ms) {
  const seconds = Math.floor(ms / 1000);
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":"
    + String(seconds % 60).padStart(2, "0");
}
function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function position(state) {
  return state ? { x: finite(state.x), y: finite(state.y), z: finite(state.z) } : null;
}
function horizontal(a, b) {
  if (!a || !b || a.x === null || a.z === null || b.x === null || b.z === null) return null;
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function checkSetupCommand(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Preparation command must be an object");
  }
  if (request.command === "service.call") {
    const args = request.args ?? {};
    if (!SETUP_SERVICES.get(args.service)?.has(args.method)) {
      throw new Error("Service method not permitted in scenario preparation");
    }
    return;
  }
  if (!SETUP_COMMANDS.has(request.command)) {
    throw new Error("Command not permitted in scenario preparation: " + String(request.command));
  }
}
function validObjective(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.type === "event-count") {
    const event = String(value.event ?? "").trim();
    if (!/^[a-z0-9:-]{3,80}$/.test(event)) throw new Error("event-count requires an event");
    const entityId = value.entityId == null ? null : String(value.entityId);
    const minimumCount = Number(value.minimumCount);
    if (!Number.isInteger(minimumCount) || minimumCount < 1 || minimumCount > 100000) {
      throw new Error("event-count requires minimumCount from 1 to 100000");
    }
    return Object.freeze({ type: "event-count", event, entityId, minimumCount });
  }
  if (value.type === "vehicle-arrival") {
    const vehicleId = String(value.vehicleId ?? "").trim();
    const destination = value.destination;
    const maxSeconds = Number(value.maximumSeconds);
    const toleranceMeters = Number(value.toleranceMeters);
    if (!vehicleId || !destination || !Number.isFinite(destination.x)
      || !Number.isFinite(destination.z)) {
      throw new Error("vehicle-arrival requires a vehicleId and finite destination x/z");
    }
    if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 1800
      || !Number.isFinite(toleranceMeters) || toleranceMeters < 1 || toleranceMeters > 100) {
      throw new Error("vehicle-arrival requires maximumSeconds and toleranceMeters from 1 to 100");
    }
    return Object.freeze({
      type: "vehicle-arrival", vehicleId,
      destination: Object.freeze({ x: Number(destination.x), z: Number(destination.z) }),
      maximumSeconds: maxSeconds, toleranceMeters,
      driverId: value.driverId == null ? null : String(value.driverId),
    });
  }
  if (value.type !== "vehicle-progress") throw new Error("Unsupported objective type");
  const vehicleId = String(value.vehicleId ?? "").trim();
  if (!vehicleId) throw new Error("vehicle-progress requires vehicleId");
  const minimumMeters = Number(value.minimumMeters);
  if (!Number.isFinite(minimumMeters) || minimumMeters <= 0 || minimumMeters > 2000) {
    throw new Error("vehicle-progress requires minimumMeters between 0 and 2000");
  }
  const maximumSeconds = Number(value.maximumSeconds);
  if (!Number.isFinite(maximumSeconds) || maximumSeconds <= 0 || maximumSeconds > 1800) {
    throw new Error("vehicle-progress requires maximumSeconds between 0 and 1800");
  }
  return Object.freeze({ type: "vehicle-progress", vehicleId, minimumMeters, maximumSeconds });
}

export class EngineLab {
  constructor(game, { mode, room, watch = [], objectives = [] } = {}) {
    this.game = game;
    this.mode = mode;
    this.room = room;
    this.phase = "preparing";
    this.simulatedMs = 0;
    this.startedAt = null;
    this.startedWallAt = null;
    this.finishedWallAt = null;
    this.stepCount = 0;
    this.samples = [];
    this.sampleCounter = 0;
    this.eventCounts = new Map();
    this.vehicleProgress = new Map();
    this.vehicleArrivals = new Map();
    this.anomalies = [];
    this.events = [];
    this.setupHistory = [];
    this.watch = [...new Set(watch.map(String))].slice(0, 12);
    this.objectives = objectives.map(validObjective);
    this.initialVehiclePositions = new Map();
    this.lastVehicleSamples = new Map();
    this.lastStallAt = new Map();
    this.lastObservationClock = null;
  }

  status() {
    return {
      mode: this.mode, room: this.room, phase: this.phase,
      simulatedMs: Math.round(this.simulatedMs),
      gameTime: elapsedText(this.simulatedMs),
      realElapsedMs: this.startedWallAt === null ? 0
        : Math.max(0, (this.finishedWallAt ?? Date.now()) - this.startedWallAt),
      realTime: elapsedText(this.startedWallAt === null ? 0
        : Math.max(0, (this.finishedWallAt ?? Date.now()) - this.startedWallAt)),
      steps: this.stepCount,
      observations: this.sampleCounter,
      anomalies: this.anomalies.length,
      watchedEntities: this.watch,
      objectives: this.objectives,
    };
  }

  async prepare(commands) {
    if (this.phase !== "preparing") throw new Error("Scenario preparation is closed");
    if (!Array.isArray(commands) || commands.length > 24) throw new Error("Supply at most 24 commands");
    const results = [];
    for (const request of commands) {
      checkSetupCommand(request);
      const result = await this.game.command(request);
      const entry = { command: request.command, ok: result.ok, result: result.result ?? null, error: result.error ?? null };
      this.setupHistory.push(entry);
      results.push(entry);
      if (!result.ok) break;
    }
    return { ...this.status(), results };
  }

  start() {
    if (this.phase !== "preparing") throw new Error("Scenario already started");
    const vehicles = this.game.host.services.has("vehicles")
      ? this.game.host.services.get("vehicles") : null;
    for (const objective of this.objectives) {
      if (!["vehicle-progress", "vehicle-arrival"].includes(objective.type)) continue;
      const state = vehicles?.stateFor?.(objective.vehicleId);
      if (!state) throw new Error("Objective vehicle does not exist: " + objective.vehicleId);
      this.initialVehiclePositions.set(objective.vehicleId, position(state));
    }
    this.phase = "running";
    this.startedAt = Date.now();
    this.startedWallAt = Date.now();
    this.sample();
    return { ...this.status(), baseline: this.samples.at(-1) };
  }

  captureEntity(entityId) {
    const host = this.game.host;
    const entity = host.services.get("entities").get(entityId);
    if (!entity) return { entityId, missing: true };
    const t = host.components.get(entityId, "Transform");
    const vehicles = host.services.has("vehicles") ? host.services.get("vehicles") : null;
    const car = vehicles?.vehicleForDriver?.(entityId) ?? null;
    const bot = entity.bot && host.services.has("bot-vehicles")
      ? host.services.get("bot-vehicles").stateFor?.(entityId) ?? null : null;
    return {
      entityId, bot: Boolean(entity.bot), alive: Boolean(entity.alive),
      position: position(t), vehicleId: car?.id ?? bot?.vehicleId ?? null,
      vehicle: car ? {
        position: position(car), speed: finite(car.speed),
        forwardSpeed: finite(car.forwardSpeed), angle: finite(car.angle),
        driverId: car.driverId ?? null, input: car.input ?? null,
      } : null,
      brainDecision: entity.bot && host.services.has("bot-brain")
        ? host.services.get("bot-brain").commitmentFor?.(entityId) ?? null : null,
      decision: bot ? {
        phase: bot.phase ?? null, destination: position(bot.destination),
        recoveries: finite(bot.recoveries), input: bot.input ?? null,
        routeIndex: bot.route?.index ?? null,
      } : null,
    };
  }

  sample() {
    const services = this.game.host.services;
    const cars = services.has("vehicles") ? services.get("vehicles") : null;
    const botVehicles = services.has("bot-vehicles") ? services.get("bot-vehicles") : null;
    const relevant = this.watch.length
      ? this.watch
      : (botVehicles?.summary?.().states ?? []).slice(0, 4).map(state => state.id);
    if (!relevant.length) {
      relevant.push(...services.get("entities").all().slice(0, 4).map(entity => entity.id));
    }
    const entities = relevant.map(id => this.captureEntity(id));
    const objectiveVehicles = this.objectives.filter(objective =>
      objective.type === "vehicle-progress" || objective.type === "vehicle-arrival"
    ).map(objective => {
      const state = cars?.stateFor?.(objective.vehicleId) ?? null;
      return {
        vehicleId: objective.vehicleId, position: position(state),
        speed: finite(state?.speed), forwardSpeed: finite(state?.forwardSpeed),
        driverId: state?.driverId ?? null,
        progressMeters: horizontal(
          position(state), this.initialVehiclePositions.get(objective.vehicleId),
        ),
        ...(objective.type === "vehicle-arrival"
          ? { distanceToDestinationMeters: horizontal(position(state), objective.destination) }
          : {}),
      };
    });
    const row = {
      index: this.sampleCounter++,
      simulatedMs: Math.round(this.simulatedMs),
      gameTime: elapsedText(this.simulatedMs),
      entities, objectiveVehicles,
    };
    for (const [index, entry] of objectiveVehicles.entries()) {
      const objective = this.objectives.filter(item =>
        item.type === "vehicle-progress" || item.type === "vehicle-arrival"
      )[index];
      if (entry.progressMeters !== null) {
        const previous = this.vehicleProgress.get(entry.vehicleId);
        if (!previous || entry.progressMeters > previous.maxMeters) {
          this.vehicleProgress.set(entry.vehicleId, {
            maxMeters: entry.progressMeters, atSeconds: this.simulatedMs / 1000,
          });
        }
      }
      if (objective.type === "vehicle-arrival" && entry.distanceToDestinationMeters !== null) {
        const previous = this.vehicleArrivals.get(objective);
        const driverMatches = objective.driverId === null || entry.driverId === objective.driverId;
        const reached = driverMatches && entry.distanceToDestinationMeters <= objective.toleranceMeters
          && this.simulatedMs / 1000 <= objective.maximumSeconds;
        this.vehicleArrivals.set(objective, {
          closestMeters: Math.min(previous?.closestMeters ?? Infinity, entry.distanceToDestinationMeters),
          reachedAtSeconds: previous?.reachedAtSeconds
            ?? (reached ? this.simulatedMs / 1000 : null),
        });
      }
    }
    this.samples.push(row);
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    for (const observation of entities) {
      const { vehicle, decision, entityId } = observation;
      if (!vehicle || !decision) { this.lastVehicleSamples.delete(entityId); continue; }
      const previous = this.lastVehicleSamples.get(entityId);
      const goalDistance = horizontal(vehicle.position, decision.destination);
      const activelyDriving = vehicle.driverId === entityId
        && ["travel", "reverse", "brake"].includes(decision.phase)
        && (goalDistance === null || goalDistance > 15);
      const moving = previous && horizontal(previous.position, vehicle.position) > .5;
      if (moving || !activelyDriving) {
        this.lastVehicleSamples.set(entityId, {
          since: this.simulatedMs, position: vehicle.position,
        });
        continue;
      }
      const since = previous?.since ?? this.simulatedMs;
      if (this.simulatedMs - since >= 4000
        && this.simulatedMs - (this.lastStallAt.get(entityId) ?? -Infinity) >= 4000) {
        this.anomalies.push({
          type: "possible-stalled-driver", entityId, vehicleId: observation.vehicleId,
          atGameTime: elapsedText(this.simulatedMs), simulatedMs: this.simulatedMs,
          phase: decision.phase,
          reason: "Driving toward a distant goal, displacement under 0.5 m for at least 4 simulated seconds",
          requestedForward: finite(decision.input?.forward),
          actualSpeed: vehicle.speed,
          goalDistance,
          position: vehicle.position,
        });
        if (this.anomalies.length > MAX_ANOMALIES) this.anomalies.shift();
        this.lastStallAt.set(entityId, this.simulatedMs);
      }
      if (!previous) this.lastVehicleSamples.set(entityId, { since, position: vehicle.position });
    }
    for (const packet of this.game.drainEvents()) {
      const eventKey = packet.event + ":" + (packet.payload?.entityId ?? "");
      this.eventCounts.set(eventKey, (this.eventCounts.get(eventKey) ?? 0) + 1);
      this.eventCounts.set(packet.event + ":*", (this.eventCounts.get(packet.event + ":*") ?? 0) + 1);
      this.events.push({
        simulatedMs: Math.round(this.simulatedMs),
        event: packet.event, payload: packet.payload ?? null,
      });
    }
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    return row;
  }

  async advance({ steps = 20, sampleEvery = 10 } = {}) {
    if (this.phase !== "running") throw new Error("Scenario is not running");
    const total = bounded(steps, 20, 100);
    const interval = bounded(sampleEvery, 10, 20);
    let remaining = total;
    const previousAnomalies = this.anomalies.length;
    while (remaining > 0) {
      const count = Math.min(remaining, interval);
      const result = await this.game.command({
        command: "game.step", args: { dt: .05, steps: count },
      });
      if (!result.ok) throw new Error("Real engine step failed: " + result.error);
      remaining -= count;
      this.stepCount += count;
      this.simulatedMs += count * 50;
      this.sample();
    }
    return {
      ...this.status(),
      last: this.samples.at(-1),
      newAnomalies: this.anomalies.slice(previousAnomalies),
      recentEvents: this.events.slice(-5),
    };
  }

  observe({ fromIndex = 0, limit = 20 } = {}) {
    const first = Math.max(0, Math.floor(Number(fromIndex) || 0));
    return {
      ...this.status(),
      samples: this.samples.filter(row => row.index >= first).slice(0, bounded(limit, 20, 60)),
      anomalies: this.anomalies.slice(-20),
      recentEvents: this.events.slice(-20),
      nextIndex: this.sampleCounter,
    };
  }

  report() {
    const latest = this.samples.at(-1) ?? null;
    const results = this.objectives.map(objective => {
      if (objective.type === "event-count") {
        const key = objective.event + ":" + (objective.entityId ?? "*");
        const actualCount = this.eventCounts.get(key) ?? 0;
        return {
          objective, actualCount,
          status: actualCount >= objective.minimumCount ? "passed"
            : this.phase === "finished" ? "failed" : "incomplete",
        };
      }
      if (objective.type === "vehicle-arrival") {
        const arrival = this.vehicleArrivals.get(objective) ?? null;
        const reachedAtSeconds = arrival?.reachedAtSeconds ?? null;
        return {
          objective, closestDistanceMeters: arrival?.closestMeters ?? null,
          reachedAtSeconds,
          status: reachedAtSeconds !== null ? "passed"
            : this.simulatedMs / 1000 >= objective.maximumSeconds || this.phase === "finished"
              ? "failed" : "incomplete",
        };
      }
      const state = latest?.objectiveVehicles.find(v => v.vehicleId === objective.vehicleId);
      const best = this.vehicleProgress.get(objective.vehicleId);
      const progress = state?.progressMeters ?? null;
      const passed = (best?.maxMeters ?? 0) >= objective.minimumMeters
        && (best?.atSeconds ?? Infinity) <= objective.maximumSeconds;
      const timedOut = this.simulatedMs / 1000 >= objective.maximumSeconds;
      return {
        objective, actualProgressMeters: progress,
        maximumProgressMeters: best?.maxMeters ?? null,
        achievedAtSeconds: best?.atSeconds ?? null,
        observedGameSeconds: this.simulatedMs / 1000,
        status: passed ? "passed" : timedOut || this.phase === "finished" ? "failed" : "incomplete",
      };
    });
    return {
      ...this.status(), objectives: results,
      verdict: results.length === 0 ? "no-objectives"
        : results.some(result => result.status === "failed") ? "failed"
          : results.every(result => result.status === "passed")
            ? this.anomalies.length ? "needs-review" : "passed"
            : "incomplete",
      first: this.samples[0] ?? null,
      last: latest,
      anomalies: this.anomalies.slice(-35),
      setupHistory: this.setupHistory.map(({ command, ok, error }) => ({ command, ok, error })),
      recentEvents: this.events.slice(-20),
      eventCounts: Object.fromEntries([...this.eventCounts].filter(([name]) => name.endsWith(":*")).slice(0, 100)),
    };
  }

  finish() {
    if (this.phase !== "running") throw new Error("Scenario is not running");
    this.phase = "finished";
    this.finishedWallAt = Date.now();
    return this.report();
  }
}

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
export async function handleEngineLabRequest(room, request) {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "POST required" }, { status: 405, headers });
  }
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers }); }
  const action = String(body?.action ?? "");
  try {
    if (action === "scenario.create") {
      if (room.lab || room.game || room.gameLoopTimer || room.ctx.getWebSockets().length) {
        throw new Error("Scenario requires a fresh isolated game room");
      }
      const watch = Array.isArray(body.watch) ? body.watch : [];
      const objectives = Array.isArray(body.objectives) ? body.objectives : [];
      if (watch.length > 12 || objectives.length > 8) throw new Error("Too many watched entities or objectives");
      objectives.forEach(validObjective);
      const mode = new URL(request.url).searchParams.get("mode");
      await room.ensureGame(mode, { tutorial: Boolean(body.tutorial) });
      room.stopGameLoop();
      room.lab = new EngineLab(room.game, {
        mode: room.mode, room: new URL(request.url).searchParams.get("room"),
        watch, objectives,
      });
      return Response.json({ ok: true, ...room.lab.status() }, { headers });
    }
    const lab = room.lab;
    if (!lab) throw new Error("Scenario not created");
    let result;
    switch (action) {
      case "scenario.prepare": result = await lab.prepare(body.commands); break;
      case "scenario.start": result = lab.start(); break;
      case "scenario.advance": result = await lab.advance(body); break;
      case "scenario.observe": result = lab.observe(body); break;
      case "scenario.report": result = lab.report(); break;
      case "scenario.finish": result = lab.finish(); break;
      case "scenario.input": {
        if (lab.phase !== "running") throw new Error("Input is only available during a running scenario");
        const playerId = String(body.playerId ?? "");
        const entity = lab.game.host.services.get("entities").get(playerId);
        if (!entity || entity.bot) throw new Error("Only a real human-controlled entity accepts input");
        if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
          throw new Error("Invalid input");
        }
        lab.game.api.handleInput(playerId, structuredClone(body.input), Date.now());
        result = { ...lab.status(), playerId, inputAccepted: true };
        break;
      }
      default: throw new Error("Unknown scenario action: " + action);
    }
    return Response.json({ ok: true, result }, { headers });
  } catch (error) {
    return Response.json({
      ok: false, action, error: String(error?.message ?? error).slice(0, 500),
      phase: room.lab?.phase ?? null,
    }, { status: 400, headers });
  }
}
