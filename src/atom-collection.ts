import { createAtom } from './atom';
import type { Atom, AtomActions, AtomOptions } from './types';

export type IndexOrCallback<Value> =
  | number
  | ((value: Value, index: number, list: Value[]) => boolean);

export interface AtomCollectionActions<Value> extends AtomActions<Value[]> {
  /**
   * Add items to the end of the array
   */
  push(this: Atom<Value[]>, ...items: Value[]): void;
  /**
   * Add items to the beginning of the array
   */
  unshift(this: Atom<Value[]>, ...items: Value[]): void;
  /**
   * Remove the last item from the array
   */
  pop(this: Atom<Value[]>): void;
  /**
   * Remove the first item from the array
   */
  shift(this: Atom<Value[]>): void;
  /**
   * Remove item from array either by index or callback
   */
  remove(this: Atom<Value[]>, indexOrCallback: IndexOrCallback<Value>): void;
  /**
   * Remove item from array by value
   */
  removeItem(this: Atom<Value[]>, item: Value): void;
  /**
   * Remove all items from array by value
   */
  removeAll(this: Atom<Value[]>, item: Value): Value[];
  /**
   * Get item from array either by index or callback
   */
  get(this: Atom<Value[]>, indexOrCallback: IndexOrCallback<Value>): Value | undefined;
  /**
   * Find index of item in array by callback
   */
  index(
    this: Atom<Value[]>,
    callback: (item: Value, index: number, array: Value[]) => boolean,
  ): number;
  /**
   * Map array items
   * This will update the array with the new mapped array and trigger update
   */
  map(
    this: Atom<Value[]>,
    callback: (item: Value, index: number, array: Value[]) => Value,
  ): Value[];
  /**
   * Loop through array items
   */
  forEach(
    this: Atom<Value[]>,
    callback: (item: Value, index: number, array: Value[]) => void,
  ): void;
  /**
   * Replace item in array by index
   */
  replace(this: Atom<Value[]>, index: number, item: Value): void;
  /**
   * Get array length
   */
  length: number; // As a property
}

export type CollectionOptions<Value> = Omit<
  AtomOptions<Value[], AtomCollectionActions<Value>>,
  'default'
> & {
  default?: Value[];
};

/**
 * Create an atom collection
 */
export function atomCollection<Value = any>(
  options: CollectionOptions<Value>,
): Atom<Value[], AtomCollectionActions<Value>> {
  return createAtom<Value[], AtomCollectionActions<Value>>({
    key: options.key,
    default: options.default ?? [],
    actions: {
      ...options.actions,
      push(...items: Value[]) {
        this.update([...this.currentValue, ...items]);
      },
      pop() {
        this.update(this.currentValue.slice(0, -1));
      },
      shift() {
        this.update(this.currentValue.slice(1));
      },
      unshift(...items: Value[]) {
        this.update([...items, ...this.currentValue]);
      },
      remove(indexOrCallback: IndexOrCallback<Value>) {
        const index =
          typeof indexOrCallback === 'function'
            ? this.value.findIndex(indexOrCallback)
            : indexOrCallback;

        if (index === -1) return;

        this.update(this.value.filter((_, i) => i !== index));
      },
      removeItem(item: Value) {
        const index = this.value.indexOf(item);

        if (index === -1) return;

        // using splice
        this.value.splice(index, 1);

        this.update([...this.value]);
      },
      removeAll(item: Value) {
        return this.value.filter((value) => value !== item);
      },
      get(indexOrCallback: IndexOrCallback<Value>) {
        const index: number =
          typeof indexOrCallback === 'function'
            ? this.value.findIndex(indexOrCallback)
            : indexOrCallback;

        return this.value[index];
      },
      index(callback: (item: Value, index: number, array: Value[]) => boolean) {
        return this.value.findIndex(callback);
      },
      map(callback: (item: Value, index: number, array: Value[]) => Value) {
        const value = this.value.map(callback);

        this.update(value);

        return value;
      },
      forEach(callback: (item: Value, index: number, array: Value[]) => void) {
        this.value.forEach(callback);
      },
      get length() {
        return this.value?.length;
      },
      replace(index: number, item: Value) {
        this.update(
          this.value.map((value, i) => {
            if (i === index) {
              return item;
            }

            return value;
          }),
        );
      },
    },
  });
}
