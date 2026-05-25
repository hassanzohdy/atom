import type { Atom } from "./types";

/**
 * A store is an isolated registry of atom instances.
 *
 * Each store creates and holds its own clones of atom templates so that
 * concurrent consumers (e.g. server-rendered requests) do not share state.
 *
 * Stores are looked up via React context by `<AtomStoreProvider>` in
 * `@mongez/react-atom`, but the class itself is framework-agnostic and can
 * be used directly outside React.
 */
export class AtomStore {
  /**
   * Scoped atom clones, keyed by the ORIGINAL atom's key (not the clone key).
   */
  private store = new Map<string, Atom<any>>();

  /**
   * Values applied to atoms the moment they enter the store. Useful for
   * SSR hydration when atoms register lazily.
   */
  private pendingValues = new Map<string, unknown>();

  /**
   * Get or lazily create a store-scoped clone of the given atom template.
   * The clone shares the template's options (actions, beforeUpdate, get,
   * onUpdate) but owns its own state and event topic.
   */
  use<V, A extends Record<string, any> = {}>(template: Atom<V, A>): Atom<V, A> {
    const existing = this.store.get(template.key);
    if (existing) return existing as Atom<V, A>;

    const scoped = template.clone({ register: false }) as Atom<V, A>;

    if (this.pendingValues.has(template.key)) {
      scoped.silentUpdate(this.pendingValues.get(template.key) as V);
      this.pendingValues.delete(template.key);
    }

    this.store.set(template.key, scoped);
    return scoped;
  }

  /**
   * Look up a scoped atom by its original key. Returns undefined when the
   * atom has not been used in this store yet.
   */
  get<V = any>(key: string): Atom<V> | undefined {
    return this.store.get(key) as Atom<V> | undefined;
  }

  /**
   * True when the given key has a scoped atom in this store.
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * All scoped atoms currently in this store.
   */
  list(): Atom<any>[] {
    return Array.from(this.store.values());
  }

  /**
   * Apply initial values to atoms in the store. Atoms not yet registered
   * have their values queued until first `use(template)` call.
   */
  hydrate(snapshot: Record<string, unknown>): void {
    for (const key in snapshot) {
      const value = snapshot[key];
      const atom = this.store.get(key);
      if (atom) {
        atom.silentUpdate(value);
      } else {
        this.pendingValues.set(key, value);
      }
    }
  }

  /**
   * Serialize the current values of every scoped atom as a plain object.
   * Intended for SSR payloads that the client will pass back via
   * `<AtomStoreProvider initialValues={...}>`.
   */
  snapshot(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, atom] of this.store.entries()) {
      result[key] = atom.value;
    }
    return result;
  }

  /**
   * Destroy every scoped atom and clear the store. Call this at the end of
   * a request lifecycle to release event-bus subscriptions and let the
   * scoped atoms be garbage collected.
   */
  destroy(): void {
    for (const atom of this.store.values()) {
      atom.destroy();
    }
    this.store.clear();
    this.pendingValues.clear();
  }
}

/**
 * Convenience factory; equivalent to `new AtomStore()`.
 */
export function createAtomStore(): AtomStore {
  return new AtomStore();
}
