import { EventBus } from "./event-bus.js";

function sortPlugins(plugins) {
  const byId = new Map(plugins.map((plugin) => [plugin.manifest.id, plugin]));
  if (byId.size !== plugins.length) throw new Error("Duplicate client plugin id");
  const done = new Set();
  const active = new Set();
  const result = [];

  function visit(id) {
    if (done.has(id)) return;
    if (active.has(id)) throw new Error(`Client plugin dependency cycle: ${id}`);
    const plugin = byId.get(id);
    if (!plugin) throw new Error(`Missing client plugin: ${id}`);
    active.add(id);
    for (const dependency of plugin.manifest.requires ?? []) visit(dependency);
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
        events: this.events,
        services: {
          provide: (name, value) => {
            if (this.services.has(name)) throw new Error(`Client service already registered: ${name}`);
            this.services.set(name, value);
          },
          get: (name) => {
            if (!this.services.has(name)) throw new Error(`Missing client service: ${name}`);
            return this.services.get(name);
          },
          has: (name) => this.services.has(name),
        },
      };
      if (plugin.setup) await plugin.setup(context);
    }
    return this;
  }
}
