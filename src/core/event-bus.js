export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler, { priority = 0 } = {}) {
    const list = this.listeners.get(event) ?? [];
    const entry = { handler, priority };
    list.push(entry);
    list.sort((a, b) => b.priority - a.priority);
    this.listeners.set(event, list);
    return () => {
      const current = this.listeners.get(event) ?? [];
      this.listeners.set(event, current.filter((item) => item !== entry));
    };
  }

  emit(event, payload = {}) {
    for (const { handler } of this.listeners.get(event) ?? []) handler(payload);
    for (const { handler } of this.listeners.get("*") ?? []) handler({ event, payload });
  }
}
