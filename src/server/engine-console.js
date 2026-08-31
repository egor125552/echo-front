import { ENGINE_CONTROL } from "../config/engine-control.js";

const FORBIDDEN_METHOD_NAMES = new Set(["constructor", "prototype", "__proto__"]);

function cloneForOutput(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value ?? null;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value !== "object") return String(value);
  if (depth >= 7) return "[Max depth]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 256).map((entry) => cloneForOutput(entry, depth + 1, seen));
  }
  if (value instanceof Map) {
    return [...value.entries()].slice(0, 256).map(([key, entry]) => [
      cloneForOutput(key, depth + 1, seen),
      cloneForOutput(entry, depth + 1, seen),
    ]);
  }
  if (value instanceof Set) {
    return [...value.values()].slice(0, 256).map((entry) => cloneForOutput(entry, depth + 1, seen));
  }

  const result = {};
  for (const key of Object.keys(value).slice(0, 256)) {
    try {
      result[key] = cloneForOutput(value[key], depth + 1, seen);
    } catch (error) {
      result[key] = `[Unreadable: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }
  return result;
}

function requireObject(value, name = "args") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function requireString(value, name) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function publicMethods(service) {
  if (!service || (typeof service !== "object" && typeof service !== "function")) return [];
  return Object.keys(service)
    .filter((name) => !FORBIDDEN_METHOD_NAMES.has(name) && typeof service[name] === "function")
    .sort();
}

export function createEngineConsole(game) {
  if (!game?.host) throw new Error("Engine console requires a running game");
  const host = game.host;
  const commands = new Map();
  const history = [];
  let simulationClock = Date.now();

  function register(name, description, handler) {
    if (commands.has(name)) throw new Error(`Duplicate engine command: ${name}`);
    commands.set(name, { name, description, handler });
  }

  function entities() {
    return host.services.has("entities") ? host.services.get("entities") : null;
  }

  function botBrain() {
    return host.services.has("bot-brain") ? host.services.get("bot-brain") : null;
  }

  function inspectEntity(entityId) {
    const service = entities();
    const entity = service?.get?.(entityId) ?? null;
    if (!entity) throw new Error(`Unknown entity: ${entityId}`);
    const brain = botBrain();
    return {
      ...cloneForOutput(entity),
      components: host.components.snapshot(entityId),
      botProfile: entity.bot && brain?.profile ? cloneForOutput(brain.profile(entityId)) : null,
      botDecision: entity.bot && brain?.commitmentFor ? cloneForOutput(brain.commitmentFor(entityId)) : null,
    };
  }

  async function executeInternal(commandName, args = {}, meta = {}, { record = true } = {}) {
    const command = commands.get(commandName);
    if (!command) throw new Error(`Unknown engine command: ${commandName}`);
    const startedAt = Date.now();
    const value = await command.handler(requireObject(args), meta);
    const result = cloneForOutput(value);
    if (record) {
      history.push({
        at: startedAt,
        command: commandName,
        args: cloneForOutput(args),
        durationMs: Date.now() - startedAt,
        result,
      });
      const max = Math.max(8, Number(ENGINE_CONTROL.maxHistory) || 96);
      if (history.length > max) history.splice(0, history.length - max);
    }
    return result;
  }

  register("engine.help", "List registered engine commands.", async () => (
    [...commands.values()].map(({ name, description }) => ({ name, description }))
  ));

  register("engine.status", "Inspect the command console and current game.", async () => ({
    mode: game.mode,
    commandCount: commands.size,
    commands: [...commands.keys()].sort(),
    plugins: host.plugins.map((plugin) => ({
      id: plugin.manifest.id,
      version: plugin.manifest.version ?? null,
    })),
    services: [...host.services.services.keys()].sort(),
    componentTypes: [...host.components.types.keys()].sort(),
    historyDepth: history.length,
    simulationClock,
  }));

  register("engine.history", "Return recent executed engine commands.", async ({ limit = 25 }) => {
    const safeLimit = Math.max(1, Math.min(ENGINE_CONTROL.maxHistory, Number(limit) || 25));
    return history.slice(-safeLimit);
  });

  register("engine.batch", "Execute several registered commands sequentially in one engine turn.", async ({ commands: batch }, meta) => {
    if (!Array.isArray(batch)) throw new Error("commands must be an array");
    const max = Math.max(1, Number(ENGINE_CONTROL.maxBatchCommands) || 32);
    if (batch.length > max) throw new Error(`Batch is limited to ${max} commands`);
    const results = [];
    for (const entry of batch) {
      const item = requireObject(entry, "batch command");
      const name = requireString(item.command, "batch command.command");
      if (name === "engine.batch") throw new Error("Nested engine.batch is not allowed");
      try {
        const result = await executeInternal(name, item.args ?? {}, meta, { record: false });
        results.push({ ok: true, command: name, result });
      } catch (error) {
        results.push({
          ok: false,
          command: name,
          error: error instanceof Error ? error.message : String(error),
        });
        if (item.continueOnError !== true) break;
      }
    }
    return results;
  });

  register("plugin.list", "List loaded plugins and versions.", async () => (
    host.plugins.map((plugin) => ({
      id: plugin.manifest.id,
      version: plugin.manifest.version ?? null,
      requires: plugin.manifest.requires ?? [],
      capabilities: plugin.manifest.capabilities ?? [],
    }))
  ));

  register("service.list", "List services, owners and callable public methods.", async () => (
    [...host.services.services.entries()].map(([name, service]) => ({
      name,
      owner: host.services.owners.get(name) ?? null,
      methods: publicMethods(service),
    }))
  ));

  register("service.methods", "List callable public methods on one service.", async ({ service }) => {
    const name = requireString(service, "service");
    if (!host.services.has(name)) throw new Error(`Unknown service: ${name}`);
    return {
      service: name,
      owner: host.services.owners.get(name) ?? null,
      methods: publicMethods(host.services.get(name)),
    };
  });

  register("service.call", "Call any public method exposed by a registered engine service.", async ({ service, method, arguments: callArgs = [] }) => {
    const serviceName = requireString(service, "service");
    const methodName = requireString(method, "method");
    if (FORBIDDEN_METHOD_NAMES.has(methodName)) throw new Error(`Forbidden method: ${methodName}`);
    if (!host.services.has(serviceName)) throw new Error(`Unknown service: ${serviceName}`);
    if (!Array.isArray(callArgs)) throw new Error("arguments must be an array");
    const target = host.services.get(serviceName);
    if (!Object.hasOwn(target, methodName) || typeof target[methodName] !== "function") {
      throw new Error(`Service ${serviceName} has no public method ${methodName}`);
    }
    return await target[methodName](...callArgs);
  });

  register("entity.list", "List engine entities with optional bot/alive filters.", async ({ bot = null, alive = null, limit = 128 }) => {
    const service = entities();
    if (!service?.all) throw new Error("entities service is unavailable");
    const safeLimit = Math.max(1, Math.min(512, Number(limit) || 128));
    return service.all()
      .filter((entity) => bot === null || Boolean(entity.bot) === Boolean(bot))
      .filter((entity) => alive === null || Boolean(entity.alive) === Boolean(alive))
      .slice(0, safeLimit);
  });

  register("entity.inspect", "Inspect an entity and every attached component.", async ({ entityId }) => (
    inspectEntity(requireString(entityId, "entityId"))
  ));

  register("entity.spawn", "Spawn an entity through the public entities service.", async ({ spec = {} }) => {
    const service = entities();
    if (!service?.spawn) throw new Error("entities service is unavailable");
    return { entityId: service.spawn(requireObject(spec, "spec")) };
  });

  register("entity.remove", "Remove an entity through the public entities service.", async ({ entityId }) => {
    const id = requireString(entityId, "entityId");
    const service = entities();
    if (!service?.remove) throw new Error("entities service is unavailable");
    return { entityId: id, removed: Boolean(service.remove(id)) };
  });

  register("component.get", "Read one component directly from the component registry.", async ({ entityId, component }) => {
    const id = requireString(entityId, "entityId");
    const name = requireString(component, "component");
    return { entityId: id, component: name, value: host.components.get(id, name) ?? null };
  });

  register("component.set", "Replace a component value for an existing registered component type.", async ({ entityId, component, value }) => {
    const id = requireString(entityId, "entityId");
    const name = requireString(component, "component");
    if (!host.components.hasType(name)) throw new Error(`Unknown component type: ${name}`);
    host.components.add(id, name, structuredClone(value));
    return { entityId: id, component: name, value: host.components.get(id, name) };
  });

  register("component.patch", "Patch fields on an object component in place.", async ({ entityId, component, patch }) => {
    const id = requireString(entityId, "entityId");
    const name = requireString(component, "component");
    const target = host.components.get(id, name);
    if (!target || typeof target !== "object" || Array.isArray(target)) {
      throw new Error(`Component ${name} on ${id} is not a patchable object`);
    }
    Object.assign(target, structuredClone(requireObject(patch, "patch")));
    return { entityId: id, component: name, value: target };
  });

  register("component.remove", "Remove one component from an entity.", async ({ entityId, component }) => {
    const id = requireString(entityId, "entityId");
    const name = requireString(component, "component");
    const existed = host.components.has(id, name);
    host.components.remove(id, name);
    return { entityId: id, component: name, removed: existed };
  });

  register("event.emit", "Emit an engine event through the real EventBus using the current simulation clock.", async ({ event, payload = {} }) => {
    const name = requireString(event, "event");
    const eventPayload = structuredClone(requireObject(payload, "payload"));
    if (!Number.isFinite(Number(eventPayload.now))) eventPayload.now = simulationClock;
    return {
      event: name,
      now: eventPayload.now,
      listenersCalled: host.events.emit(name, eventPayload),
    };
  });

  register("physics.raycast", "Perform a real Rapier raycast.", async ({ origin, direction, maxDistance = 100, excludeEntityId = null, worldOnly = false }) => {
    if (!host.services.has("physics")) throw new Error("physics service is unavailable");
    const physics = host.services.get("physics");
    const from = requireObject(origin, "origin");
    const vector = requireObject(direction, "direction");
    const distance = Math.max(0.001, Number(maxDistance) || 100);
    return worldOnly
      ? physics.raycastWorld(from, vector, distance)
      : physics.raycast(from, vector, distance, excludeEntityId);
  });

  register("physics.stats", "Return Rapier profiler timings and recent contact-force telemetry.", async () => {
    if (!host.services.has("physics")) throw new Error("physics service is unavailable");
    return host.services.get("physics").stats();
  });

  register("physics.contact-forces", "Return recent real Rapier contact-force events, optionally filtered to impacts or one body/kind.", async ({ limit = 16, impactsOnly = false, bodyId = null, kind = null } = {}) => {
    if (!host.services.has("physics")) throw new Error("physics service is unavailable");
    const physics = host.services.get("physics");
    return physics.contactForces?.(limit, {
      impactsOnly: Boolean(impactsOnly),
      bodyId,
      kind,
    }) ?? [];
  });

  register("physics.shape-cast-capsule", "Sweep a player-sized or custom capsule through the real Rapier world.", async ({ origin, direction, maxDistance = 100, halfHeight = null, radius = null, excludeEntityId = null, worldOnly = false, targetDistance = 0 } = {}) => {
    if (!host.services.has("physics")) throw new Error("physics service is unavailable");
    const physics = host.services.get("physics");
    return physics.shapeCastCapsule(
      requireObject(origin, "origin"),
      requireObject(direction, "direction"),
      Math.max(0.001, Number(maxDistance) || 100),
      {
        halfHeight: Number.isFinite(Number(halfHeight)) ? Number(halfHeight) : undefined,
        radius: Number.isFinite(Number(radius)) ? Number(radius) : undefined,
        excludeEntityId,
        worldOnly: Boolean(worldOnly),
        targetDistance: Math.max(0, Number(targetDistance) || 0),
      },
    );
  });

  register("bot.inspect", "Inspect bot components, personality and current utility decision.", async ({ entityId }) => {
    const id = requireString(entityId, "entityId");
    const entity = entities()?.get?.(id);
    if (!entity?.bot) throw new Error(`Entity is not a bot: ${id}`);
    return inspectEntity(id);
  });

  register("bot.think", "Force bot-brain to evaluate supplied world context immediately.", async ({ entityId, context = {}, now = null }) => {
    const id = requireString(entityId, "entityId");
    const brain = botBrain();
    if (!brain?.decide) throw new Error("bot-brain service is unavailable");
    const thinkNow = Number.isFinite(Number(now)) ? Number(now) : simulationClock;
    return brain.decide(id, requireObject(context, "context"), thinkNow);
  });

  register("match.info", "Return the current battle royale status when available.", async ({ now = null }) => {
    if (!host.services.has("battle-royale")) return { mode: game.mode, battleRoyale: null };
    const battleRoyale = host.services.get("battle-royale");
    const queryNow = Number.isFinite(Number(now)) ? Number(now) : simulationClock;
    return {
      mode: game.mode,
      battleRoyale: battleRoyale.status ? battleRoyale.status(queryNow) : null,
    };
  });

  register("game.step", "Advance the real game simulation on a monotonic Engine Control clock.", async ({ dt = 0.05, steps = 1, now = null }) => {
    const count = Math.max(1, Math.min(500, Math.floor(Number(steps) || 1)));
    const safeDt = Math.max(0.001, Math.min(0.1, Number(dt) || 0.05));
    const requestedNow = Number(now);
    const baseNow = Number.isFinite(requestedNow)
      ? Math.max(requestedNow, simulationClock)
      : Math.max(Date.now(), simulationClock);
    simulationClock = baseNow;
    for (let i = 0; i < count; i += 1) {
      simulationClock += safeDt * 1000;
      game.api.step(safeDt, simulationClock);
    }
    return { steps: count, dt: safeDt, simulationNow: simulationClock };
  });

  return {
    list() {
      return [...commands.values()].map(({ name, description }) => ({ name, description }));
    },
    async execute(request = {}) {
      const input = requireObject(request, "request");
      const command = requireString(input.command, "command");
      const startedAt = Date.now();
      try {
        const result = await executeInternal(command, input.args ?? {}, {
          requestId: input.requestId ?? null,
        });
        return {
          ok: true,
          command,
          requestId: input.requestId ?? null,
          durationMs: Date.now() - startedAt,
          result,
        };
      } catch (error) {
        return {
          ok: false,
          command,
          requestId: input.requestId ?? null,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
