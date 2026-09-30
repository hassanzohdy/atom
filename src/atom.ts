/* eslint-disable no-multi-assign */
/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable prefer-template */
import events, { EventSubscription } from "@mongez/events";
import { clone, get } from "@mongez/reinforcements";
import { attachPersist, resolvePersistAdapter } from "./persist";
import {
  Atom,
  AtomActions,
  AtomOptions,
  AtomPartialChangeCallback,
  AtomValue,
  CloneAtomOptions,
} from "./types";

export const atoms: Record<string, Atom<any>> = {};

let cloneCounter = 0;

/**
 * The event topics every atom publishes on, one per lifecycle moment.
 */
const ATOM_EVENT_TYPES = ["update", "reset", "delete"] as const;

/**
 * Maps every clone to the atom it was cloned from (always the ROOT template,
 * never another clone). `AtomStore.use()` reads this so that passing an atom
 * that is already a scoped clone resolves to that store's clone of the
 * template instead of cloning the clone.
 */
const cloneOrigins = new WeakMap<object, Atom<any>>();

/**
 * Atoms created with `register: false` that are NOT store clones, i.e. atoms
 * the caller owns and scopes by hand (per-component-instance state).
 * Store-aware code (`useAtom`, `AtomStore.use`) leaves these untouched.
 */
const localAtoms = new WeakSet<object>();

/**
 * Get the template a clone was made from, or `undefined` when the atom is
 * not a clone.
 */
export function getAtomOrigin<V = any>(
  atom: Atom<V, any>
): Atom<V> | undefined {
  return cloneOrigins.get(atom) as Atom<V> | undefined;
}

/**
 * True for atoms created with `register: false` that are not store clones
 * (see {@link CreateAtomOptions.register}). These live outside the global
 * registry and outside any `AtomStore`.
 */
export function isLocalAtom(atom: Atom<any, any>): boolean {
  return localAtoms.has(atom);
}

/**
 * True when `value` is a container the keyed watchers can read into.
 */
