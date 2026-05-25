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
} from "./types";

export const atoms: Record<string, Atom<any>> = {};

let cloneCounter = 0;

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
   * Defaults to true.
   */
  register?: boolean;
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

  let atomValueIsObject = false;

  if (defaultValue && typeof defaultValue === "object") {
    atomValue = defaultValue = clone(defaultValue);
    atomValueIsObject = true;
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
      if (atomValueIsObject) {
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

      events.unsubscribeNamespace(atomEvent);
      delete atoms[this.key];
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
    clone(cloneOptions?: CreateAtomOptions) {
      return createAtom(
        {
          key: this.key + ".clone." + (++cloneCounter),
          default: clone(this.currentValue),
          beforeUpdate: data.beforeUpdate,
          get: data.get,
          onUpdate: data.onUpdate,
          actions: data.actions,
        },
        { register: cloneOptions?.register ?? true }
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

  if (options.register !== false) {
    atoms[atomKey] = atom;
  }

  // Persistence wiring. Resolve the adapter (boolean → built-in
  // localStorage, object → as-is, falsy → skip). The adapter handles
  // the initial read and the write-through; we just hand it the atom.
  const adapter = resolvePersistAdapter(data.persist);
  if (adapter) {
    attachPersist(atom, adapter, data);
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
