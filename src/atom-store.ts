import { getAtomOrigin, isLocalAtom } from "./atom";
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
   * The clones this store created. Lets `use()` recognise an atom that is
   * already scoped to this store and hand it back untouched.
   */
  private owned = new WeakSet<object>();

  /**
   * Per scoped atom, the value the first server-snapshot read saw. Frozen so
   * the first client render (hydration) keeps matching the server HTML even
   * if effects mutate the store while later parts of the tree still hydrate.
   */
  private serverSnapshots = new Map<string, unknown>();

  /**
   * Get or lazily create a store-scoped clone of the given atom template.
   * The clone shares the template's options (actions, beforeUpdate, get,
   * onUpdate) but owns its own state and event topic.
   *
   * A new clone starts from the template's DEFAULT value (or the queued
   * hydration value), never from the template's current value, so a stray
   * write to the module-level template cannot leak into a store.
   *
   * Idempotent: passing an atom that is already a scoped clone (of this
   * store or of another one) resolves to this store's clone of the same
   * template instead of cloning the clone. Local atoms (`register: false`
   * atoms that are not clones) are not scoped and come back unchanged.
   */
  use<V, A extends Record<string, any> = {}>(template: Atom<V, A>): Atom<V, A> {
    if (this.owned.has(template) || isLocalAtom(template)) return template;

    const root = (getAtomOrigin(template) ?? template) as Atom<V, A>;

    const existing = this.store.get(root.key);
    if (existing) return existing as Atom<V, A>;

    const scoped = root.clone({ register: false, seed: "default" }) as Atom<
      V,
      A
    >;
    this.owned.add(scoped);

    if (this.pendingValues.has(root.key)) {
      scoped.silentUpdate(this.pendingValues.get(root.key) as V);
      this.pendingValues.delete(root.key);
    }

    this.store.set(root.key, scoped);
    return scoped;
  }

  /**
   * The value a scoped atom should render on the FIRST pass of a
   * server-rendered tree, for React's `getServerSnapshot`.
   *
   * The first call for an atom records its value at that moment (the
   * hydrated or pre-seeded value) and every later call returns that same
   * value, however the live atom changes in between. That keeps the server
   * render and the client's hydration render identical and referentially
   * stable. `hydrate()` re-seeds the record for the keys it applies.
   */
  serverSnapshot<V>(scoped: Atom<V, any>): V {
    if (!this.serverSnapshots.has(scoped.key)) {
      this.serverSnapshots.set(scoped.key, scoped.value);
    }

    return this.serverSnapshots.get(scoped.key) as V;
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
        this.serverSnapshots.delete(atom.key);
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
    this.serverSnapshots.clear();
    this.owned = new WeakSet();
  }
}

/**
 * Convenience factory; equivalent to `new AtomStore()`.
 */
export function createAtomStore(): AtomStore {
  return new AtomStore();
}