function isContainer(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

/**
 * Get atom by name
 */
export function getAtom<T>(name: string): Atom<T> | undefined {
  return atoms[name];
}

/**
 * Options that control how an atom is constructed.
 * Internal-only; used by store-scoped clones to opt out of the global registry.
 */
export type CreateAtomOptions = {
  /**
   * When false, the new atom will NOT be inserted into the module-level
   * `atoms` registry. Used by `AtomStore` to create per-store clones that
   * stay isolated from the global lookup table.
   *
   * Defaults to `data.register`, then to true.
   *
   * An atom created with `register: false` that is not a store clone is a
   * "local" atom (see {@link isLocalAtom}). Its events still travel on the
   * shared `atoms.<key>.*` bus, so give every local atom a unique key.
   */
  register?: boolean;

  /**
   * Internal: set by `atom.clone()` to record the template this atom was
   * cloned from. Not meant to be passed by application code.
   */
  origin?: Atom<any, any>;
};

/**
 * Create a new atom
 */
export function createAtom<
  Value = any,
  Actions extends AtomActions<Value> = AtomActions<Value>
>(
  data: AtomOptions<AtomValue<Value>, Actions>,
  options: CreateAtomOptions = {}
): Atom<Value, Actions> {
  let defaultValue = data.default;
  let atomValue = data.default;

  if (defaultValue && typeof defaultValue === "object") {
    atomValue = defaultValue = clone(defaultValue);
  }

  const atomType = Array.isArray(defaultValue) ? "array" : typeof defaultValue;

  const atomEvent = `atoms.${data.key}`;

  const event = (type: string): string => `${atomEvent}.${type}`;

  const watchers: any = {};

  const atomKey = data.key;

  const atom: Atom<Value, Actions> = {
    default: defaultValue,
    currentValue: atomValue,
    key: atomKey,
    get type() {
      return atomType;
    },
    watch<T extends keyof Value>(
      key: T,
      callback: AtomPartialChangeCallback
    ): EventSubscription {
      if (!watchers[key]) {
        watchers[key] = [];
      }

      watchers[key].push(callback);

      return {
        unsubscribe: () => {
          watchers[key] = watchers[key].filter(
            (cb: AtomPartialChangeCallback) => cb !== callback
          );
        },
      } as EventSubscription;
    },
    get defaultValue(): Value {
      return this.default;
    },
    get value(): Value {
      return this.currentValue;
    },
    change<T extends keyof Value>(key: T, newValue: any) {
      this.update({
        ...this.currentValue,
        [key]: newValue,
      });
    },
    silentChange<T extends keyof Value>(key: T, newValue: any) {
      this.silentUpdate({
        ...this.currentValue,
        [key]: newValue,
      });
    },
    merge(newValue: Partial<Value>) {
      this.update({
        ...this.currentValue,
        ...newValue,
      });
    },
    update(newValue: (oldValue: Value, atom: Atom<Value, Actions>) => Value) {
      if (newValue === this.currentValue) return;

      const oldValue = this.currentValue;
      let updatedValue: Value;

      if (typeof newValue === "function") {
        updatedValue = newValue(oldValue, this);
      } else {
        updatedValue = newValue;
      }

      if (data.beforeUpdate) {
        const beforeUpdateOutput = data.beforeUpdate(
          updatedValue,
          oldValue,
          this
        );

        if (beforeUpdateOutput !== undefined) {
          updatedValue = beforeUpdateOutput;
        }
      }

      this.currentValue = updatedValue;
      events.trigger(event("update"), this.currentValue, oldValue, this);
      // Object-ness is decided per update, not once from the default: an atom
      // declared with `default: null` that later holds an object (or goes
      // back to null) must still notify its keyed watchers.
      if (isContainer(updatedValue) || isContainer(oldValue)) {
        for (const key in watchers) {
          const keyOldValue = get(oldValue, key);
          const keyNewValue = get(updatedValue, key);

          if (keyOldValue !== keyNewValue) {
            watchers[key].forEach(
              (callback: AtomPartialChangeCallback) =>
                callback(keyNewValue, keyOldValue, this)
            );
          }
        }
      }
    },
    silentUpdate(
      newValue: ((oldValue: Value, atom: Atom<Value>) => Value) | Value
    ) {
      if (newValue === this.currentValue) return;

      const oldValue = this.currentValue;
      let updatedValue: Value;

      if (typeof newValue === "function") {
        updatedValue = (newValue as any)(oldValue, this);
      } else {
        updatedValue = newValue;
      }

      if (data.beforeUpdate) {
        const beforeUpdateOutput = data.beforeUpdate(
          updatedValue,
          oldValue,
          this
        );

        if (beforeUpdateOutput !== undefined) {
          updatedValue = beforeUpdateOutput;
        }
      }

      this.currentValue = updatedValue;
    },
    onChange(
      callback: (newValue: Value, oldValue: Value, atom: Atom<Value>) => void
    ): EventSubscription {
      return events.subscribe(event("update"), callback);
    },
    onReset(callback: (atom: Atom<Value>) => void): EventSubscription {
      return events.subscribe(event("reset"), callback);
    },
    get<T extends keyof Value>(key: T, defaultValue?: any): Value[T] {
      if (data.get) {
        return data.get(
          key as string,
          defaultValue,
          this.currentValue
        ) as Value[T];
      }

      return get(this.currentValue, key as string, defaultValue);
    },
    destroy() {
      events.trigger(event("delete"), this);

      // Drop only THIS atom's own topics. `unsubscribeNamespace(atomEvent)`
      // also matches `atoms.<key>.clone.<n>.*`, so destroying a template
      // would silently unsubscribe every clone of it.
      for (const type of ATOM_EVENT_TYPES) {
        events.unsubscribe(event(type));
      }

      // A `register: false` atom may share its key with a registered one;
      // only remove the registry entry when it really is this atom.
      if (atoms[atomKey] === atom) {
        delete atoms[atomKey];
      }
    },
    onDestroy(callback: (atom: Atom<Value>) => void): EventSubscription {
      return events.subscribe(`atoms.${this.key}.delete`, callback);
    },
    reset() {
      this.update(clone(this.defaultValue));
      events.trigger(event("reset"), this);
    },
    /**
     * Reset the value without triggering the update event
     * But this will trigger the reset event
     */
    silentReset() {
      this.currentValue = clone(this.defaultValue);
      events.trigger(event("reset"), this);
    },
    hydratePersisted() {
      // Replaced by `attachPersist` when the atom has a persist adapter.
    },
    clone(cloneOptions?: CloneAtomOptions) {
      const seedFromDefault = cloneOptions?.seed === "default";

      return createAtom(
        {
          key: this.key + ".clone." + ++cloneCounter,
          default: clone(
            seedFromDefault ? this.defaultValue : this.currentValue
          ),
          beforeUpdate: data.beforeUpdate,
          get: data.get,
          onUpdate: data.onUpdate,
          actions: data.actions,
        },
        {
          register: cloneOptions?.register ?? true,
          origin: cloneOrigins.get(this) ?? this,
        }
      );
    },
  } as any;

  // Install actions on the atom instance.
  //
  // Three kinds of entries can appear in `actions`:
  //   1. Plain functions — bound to the atom so `this` refers to it.
  //   2. Property getters (e.g. `atomCollection`'s `length`) — forwarded
  //      as getters bound to the atom; calling `.bind(...)` on them would
  //      blow up because the getter is invoked the moment we touch it.
  //   3. Anything else — assigned by value as a fallback.
  if (data.actions) {
    const actions = data.actions as Record<string, unknown>;
    for (const actionKey of Object.keys(actions)) {
      const descriptor = Object.getOwnPropertyDescriptor(actions, actionKey);
      if (descriptor?.get) {
        Object.defineProperty(atom, actionKey, {
          get: descriptor.get.bind(atom),
          set: descriptor.set ? descriptor.set.bind(atom) : undefined,
          enumerable: true,
          configurable: true,
        });
        continue;
      }
      const value = actions[actionKey];
      if (typeof value === "function") {
        (atom as any)[actionKey] = (value as Function).bind(atom);
      } else {
        (atom as any)[actionKey] = value;
      }
    }
  }

  if (data.onUpdate) {
    events.subscribe(event("update"), data.onUpdate.bind(atom));
  }

  const shouldRegister = options.register ?? data.register ?? true;

  if (options.origin) {
    cloneOrigins.set(atom, options.origin);
  } else if (!shouldRegister) {
    localAtoms.add(atom);
  }

  if (shouldRegister) {
    atoms[atomKey] = atom;
  }

  // Persistence wiring. Resolve the adapter (boolean → built-in
  // localStorage, object → as-is, falsy → skip). The adapter handles
  // the initial read and the write-through; we just hand it the atom.
  // With `persistHydration: "deferred"` the initial read waits for
  // `atom.hydratePersisted()` (React atoms call it after mount).
  const adapter = resolvePersistAdapter(data.persist);
  if (adapter) {
    atom.hydratePersisted = attachPersist(
      atom,
      adapter,
      data,
      data.persistHydration ?? "immediate"
    );
  }

  return atom;
}

/**
 * Get all atoms list
 */
export function atomsList(): Atom<any>[] {
  return Object.values(atoms);
}

/**
 * Return atoms in object format
 */
export function atomsObject(): Record<string, Atom<any>> {
  return atoms;
}
