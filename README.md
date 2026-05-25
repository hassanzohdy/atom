# @mongez/atom

> A framework-agnostic, action-shaped state primitive with first-class SSR isolation, derived values, persistence, and Redux DevTools.

`@mongez/atom` is the core of the Mongez state-management family. The React adapter lives in [`@mongez/react-atom`](https://github.com/hassanzohdy/mongez-react-atom); the client-side server-state cache in [`@mongez/atomic-query`](https://github.com/hassanzohdy/mongez-atomic-query).

The atom isn't just a value — it's a value with **methods bound to it**. Instead of writing setters and helper functions everywhere, you define actions on the atom itself and call them as verbs: `cart.push(item)`, `modal.open()`, `auth.login(creds)`.

## Install

```sh
yarn add @mongez/atom
# peer deps: @mongez/events, @mongez/reinforcements
```

## A 30-second tour

```ts
import { createAtom, atomCollection, derive } from "@mongez/atom";

// 1. A boolean toggle with action verbs.
const sidebar = createAtom({
  key: "ui.sidebar",
  default: false,
  actions: {
    open()   { this.update(true); },
    close()  { this.update(false); },
    toggle() { this.update(!this.value); },
  },
});

sidebar.toggle();

// 2. A list with built-in mutation helpers.
type Todo = { id: number; text: string; done: boolean };
const todos = atomCollection<Todo>({ key: "todos", default: [] });
todos.push({ id: 1, text: "Buy bread", done: false });
todos.remove(t => t.done);

// 3. A derived atom — auto-tracks its dependencies.
const incompleteCount = derive("todos.incomplete", get =>
  get(todos).filter(t => !t.done).length,
);

incompleteCount.value;  // 1
todos.push({ id: 2, text: "Read book", done: false });
incompleteCount.value;  // 2  (recomputes automatically)
```

## What's in the box

| Export | Purpose |
|---|---|
| `createAtom` | The atom factory. |
| `atomCollection` | Array-shaped atoms with mutation verbs. |
| `derive` | Computed atoms with auto-tracked dependencies. |
| `AtomStore` / `createAtomStore` | Per-request isolation primitive for SSR. |
| `enableAtomDevtools` | Redux DevTools bridge with time-travel. |
| `persist` (option on `AtomOptions`) | Persist atom values via localStorage or any adapter. |
| `getAtom`, `atomsList`, `atomsObject` | Registry helpers. |

## Methods on every atom

```ts
const counter = createAtom({ key: "counter", default: 0 });

// Reads
counter.value;
counter.defaultValue;

// Writes
counter.update(5);
counter.update(prev => prev + 1);
counter.silentUpdate(0);               // no update event
counter.reset();                        // back to default + emit events
counter.silentReset();                  // back to default, no update event

// Subscriptions
counter.onChange((next, prev) => …);   // returns { unsubscribe }
counter.onReset(…);
counter.onDestroy(…);

// Lifecycle
counter.clone();                       // returns a new atom with key `${key}.clone.{n}`
counter.destroy();
```

For object-valued atoms, you also get:

```ts
const user = createAtom({
  key: "user",
  default: { name: "Anon", age: 0 },
});

user.merge({ age: 31 });               // shallow merge + update event
user.change("name", "Alice");          // set one key + update event
user.silentChange("age", 32);          // set one key, no update event
user.get("name");                      // read one key
user.watch("name", (next, prev) => …); // subscribe to one key only
```

Calling `change` / `merge` / `watch` on a primitive atom (`Atom<boolean>`, `Atom<number>`, `Atom<string>`) is a **compile error** — the methods are stripped from the type because they would silently corrupt the value at runtime.

## Derived atoms

```ts
import { createAtom, derive } from "@mongez/atom";

const firstName = createAtom({ key: "first", default: "Ada" });
const lastName  = createAtom({ key: "last",  default: "Lovelace" });

const fullName = derive("fullName", get => `${get(firstName)} ${get(lastName)}`);

fullName.value;            // "Ada Lovelace"
firstName.update("Grace");
fullName.value;            // "Grace Lovelace"
```

Conditional reads work — branches re-track dependencies on each run:

```ts
const branch = createAtom({ key: "branch", default: "first" as "first" | "last" });
const selected = derive("selected", get =>
  get(branch) === "first" ? get(firstName) : get(lastName),
);
```

Chained derivations propagate: a derive that reads another derive recomputes when either changes.

## Persistence

```ts
import { createAtom, type PersistAdapter } from "@mongez/atom";

// Built-in localStorage adapter (client-only; no-ops on the server)
const themeAtom = createAtom({
  key: "theme",
  default: "light",
  persist: true,
});

// Or plug in any adapter (sync or async)
const myAdapter: PersistAdapter = {
  get:    (key) => myCache.get(key),
  set:    (key, value) => myCache.set(key, value),
  remove: (key) => myCache.delete(key),
};

const userAtom = createAtom({
  key: "user",
  default: { name: "Anon" },
  persist: myAdapter,
});
```

Behavior:

1. On atom creation the adapter is read. A stored value replaces the default via `silentUpdate` (no `update` event fires for the hydration).
2. Every subsequent `update` writes through to the adapter.
3. `reset()` removes the entry.

For SSR, pair with a cookie-aware adapter so the server can read the persisted value during render — localStorage doesn't exist on the server and the built-in adapter no-ops there.

## SSR isolation — `AtomStore`

The module-level `atoms` registry is shared per Node process. Two concurrent SSR requests would write to the same atoms. `AtomStore` solves it:

```ts
import { createAtomStore } from "@mongez/atom";
import { userAtom } from "./state";

const store = createAtomStore();
store.use(userAtom).update({ name: "Alice" });

userAtom.value;                  // { name: "Anon" } (template untouched)
store.get("user")?.value;        // { name: "Alice" } (scoped to this store)
```

API:

```ts
class AtomStore {
  use<V, A>(template: Atom<V, A>): Atom<V, A>;     // lazy clone
  get<V>(key: string): Atom<V> | undefined;
  has(key: string): boolean;
  list(): Atom<any>[];
  hydrate(snapshot: Record<string, unknown>): void;
  snapshot(): Record<string, unknown>;
  destroy(): void;
}
```

For the React side (`<AtomStoreProvider>`, `useAtom`, `useAtomStore`, hydration helpers), see [`@mongez/react-atom`](https://github.com/hassanzohdy/mongez-react-atom).

## DevTools

```ts
import { enableAtomDevtools } from "@mongez/atom";

if (process.env.NODE_ENV !== "production") {
  enableAtomDevtools({
    name: "MyApp",
    ignore: [/^mouse\./, /^scroll\./],   // skip high-frequency atoms
  });
}
```

Connects to `window.__REDUX_DEVTOOLS_EXTENSION__`. You get a live atom list, an update timeline, and time-travel via `JUMP_TO_STATE`. No-op when the extension isn't installed. Tree-shaken when you don't import it.

## Lifecycle events

Each atom emits on the `@mongez/events` bus under the namespace `atoms.${key}`:

- `atoms.${key}.update` — fired by `update` / `change` / `merge`
- `atoms.${key}.reset` — fired by `reset` / `silentReset`
- `atoms.${key}.delete` — fired by `destroy`

Namespace matching in `@mongez/events` is segment-aware, so destroying `users.1` does **not** also destroy `users.10`.

## Examples

### A cart with computed totals via getters

```ts
type Item = { id: string; price: number; qty: number };

const cart = atomCollection<Item>({
  key: "cart",
  actions: {
    get total() {
      return this.value.reduce((sum, i) => sum + i.price * i.qty, 0);
    },
    setQty(this: Atom<Item[]>, id: string, qty: number) {
      this.update(this.value.map(i => (i.id === id ? { ...i, qty } : i)));
    },
  },
});

cart.push({ id: "a", price: 10, qty: 2 });
cart.total;            // 20
cart.setQty("a", 5);
cart.total;            // 50
```

### Derived "can checkout" across atoms

```ts
const canCheckout = derive("canCheckout", get =>
  get(cart).length > 0 &&
  get(userAtom).loggedIn &&
  !get(checkoutLoading).isLoading,
);

if (canCheckout.value) { /* show button */ }
```

### Persisted preferences

```ts
const themeAtom = createAtom({
  key: "ui.theme",
  default: "light",
  persist: true,
});

// On next page load, themeAtom.value is whatever the user last set.
```

## TypeScript

- `Atom<V>` is a conditional type. Object-only methods (`merge`, `change`, `silentChange`, `get(key)`, `watch(key, cb)`) only exist when `V` is an object/array. `Atom<boolean>.change(...)` is a compile error.
- `AtomActions<V>` no longer collapses to `any`. Per-action type safety is preserved.
- `AtomOptions.default: V` must be a complete value (no `Partial<V>` default).

See [`MIGRATION.md`](./MIGRATION.md) for the v1 → v2 transition.

## Related packages

| Package | Purpose |
|---|---|
| [`@mongez/react-atom`](https://github.com/hassanzohdy/mongez-react-atom) | React hooks, `<AtomStoreProvider>`, SSR helpers, preset atoms. |
| [`@mongez/atomic-query`](https://github.com/hassanzohdy/mongez-atomic-query) | Client-side query cache: `useQuery`, `useMutation`, `useInfiniteQuery`, `useSuspenseQuery`. |
| [`@mongez/events`](https://github.com/hassanzohdy/events) | Tiny event bus. Used internally. |
| [`@mongez/reinforcements`](https://github.com/hassanzohdy/reinforcements) | TypeScript utility belt. `clone`, `get`, … used internally. |

## License

MIT
