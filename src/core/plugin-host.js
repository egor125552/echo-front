import { EventBus } from "./event-bus.js";
import { ServiceRegistry } from "./service-registry.js";
import { ComponentRegistry } from "./component-registry.js";

export class PluginExecutionError extends Error {
  constructor(pluginId, phase, cause) {
    const original = cause instanceof Error ? cause : new Error(String(cause));
    super(`Plugin ${pluginId} failed during ${phase}: ${original.message}`, { cause: original });
    this.name = "PluginExecutionError";
    this.code = "PLUGIN_ERROR";
    this.pluginId = pluginId;
    this.phase = phase;
    this.originalName = original.name || "Error";
  }
}

export function asPluginExecutionError(pluginId, phase, error) {
  if (error instanceof PluginExecutionError) return error;
  return new PluginExecutionError(pluginId, phase, error);
}

export function describePluginError(error) {
  if (!(error instanceof PluginExecutionError)) return null;
  return {
    code: error.code,
    pluginId: error.pluginId,
    phase: error.phase,
    name: error.originalName,
    message: error.cause instanceof Error ? error.cause.message : error.message,
  };
}

function requireCapability(manifest, capability) {
  if (!(manifest.capabilities ?? []).includes(capability)) {
    throw new PluginExecutionError(
      manifest.id,
      "capability-check",
      new Error(`missing declared capability ${capability}`),
    );
  }
}

function sortPlugins(plugins) {
  const byId = new Map(plugins.map((plugin) => [plugin.manifest.id, plugin]));
  if (byId.size !== plugins.length) throw new Error("Duplicate plugin id");

  for (const plugin of plugins) {
    for (const dependency of plugin.manifest.requires ?? []) {
      if (!byId.has(dependency)) {
        throw new PluginExecutionError(
          plugin.manifest.id,
          "dependency-check",
          new Error(`requires missing plugin ${dependency}`),
        );
      }
    }
  }

  const permanent = new Set();
  const temporary = new Set();
  const result = [];

  function visit(id) {
    if (permanent.has(id)) return;
    if (temporary.has(id)) {
      throw new PluginExecutionError(id, "dependency-check", new Error(`dependency cycle at ${id}`));
    }
    temporary.add(id);
    const plugin = byId.get(id);
    for (const dependency of plugin.manifest.requires ?? []) visit(dependency);
    temporary.delete(id);
    permanent.add(id);
    result.push(plugin);
  }

  for (const id of byId.keys()) visit(id);
  return result;
}

function wrapMaybePromise(pluginId, phase, invoke) {
  try {
    const result = invoke();
    if (result && typeof result.then === "function") {
      return result.catch((error) => {
        throw asPluginExecutionError(pluginId, phase, error);
      });
    }
    return result;
  } catch (error) {
    throw asPluginExecutionError(pluginId, phase, error);
  }
}

export class PluginHost {
  constructor({ plugins = [], config = {} } = {}) {
    this.plugins = sortPlugins(plugins);
    this.pluginIds = new Set(this.plugins.map((plugin) => plugin.manifest.id));
    this.config = config;
    this.events = new EventBus();
    this.services = new ServiceRegistry();
    this.components = new ComponentRegistry();
    this.cleanups = [];
  }

  hasPlugin(id) {
    return this.pluginIds.has(id);
  }

  contextFor(manifest) {
    return {
      pluginId: manifest.id,
      config: this.config[manifest.id] ?? {},
      hasPlugin: (id) => this.hasPlugin(id),
      events: {
        on: (event, handler, options) => {
          requireCapability(manifest, "events.on");
          const wrapped = (payload) => wrapMaybePromise(
            manifest.id,
            `event:${event}`,
            () => handler(payload),
          );
          const off = this.events.on(event, wrapped, options);
          this.cleanups.push(off);
          return off;
        },
        emit: (event, payload) => {
          requireCapability(manifest, "events.emit");
          return wrapMaybePromise(
            manifest.id,
            `emit:${event}`,
            () => this.events.emit(event, payload),
          );
        },
      },
      services: {
        provide: (name, value) => {
          requireCapability(manifest, "services.provide");
          // Keep the exact service object. Several gameplay plugins use object
          // identity and mutable method replacement for integration. Proxying
          // services here changed game behavior, so attribution stays on plugin
          // lifecycle/event boundaries instead of altering runtime semantics.
          return this.services.provide(name, value, manifest.id);
        },
        get: (name) => {
          requireCapability(manifest, "services.consume");
          return this.services.get(name);
        },
        has: (name) => {
          requireCapability(manifest, "services.consume");
          return this.services.has(name);
        },
      },
      components: {
        register: (name) => {
          requireCapability(manifest, "components.register");
          return this.components.register(name, manifest.id);
        },
        add: (entityId, name, value) => {
          requireCapability(manifest, "components.write");
          return this.components.add(entityId, name, value);
        },
        get: (entityId, name) => {
          requireCapability(manifest, "components.read");
          return this.components.get(entityId, name);
        },
        has: (entityId, name) => {
          requireCapability(manifest, "components.read");
          return this.components.has(entityId, name);
        },
        remove: (entityId, name) => {
          requireCapability(manifest, "components.write");
          return this.components.remove(entityId, name);
        },
        entries: (name) => {
          requireCapability(manifest, "components.read");
          return this.components.entries(name);
        },
        snapshot: (entityId) => {
          requireCapability(manifest, "components.read");
          return this.components.snapshot(entityId);
        },
      },
    };
  }

  async start() {
    for (const plugin of this.plugins) {
      if (typeof plugin.setup === "function") {
        await wrapMaybePromise(plugin.manifest.id, "setup", () => plugin.setup(this.contextFor(plugin.manifest)));
      }
    }
    for (const plugin of this.plugins) {
      if (typeof plugin.start === "function") {
        await wrapMaybePromise(plugin.manifest.id, "start", () => plugin.start(this.contextFor(plugin.manifest)));
      }
    }
    return this;
  }

  async stop() {
    for (const plugin of [...this.plugins].reverse()) {
      if (typeof plugin.stop === "function") {
        await wrapMaybePromise(plugin.manifest.id, "stop", () => plugin.stop(this.contextFor(plugin.manifest)));
      }
    }
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
  }
}
