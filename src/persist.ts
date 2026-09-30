/**
 * @fileoverview Persistence adapters for atoms.
 *
 * Plug in any store-shaped object (cache, localStorage wrapper, cookie
 * helper, IndexedDB layer) and atoms will:
 *
 *   1. Load their initial value from the adapter at creation (sync or async),
 *      or later via `atom.hydratePersisted()` when the atom is created with
 *      `persistHydration: "deferred"`.
 *   2. Write every subsequent update through to the adapter.
 *   3. Remove the entry on `reset()`.
 *
 * The default adapter is a thin localStorage wrapper for the client; it
 * silently no-ops on the server (no `window`). For SSR-safe per-request
 * persistence, supply your own cookie-aware adapter.
 */
import type { Atom, AtomOptions, PersistHydration } from "./types";

/**
 * Shape of an external store. Methods may be sync or async; the
 * persistence layer handles both transparently.
 */
export type PersistAdapter<V = unknown> = {
  /** Read the persisted value for `key`. `undefined` means "not present". */
  get(key: string): V | undefined | Promise<V | undefined>;
  /** Write `value` to the store under `key`. */
  set(key: string, value: V): void | Promise<void>;
  /** Drop the entry for `key`. Called on `reset()`. */
  remove(key: string): void | Promise<void>;
};

/**
 * The shape that goes on `AtomOptions.persist`.
 *
 *   - `true` → use the built-in localStorage adapter (client-only).
 *   - `false` / omitted → no persistence.
 *   - Any object matching `PersistAdapter` → use that adapter.
 */
export type PersistOption<V = unknown> =
  | boolean
  | PersistAdapter<V>;

/**
 * Built-in adapter backed by `window.localStorage`. JSON-encodes the
 * value on write, decodes on read. No-ops on the server.
 */
export const localStorageAdapter: PersistAdapter = {
  get(key) {
    if (typeof window === "undefined" || !window.localStorage) return undefined;
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupt entry — pretend it doesn't exist.
      return undefined;
    }
  },
  set(key, value) {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // QuotaExceededError or private-mode storage block — silently drop.
    }
  },
  remove(key) {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(key);
  },
};

/**
 * Resolve a `PersistOption` to an actual adapter, or `undefined` if
 * persistence is disabled.
 */
export function resolvePersistAdapter<V>(
  option: PersistOption<V> | undefined,
): PersistAdapter<V> | undefined {
  if (!option) return undefined;
  if (option === true) return localStorageAdapter as PersistAdapter<V>;
  return option;
}

/**
 * Wire an atom up to a persistence adapter.
 *
 * Reading: in `"immediate"` mode the stored value is read right away and
 * applied via `silentUpdate` (no `update` event). In `"deferred"` mode
 * nothing is read until the returned `hydrate` function runs; the stored
 * value is then applied with `update` so mounted subscribers re-render.
 * Hydration happens at most once, and never over a value the app already
 * wrote: an update or reset that lands first marks the atom as hydrated.
 *
 * Writing: on every update afterwards, writes through to the adapter. On
 * `reset`, removes the entry.
 *
 * This is internal — `createAtom` calls it when `options.persist` is
 * truthy and installs the returned function as `atom.hydratePersisted`.
 */
export function attachPersist<V, A extends Record<string, any>>(
  atom: Atom<V, A>,
  adapter: PersistAdapter<V>,
  options: AtomOptions<V, any>,
  mode: PersistHydration = "immediate",
): () => void {
  let hydrated = false;

  const applyStored = (value: V | undefined): void => {
    if (value === undefined) return;
    if (mode === "deferred") {
      atom.update(value);
    } else {
      atom.silentUpdate(value);
    }
  };

  // Read the stored value once. We don't block on an async adapter — the
  // consumer sees the default until the read resolves. Both sync throws and
  // async rejections are caught so a broken adapter never crashes the atom.
  const hydrate = (): void => {
    if (hydrated) return;
    hydrated = true;

    try {
      const stored = adapter.get(atom.key);
      if (stored instanceof Promise) {
        stored
          .then(applyStored)
          .catch(() => {
            /* keep default */
          });
      } else {
        applyStored(stored);
      }
    } catch {
      /* sync throw on read — keep default */
    }
  };

  if (mode === "immediate") {
    hydrate();
  }

  // Write-through on every update. Using onChange instead of replacing
  // beforeUpdate so we don't fight the user's own beforeUpdate hook.
  // Sync throws are swallowed so a transient storage error (quota,
  // private-mode block, etc.) doesn't break the consumer's update flow;
  // async rejections are caught the same way.
  const updateSub = atom.onChange(newValue => {
    // A write that lands before the deferred read wins over the stored value.
    hydrated = true;

    try {
      const result = adapter.set(atom.key, newValue);
      if (result instanceof Promise) result.catch(() => {});
    } catch {
      /* adapter blew up — keep going */
    }
  });

  // Drop the entry on reset so the next session starts fresh.
  const resetSub = atom.onReset(() => {
    hydrated = true;

    try {
      const result = adapter.remove(atom.key);
      if (result instanceof Promise) result.catch(() => {});
    } catch {
      /* same — non-fatal */
    }
  });

  // Clean up subscriptions when the atom dies.
  atom.onDestroy(() => {
    updateSub.unsubscribe();
    resetSub.unsubscribe();
  });

  // Suppress unused-options lint when not consumed by future logic.
  void options;

  return hydrate;
}
