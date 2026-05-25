import { type EventSubscription } from "@mongez/events";
import type { PersistOption } from "./persist";

export type AtomPartialChangeCallback = (
  newValue: any,
  oldValue: any,
  atom: Atom<any>,
) => void;

export type AtomValue<Value> = Value;

export type AtomActionMethod<Value> = (
  ...args: any[]
) => void | Value | Promise<void> | Promise<Value>;

export type AtomActions<Value> = {
  [key: string]: (this: Atom<Value>, ...args: any[]) => any;
};

/**
 * Atom Options
 */
export type AtomOptions<
  Value = any,
  Actions extends AtomActions<Value> = {},
> = {
  /**
   * Atom unique key
   */
  key: string;
  /**
   * Atom default value
   */
  default: Value;
  /**
   * Make adjustments on the value before updating the atom
   */
  beforeUpdate?: (
    newValue: Value,
    oldValue: Value,
    atom: Atom<AtomValue<Value>, Actions>,
  ) => Value | void;
  /**
   * Triggered when atom is updated
   */
  onUpdate?: (
    callback: AtomChangeCallback<Value, Actions>,
  ) => EventSubscription;
  /**
   * Set getter function, works only when atom's value is object
   */
  get?: (
    key: string,
    defaultValue?: Value,
    atomValue?: Value,
  ) => Value;
  /**
   * Atom actions, this is used to add methods to the atom instance
   * i.e: actions: { increment: () => this.update(this.value + 1) }, usage will be atom.increment()
   */
  actions?: Actions & ThisType<Atom<Value, Actions>>;

  /**
   * Persist the atom's value to an external store (localStorage, cookies,
   * IndexedDB, anything matching the {@link PersistAdapter} shape).
   *
   * - `true` → use the built-in `localStorageAdapter` (client-only;
   *   no-ops on the server).
   * - A `PersistAdapter` object → use that adapter directly. Methods
   *   may be sync or async.
   * - Omitted / `false` → no persistence.
   *
   * Behavior:
   *   1. On creation, the adapter is read; if a value is present it
   *      replaces the default via `silentUpdate` (no `update` event).
   *   2. Every subsequent update writes through to the adapter.
   *   3. `reset()` removes the entry from the adapter.
   *
   * For SSR, pair this with a cookie-aware adapter so the server can
   * read the persisted value during request rendering. localStorage
   * doesn't exist on the server; the built-in adapter no-ops there.
   */
  persist?: PersistOption<Value>;
};

export type AtomChangeCallback<Value, Actions extends AtomActions<Value>> = (
  newValue: Value,
  oldValue: Value,
  atom: Atom<Value, Actions>,
) => void;

/**
 * True when `V` should be treated as a "container" value that has named
 * sub-keys callers can read/write individually — i.e. an object (including
 * arrays) but not a function and not `null`.
 *
 * This drives the conditional split between {@link BaseAtom} and
 * {@link ObjectAtom}: keyed methods (`merge`, `change`, `silentChange`,
 * `get`, `watch`) only make sense when this resolves to `true`.
 *
 * Note on `any`: when `V` is `any`, TS resolves `any extends object` to
 * `boolean`, which makes the conditional produce a union that includes
 * everything. That's the right behavior — `Atom<any>` keeps the full
 * surface, matching the historical default.
 */
export type IsObjectValue<V> = [V] extends [object]
  ? [V] extends [Function]
    ? false
    : true
  : false;

/**
 * The methods every atom carries, regardless of value type.
 */
export type BaseAtom<
  Value = any,
  Actions extends AtomActions<Value> = {},
