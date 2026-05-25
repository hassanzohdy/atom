---
name: mongez-atom-collections
description: How to use atomCollection to manage array-typed atoms with built-in mutation verbs like push, pop, remove, map, and replace.
when_to_use: |
  - User imports or calls atomCollection from @mongez/atom
  - User asks how to manage a list or array of items as atom state
  - User calls push, pop, shift, unshift, remove, removeItem, replace, or map on an atom
  - User asks about the AtomCollectionActions type or CollectionOptions
  - User asks about the length getter on a collection atom
---

# Atom Collections

`atomCollection<T>(options)` is a thin layer over `createAtom` that ships array-mutation verbs as actions.

## Signature

```ts
atomCollection<Value>(options: CollectionOptions<Value>): Atom<Value[], AtomCollectionActions<Value>>
```

```ts
type CollectionOptions<V> = Omit<AtomOptions<V[], AtomCollectionActions<V>>, "default"> & {
  default?: V[];   // defaults to []
};
```

## Actions

| Action | Description |
|---|---|
| `push(...items)` | Append. |
| `unshift(...items)` | Prepend. |
| `pop()` / `shift()` | Drop last / first. |
| `replace(index, item)` | Overwrite at index. |
| `remove(indexOrPredicate)` | Drop one by index or `(item, index, array) => boolean`. |
| `removeItem(item)` | Strict-equality remove of the first occurrence. |
| `removeAll(item)` | Returns a filtered copy (does NOT mutate — name is historical, use `update` if you want to commit). |
| `map(cb)` | In-place map: rewrites the value AND returns the new array. |
| `forEach(cb)` | Read-only iteration. |
| `index(predicate)` | `findIndex` wrapper. |
| `get(indexOrPredicate)` | Single-element read. |
| `length` | Property getter — current size. |

## Example

```ts
type Todo = { id: number; text: string; done: boolean };

const todos = atomCollection<Todo>({
  key: "todos",
  default: [],
  actions: {
    toggle(this: Atom<Todo[]>, id: number) {
      this.update(this.value.map(t => t.id === id ? { ...t, done: !t.done } : t));
    },
  },
});

todos.push({ id: 1, text: "Buy bread", done: false });
todos.toggle(1);
todos.remove((t) => t.done);
```

## Gotchas

- `removeAll` is non-mutating by historical name. If you want to commit the result, do `todos.update(todos.removeAll(item))` or use `remove`/`removeItem`.
- `map` is mutating despite the name — it rewrites the value AND returns the new array. Use `atom.value.map(...)` if you want a pure transform.
- The `length` action is exposed as a property getter, not a function. Read it as `todos.length`, not `todos.length()`.
