export class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.owners = new Map();
  }

  provide(name, value, owner) {
    if (this.services.has(name)) throw new Error(`Service already registered: ${name}`);
    this.services.set(name, value);
    this.owners.set(name, owner);
  }

  get(name) {
    if (!this.services.has(name)) throw new Error(`Missing service: ${name}`);
    return this.services.get(name);
  }

  has(name) {
    return this.services.has(name);
  }
}
