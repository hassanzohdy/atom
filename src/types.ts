import { type EventSubscription } from '@mongez/events';

export type AtomPartialChangeCallback = (newValue: any, oldValue: any, atom: Atom<any>) => void;

export type AtomValue<Value> = Value;

export type AtomActionMethod<Value> = (
  ...args: any[]
) => void | Value | Promise<void> | Promise<Value>;

export type AtomActions<Value> = {
  [key: string]: ((this: Atom<Value>, ...args: any[]) => any) | any;
};

/**
 * Atom Options
 */
export type AtomOptions<Value = any, Actions extends AtomActions<Value> = {}> = {
  /**
   * Atom unique key
   */
  key: string;
  /**
   * Atom default value
   */
  default: Value | Partial<Value>;
  /**
   * Make adjustments on the value before updating the atom
   */
  beforeUpdate?: (newValue: Value, oldValue: Value, atom: Atom<AtomValue<Value>, Actions>) => Value;
  /**
   * Triggered when atom is updated
   */
  onUpdate?: (callback: AtomChangeCallback<Value, Actions>) => EventSubscription;
  /**
   * Set getter function, works only when atom's value is object
   */
  get?: (key: string, defaultValue?: Value, atomValue?: Value) => Value;
  /**
   * Atom actions, this is used to add methods to the atom instance
   * i.e: actions: { increment: () => this.update(this.value + 1) }, usage will be atom.increment()
   */
  actions?: Actions & ThisType<Atom<Value, Actions>>;
};

export type AtomChangeCallback<Value, Actions extends AtomActions<Value>> = (
  newValue: Value,
  oldValue: Value,
  atom: Atom<Value, Actions>,
) => void;

/**
 * The Atom Instance
 */
// Generic Type Value can be any type or object with
export type Atom<Value = any, Actions extends AtomActions<Value> = {}> = {
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
  update: (value: ((oldValue: Value, atom: Atom<Value>) => Value) | Value) => void;

  /**
   * Update atom value without triggering the update event
   */
  silentUpdate: (value: ((oldValue: Value, atom: Atom<Value>) => Value) | Value) => void;

  /**
   * Merge the given object with current atom value
   * This is sort of partial update that works only if atom's value is an object
   */
  merge: (value: Partial<Value>) => void;

  /**
   * Change only one key of the atom
   * Works only if atom's value is an object
   */
  change: <T extends keyof Value>(key: T, newValue: any) => void;

  /**
   * Change only one key of the atom without triggering the update event
   * Works only if atom's value is an object
   */
  silentChange: <T extends keyof Value>(key: T, newValue: any) => void;

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
  onChange: (callback: AtomChangeCallback<Value, Actions>) => EventSubscription;

  /**
   * Watch for atom value change
   * This can be used only when atom's default value is an object or an array
   * The key accepts dot.notation syntax
   */
  watch: <T extends keyof Value>(key: T, callback: AtomPartialChangeCallback) => EventSubscription;

  /**
   * An event listener to the atom destruction
   */
  onDestroy(callback: (atom: Atom<Value>) => void): EventSubscription;

  /**
   * Called when reset is called
   */
  onReset(callback: (atom: Atom<Value>) => void): EventSubscription;

  /**
   * Get value from atom's value
   * Works only if atom's value is an object
   */
  get<T extends keyof Value>(key: T, defaultValue?: any): Value[T];

  /**
   * Clone the atom
   * This will return a new atom but the key will be suffixed with Clone{Number}
   * i.e atom name is: user5122
   * cloned atom name will be: userClone
   */
  clone: () => Atom<Value, Actions>;

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
} & Actions;