> = {
  /**
   * Atom unique key, set by the user
   */
  key: string;

  /**
   * Atom default value, set by the user
   */
  default: Value;

  /**
   * Atom current value, initialized with the passed default value
   */
  currentValue: Value;

  /**
   * Reset the atom value
   */
  reset: () => void;

  /**
   * Reset the atom without triggering the update event
   */
  silentReset: () => void;

  /**
   * Update atom value, the function accepts a new value,
   * or it can accept a callback that passes the old value and the atom instance
   * This will trigger atom event update
   */
  update: (
    value: ((oldValue: Value, atom: Atom<Value>) => Value) | Value,
  ) => void;

  /**
   * Update atom value without triggering the update event
   */
  silentUpdate: (
    value: ((oldValue: Value, atom: Atom<Value>) => Value) | Value,
  ) => void;

  /**
   * Get current value
   */
  readonly value: Value;

  /**
   * Get default value that started with atom creation
   */
  readonly defaultValue: Value;

  /**
   * Destroy the atom and remove it from atmos list
   * This will trigger an atom destroy event then unsubscribe all atom events
   */
  destroy: () => void;

  /**
   * An event listener to the atom value change
   * The callback accepts the new updated value, the old value and an atom instance
   */
  onChange: (
    callback: AtomChangeCallback<Value, Actions>,
  ) => EventSubscription;

  /**
   * An event listener to the atom destruction
   */
  onDestroy(callback: (atom: Atom<Value>) => void): EventSubscription;

  /**
   * Called when reset is called
   */
  onReset(callback: (atom: Atom<Value>) => void): EventSubscription;

  /**
   * Clone the atom.
   * Returns a new atom whose key is suffixed with `.clone.{n}` and which
   * carries the original atom's options (beforeUpdate, get, onUpdate, actions)
   * but owns its own state.
   *
   * Pass `{ register: false }` to skip insertion into the global `atoms`
   * registry. Used internally by `AtomStore` to create isolated per-store
   * clones for SSR.
   */
  clone: (options?: { register?: boolean }) => Atom<Value, Actions>;

  /**
   * Get the atom's value type
   */
  readonly type: string;

  /**
   * Get the atom's value length
   *
   * Works only if atom's value is an array or a string
   */
  readonly length: number;
};

/**
 * The extra surface that only makes sense when the atom's value is a
 * container (an object or an array): keyed reads, keyed writes, and keyed
 * subscriptions.
 *
 * `Atom<{name: string}>` exposes these methods.
 * `Atom<boolean>`        does not — calling them is a compile error.
 */
export type ObjectAtom<Value> = {
  /**
   * Merge the given object with current atom value
   * This is sort of partial update that works only if atom's value is an object
   */
  merge: (value: Partial<Value>) => void;

  /**
   * Change only one key of the atom
   * Works only if atom's value is an object
   */
  change: <T extends keyof Value>(key: T, newValue: Value[T]) => void;

  /**
   * Change only one key of the atom without triggering the update event
   * Works only if atom's value is an object
   */
  silentChange: <T extends keyof Value>(key: T, newValue: Value[T]) => void;

  /**
   * Watch for atom value change
   * This can be used only when atom's default value is an object or an array
   * The key accepts dot.notation syntax
   */
  watch: <T extends keyof Value>(
    key: T,
    callback: AtomPartialChangeCallback,
  ) => EventSubscription;

  /**
   * Get value from atom's value
   * Works only if atom's value is an object
   */
  get<T extends keyof Value>(key: T, defaultValue?: any): Value[T];
};

/**
 * The Atom Instance.
 *
 * The exact method surface depends on the shape of `Value`:
 *
 * - When `Value` is an object/array, the atom carries both the base
 *   methods AND the keyed methods (`merge`, `change`, `silentChange`,
 *   `get(key)`, `watch`).
 * - When `Value` is a primitive (`boolean`, `number`, `string`), only the
 *   base methods are present. The keyed methods are stripped from the
 *   type so e.g. `atom<boolean>(...).change("foo", "bar")` is a compile
 *   error — calling it at runtime would silently corrupt the atom into
 *   an object.
 *
 * `Atom<any>` keeps the full surface (legacy permissive behavior); use
 * a concrete type when you want the safety.
 */
export type Atom<
  Value = any,
  Actions extends AtomActions<Value> = {},
> = BaseAtom<Value, Actions> &
  (IsObjectValue<Value> extends true ? ObjectAtom<Value> : {}) &
  Actions;
