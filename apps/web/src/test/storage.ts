/**
 * An in-memory localStorage for the tests that run in Node. Node 24 and
 * later have a localStorage of their own that is unavailable without
 * --localstorage-file, so a persisted store (zustand's persist) found
 * none and warned, which the console guard (guards.ts) now fails. The
 * jsdom tests keep jsdom's own.
 */
class MemoryStorage implements Storage {
  #items = new Map<string, string>();
  get length() {
    return this.#items.size;
  }
  clear() {
    this.#items.clear();
  }
  getItem(key: string) {
    return this.#items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#items.delete(key);
  }
  setItem(key: string, value: string) {
    this.#items.set(key, String(value));
  }
}

function usable(storage: Storage | undefined): boolean {
  try {
    storage?.setItem("wingtip.test", "1");
    storage?.removeItem("wingtip.test");
    return storage !== undefined;
  } catch {
    return false;
  }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  let current: Storage | undefined;
  try {
    current = globalThis[name];
  } catch {
    current = undefined;
  }
  if (!usable(current)) Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true });
}
