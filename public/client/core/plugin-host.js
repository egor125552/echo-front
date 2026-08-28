import { EventBus } from "./event-bus.js";

export class ClientPluginExecutionError extends Error {
  constructor(pluginId, phase, cause) {
    const original = cause instanceof Error ? cause : new Error(String(cause));
    super(`Client plugin ${pluginId} failed during ${phase}: ${original.message}`, { cause: original });
    this.name = "ClientPluginExecutionError";
    this.code = "CLIENT_PLUGIN_ERROR";
    this.pluginId = pluginId;
    this.phase = phase;
    this.originalName = original.name || "Error";
  }
}

function wrapClientPluginError(pluginId, phase, error) {
  if (error instanceof ClientPluginExecutionError) return error;
  return new ClientPluginExecutionError(pluginId, phase, error);
}

function sortPlugins(plugins) {
  const byId = new Map(plugins.map((plugin) => [plugin.manifest.id, plugin]));
  if (byId.size !== plugins.length) throw new Error("Duplicate client plugin id");
  const done = new Set();
  const active = new Set();
  const result = [];

  function visit(id, requiredBy = null) {
    if (done.has(id)) return;
    if (active.has(id)) {
      throw new ClientPluginExecutionError(requiredBy ?? id, "dependency-check", new Error(`dependency cycle at ${id}`));
    }
    const plugin = byId.get(id);
    if (!plugin) {
      throw new ClientPluginExecutionError(requiredBy ?? id, "dependency-check", new Error(`missing client plugin ${id}`));
    }
    active.add(id);
    for (const dependency of plugin.manifest.requires ?? []) visit(dependency, plugin.manifest.id);
    active.delete(id);
    done.add(id);
    result.push(plugin);
  }

  for (const plugin of plugins) visit(plugin.manifest.id);
  return result;
}

export class ClientPluginHost {
  constructor(plugins) {
    this.plugins = sortPlugins(plugins);
    this.events = new EventBus();
    this.services = new Map();
  }

  async start() {
    for (const plugin of this.plugins) {
      const context = {
        pluginId: plugin.manifest.id,
        events: this.events,
        services: {
          provide: (name, value) => {
            if (this.services.has(name)) {
              throw new ClientPluginExecutionError(plugin.manifest.id, "service-register", new Error(`Client service already registered: ${name}`));
            }
            this.services.set(name, value);
          },
          get: (name) => {
            if (!this.services.has(name)) {
              throw new ClientPluginExecutionError(plugin.manifest.id, "service-resolve", new Error(`Missing client service: ${name}`));
            }
            return this.services.get(name);
          },
          has: (name) => this.services.has(name),
        },
      };
      if (!plugin.setup) continue;
      try {
        await plugin.setup(context);
      } catch (error) {
        throw wrapClientPluginError(plugin.manifest.id, "setup", error);
      }
    }
    return this;
  }
}
