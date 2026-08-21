export class ComponentRegistry {
  constructor() {
    this.types = new Map();
  }

  register(name, owner) {
    if (this.types.has(name)) throw new Error(`Component already registered: ${name}`);
    this.types.set(name, { owner, values: new Map() });
  }

  hasType(name) {
    return this.types.has(name);
  }

  add(entityId, name, value) {
    const type = this.types.get(name);
    if (!type) throw new Error(`Unknown component: ${name}`);
    type.values.set(entityId, value);
    return value;
  }

  get(entityId, name) {
    return this.types.get(name)?.values.get(entityId);
  }

  has(entityId, name) {
    return this.types.get(name)?.values.has(entityId) ?? false;
  }

  remove(entityId, name) {
    this.types.get(name)?.values.delete(entityId);
  }

  removeEntity(entityId) {
    for (const type of this.types.values()) type.values.delete(entityId);
  }

  entries(name) {
    return [...(this.types.get(name)?.values.entries() ?? [])];
  }

  snapshot(entityId) {
    const result = {};
    for (const [name, type] of this.types) {
      if (type.values.has(entityId)) result[name] = structuredClone(type.values.get(entityId));
    }
    return result;
  }
}
