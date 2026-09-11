export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
    return () => this.listeners.set(event, (this.listeners.get(event) ?? []).filter((item) => item !== handler));
  }

  emit(event, payload = {}) {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
    for (const handler of this.listeners.get("*") ?? []) handler({ event, payload });
  }
}
