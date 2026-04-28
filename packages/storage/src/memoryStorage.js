export class MemoryStorage {
  constructor(seed = {}) {
    this.store = new Map(Object.entries(seed));
  }

  get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  set(key, value) {
    this.store.set(key, value);
  }

  remove(key) {
    this.store.delete(key);
  }
}
