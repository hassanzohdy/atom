/* eslint-disable no-multi-assign */
/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable prefer-template */
import events, { EventSubscription } from '@mongez/events';
import { clone, get, Random } from '@mongez/reinforcements';
import { Atom, AtomActions, AtomOptions, AtomPartialChangeCallback, AtomValue } from './types';

export const atoms: Record<string, Atom<any>> = {};

/**
 * Get atom by name
 */
export function getAtom<T>(name: string): Atom<T> | undefined {
  return atoms[name];
}

/**
 * Create a new atom
 */
export function createAtom<Value = any, Actions extends AtomActions<Value> = AtomActions<Value>>(
  data: AtomOptions<AtomValue<Value>, Actions>,
): Atom<Value, Actions> {
  let defaultValue = data.default;
  let atomValue = data.default;

  let atomValueIsObject = false;

  if (defaultValue && typeof defaultValue === 'object') {
    atomValue = defaultValue = clone(defaultValue);
    atomValueIsObject = true;
  }

  const atomType = Array.isArray(defaultValue) ? 'array' : typeof defaultValue;

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
    watch<T extends keyof Value>(key: T, callback: AtomPartialChangeCallback): EventSubscription {
      if (!watchers[key]) {
        watchers[key] = [];
      }

      watchers[key].push(callback);
      const callbackIndex = watchers[key].length - 1;

      return {
        unsubscribe: () => {
          watchers[key].splice(callbackIndex, 1);
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

      if (typeof newValue === 'function') {
        updatedValue = newValue(oldValue, this);
      } else {
        updatedValue = newValue;
      }

      if (data.beforeUpdate) {
        updatedValue = data.beforeUpdate(updatedValue, oldValue, this);
      }

      this.currentValue = updatedValue;
      events.trigger(event('update'), this.currentValue, oldValue, this);
      if (atomValueIsObject) {
        for (const key in watchers) {
          const keyOldValue = get(oldValue, key);
          const keyNewValue = get(newValue, key);

          if (keyOldValue !== keyNewValue) {
            watchers[key].forEach((callback: (newValue: any, oldValue: any) => void) =>
              callback(keyNewValue, keyOldValue),
            );
          }
        }
      }
    },
    silentUpdate(newValue: ((oldValue: Value, atom: Atom<Value>) => Value) | Value) {
      if (newValue === this.currentValue) return;

      const oldValue = this.currentValue;

      if (typeof newValue === 'function') {
        newValue = (newValue as any)(oldValue, this);
      }

      if (data.beforeUpdate) {
        newValue = data.beforeUpdate(newValue as Value, oldValue, this);
      }

      this.currentValue = newValue;
    },
    onChange(
      callback: (newValue: Value, oldValue: Value, atom: Atom<Value>) => void,
    ): EventSubscription {
      return events.subscribe(event('update'), callback);
    },
    onReset(callback: (atom: Atom<Value>) => void): EventSubscription {
      return events.subscribe(event('reset'), callback);
    },
    get<T extends keyof Value>(key: T, defaultValue?: any): Value[T] {
      if (data.get) {
        return data.get(key as string, defaultValue, this.currentValue) as Value[T];
      }

      const value = get(this.currentValue, key as string, defaultValue);

      // if the value is bindable, then bind the current value to be used as `this`
      return value?.bind ? value.bind(this.currentValue) : value;
    },
    destroy() {
      events.trigger(event('delete'), this);

      events.unsubscribeNamespace(atomEvent);
      delete atoms[this.key];
    },
    onDestroy(callback: (atom: Atom<Value>) => void): EventSubscription {
      return events.subscribe(`atoms.${this.key}.delete`, callback);
    },
    reset() {
      const update = this.update(this.defaultValue);
      events.trigger(event('reset'), this);

      return update;
    },
    /**
     * Reset the value without triggering the update event
     * But this will trigger the reset event
     */
    silentReset() {
      this.currentValue = clone(this.defaultValue);
      events.trigger(event('reset'), this);

      return this;
    },
    clone() {
      return createAtom({
        key: this.key + 'Cloned' + Random.int(1000, 9999),
        default: clone(this.currentValue),
        beforeUpdate: data.beforeUpdate,
        get: data.get,
        onUpdate: data.onUpdate,
      });
    },
  } as any;

  // Bind actions to the atom instance
  if (data.actions) {
    Object.keys(data.actions).forEach((actionKey) => {
      (atom as any)[actionKey] = data.actions![actionKey].bind(atom);
    });
  }

  if (data.onUpdate) {
    events.subscribe(event('update'), data.onUpdate.bind(atom));
  }

  atoms[atomKey] = atom;

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
