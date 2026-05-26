<div align="center">

# @mongez/atom

**Framework-agnostic, action-shaped state primitive — typed atoms with verbs bound to them, computed values, per-request SSR isolation, pluggable persistence, and Redux DevTools.**

[![npm](https://img.shields.io/npm/v/@mongez/atom.svg)](https://www.npmjs.com/package/@mongez/atom)
[![license](https://img.shields.io/npm/l/@mongez/atom.svg)](LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@mongez/atom.svg)](https://bundlephobia.com/package/@mongez/atom)
[![downloads](https://img.shields.io/npm/dw/@mongez/atom.svg)](https://www.npmjs.com/package/@mongez/atom)

</div>

---

## Why @mongez/atom?

Zustand bundles state into a single store with a single setter, so every feature reaches across the same global hook. Jotai gives you atoms but no methods on them — `set(cartAtom, [...get(cartAtom), item])` everywhere. Recoil shares the atom shape but demands a `RecoilRoot` and a React tree to function. MobX gives you methods, but only through ES class decorators and observable proxies that make plain-object debugging painful. `@mongez/atom` is the smallest layer that makes each atom a typed value carrying its own bound verbs (`cart.push(item)`, `sidebar.toggle()`, `auth.login(creds)`), works in plain Node and in any framework, isolates state per SSR request without a Provider, and exposes one `persist` slot that accepts any `{ get, set, remove }` adapter.

```ts
import { createAtom } from "@mongez/atom";

const sidebar = createAtom({
  key: "ui.sidebar",
  default: false,
  actions: {
    open()   { this.update(true); },
    close()  { this.update(false); },
    toggle() { this.update(!this.value); },
  },
});

sidebar.toggle();   // verb on the atom — no setSidebar(!sidebar) ceremony
sidebar.value;      // true
```

---

## Features

| Feature | Description |
|---|---|
| **Action-shaped atoms** | Define verbs in the `actions` bag; `this` inside is bound to the atom — call as `atom.toggle()`, not `setAtom(!atom.value)`. |
| **Type-safe by shape** | `Atom<V>` is conditional: `change` / `merge` / `watch` are stripped when `V` is a primitive, so `Atom<boolean>.change(...)` is a compile error. |
| **Array atoms with verbs** | `atomCollection` pre-installs `push`, `pop`, `shift`, `unshift`, `replace`, `remove`, `removeItem`, `map`, `forEach`, `index`, and a `length` getter. |
| **Derived atoms** | `derive(key, get => …)` auto-tracks dependencies. Conditional reads work; the dep set is diffed each run. Chains propagate. |
| **Per-request SSR isolation** | `AtomStore` clones templates per request; the module-level registry stays untouched. Snapshot and hydrate ship in the box. |
| **Pluggable persistence** | `persist: true` uses the built-in localStorage adapter. Any `{ get, set, remove }` (sync or async) plugs in — cookies, IndexedDB, `@mongez/cache`. |
| **Redux DevTools** | `enableAtomDevtools()` ships a timeline, action log, and `JUMP_TO_STATE` time-travel. Tree-shaken when unused. |
| **Lifecycle events** | Every atom emits on `atoms.${key}.update` / `.reset` / `.delete` via `@mongez/events` — segment-aware namespaces. |
| **Framework-agnostic** | Zero React / Vue / Solid coupling. The React adapter lives in [`@mongez/react-atom`](https://github.com/hassanzohdy/mongez-react-atom). |

---

## Installation

```sh
npm install @mongez/atom
```

```sh
yarn add @mongez/atom
```

```sh
pnpm add @mongez/atom
```

Peer dependencies (installed automatically): `@mongez/events`, `@mongez/reinforcements`.

---

## Quick start

```ts
import { createAtom, atomCollection, derive } from "@mongez/atom";

// 1. A primitive atom with action verbs.
const sidebar = createAtom({
  key: "ui.sidebar",
  default: false,
  actions: {
    open()   { this.update(true); },
    close()  { this.update(false); },
    toggle() { this.update(!this.value); },
  },
});

// 2. An array atom — push/pop/remove built in.
type Todo = { id: number; text: string; done: boolean };

const todos = atomCollection<Todo>({ key: "todos", default: [] });
todos.push({ id: 1, text: "Buy bread", done: false });
todos.remove(t => t.done);

// 3. A derived atom — recomputes when dependencies change.
const incompleteCount = derive("todos.incomplete", get =>
  get(todos).filter(t => !t.done).length,
);

incompleteCount.value;                      // 1
todos.push({ id: 2, text: "Read book", done: false });
incompleteCount.value;                      // 2 — auto-tracked
```

That's the entire happy path. Everything below is depth on the same surface.

---

## createAtom — the core factory

`createAtom(options)` builds an atom and registers it in the module-level `atoms` map. The `key` is the unique identifier — duplicates overwrite.

```ts
import { createAtom } from "@mongez/atom";

const counter = createAtom({
  key: "counter",
  default: 0,
});

counter.value;                  // 0
counter.update(5);              // emits update event
counter.update(prev => prev + 1);
counter.silentUpdate(0);        // sets value, suppresses update event
counter.reset();                // back to default, emits update + reset
counter.silentReset();          // back to default, emits reset only
```

### AtomOptions

| Option | Type | Purpose |
|---|---|---|
| `key` | `string` | Unique registry key. Namespace with dots: `"ui.sidebar"`, `"auth.user"`. |
| `default` | `V` | Complete initial value. Drives type inference. Must NOT be `Partial<V>`. |
| `actions` | `Record<string, fn \| getter>` | Methods/getters bound to the atom — `this` resolves to the atom. |
| `beforeUpdate` | `(next, prev, atom) => V \| void` | Transform or veto an incoming value. Returning `undefined` keeps `next`. |
| `onUpdate` | `(cb) => EventSubscription` | Subscribe to updates at construction. |
| `get` | `(key, default?, value?) => V[K]` | Custom getter routed through `atom.get(key)`. |
| `persist` | `boolean \| PersistAdapter<V>` | Persist value externally — see [Persistence](#persistence). |

### Base methods on every atom

| Method | What it does |
|---|---|
| `atom.value` / `atom.currentValue` | Read the current value (getter and plain field). |
| `atom.defaultValue` / `atom.default` | Read the construction-time default. |
| `atom.update(next \| prev => next)` | Replace the value; emit `update` event. Updater fn supported. |
| `atom.silentUpdate(next)` | Replace the value with no `update` event — used for hydration. |
| `atom.reset()` | Restore the default; emit `update` AND `reset` events. |
| `atom.silentReset()` | Restore the default; emit `reset` only. |
| `atom.onChange(cb)` | Subscribe to updates. Returns `{ unsubscribe }`. |
| `atom.onReset(cb)` / `atom.onDestroy(cb)` | Lifecycle subscriptions. |
| `atom.clone({ register? })` | Deep-clone into `${key}.clone.{n}`. `register: false` skips the global map. |
| `atom.destroy()` | Remove from registry, unsubscribe namespace events, emit `delete`. |
| `atom.type` | `"object" \| "array" \| typeof primitive` — locked at construction. |
| `atom.length` | Array/string length getter. |

### Object-only methods (conditional)

When `V` is an object/array, the atom also carries:

| Method | What it does |
|---|---|
| `atom.merge(partial)` | Shallow-merge into the value; emit `update`. |
| `atom.change(key, value)` | Set one property; emit `update`. Typed as `(K, V[K])`. |
| `atom.silentChange(key, value)` | Same without the `update` event. |
| `atom.get(key, default?)` | Read one property (or via the custom `get` option). |
| `atom.watch(key, cb)` | Subscribe to changes of a single key. Returns `{ unsubscribe }`. |

> Calling `merge` / `change` / `watch` on a primitive atom (`Atom<boolean>`, `Atom<number>`, `Atom<string>`) is a compile error — these methods are stripped from the type because they would silently corrupt the value at runtime.

### Object atom with watch

```ts
type User = { name: string; email: string };

const user = createAtom({
  key: "auth.user",
  default: { name: "Anon", email: "" } satisfies User,
});

user.watch("name", (next, prev) => {
  // Why: only react to the field we care about, not the whole object.
  console.log(`Name: ${prev} → ${next}`);
});

user.merge({ name: "Alice" });   // "Name: Anon → Alice"
user.merge({ email: "a@b.co" }); // (watcher does not fire — different key)
```

### beforeUpdate as a validator

```ts
const port = createAtom({
  key: "config.port",
  default: 3000,
  beforeUpdate(next) {
    // Why: keep ports in the valid TCP range and integer-only.
    if (next < 1 || next > 65535) return;   // returning void keeps `next` as-is
    return Math.floor(next);                 // transform: rewrite the value
  },
});

port.update(8443.7);    // value becomes 8443
port.update(999999);    // ignored — out of range
port.value;             // 8443
```

> `silentUpdate` still runs `beforeUpdate`. The "silent" only suppresses the `update` event emission, not the validation pipeline.

### Registry helpers

```ts
import { getAtom, atomsList, atomsObject } from "@mongez/atom";

getAtom("auth.user");     // Atom<User> | undefined
atomsList();              // Atom<any>[]
atomsObject();            // Record<string, Atom<any>>
```

---

## Actions — verbs on the atom

The `actions` bag accepts three shapes:

| Kind | Behavior |
|---|---|
| Plain function | Bound to the atom; `this` resolves to the atom instance. |
| Property getter (`get x()`) | Forwarded as a real getter on the atom — recomputed per read. |
| Other value | Copied through as a plain property. |

```ts
type Item = { id: string; price: number; qty: number };

const cart = createAtom({
  key: "cart",
  default: [] as Item[],
  actions: {
    addItem(item: Item) {
      this.update([...this.value, item]);
    },
    setQty(id: string, qty: number) {
      this.update(this.value.map(i => i.id === id ? { ...i, qty } : i));
    },
    get total() {
      // Getter: recomputed each read, no subscription bookkeeping.
      return this.value.reduce((sum, i) => sum + i.price * i.qty, 0);
    },
    get isEmpty() {
      return this.value.length === 0;
    },
    MAX_LINES: 99,             // plain value — copied through
  },
});

cart.addItem({ id: "a", price: 10, qty: 2 });
cart.total;       // 20
cart.setQty("a", 5);
cart.total;       // 50
cart.isEmpty;     // false
cart.MAX_LINES;   // 99
```

> The action installer detects descriptors via `Object.getOwnPropertyDescriptor` and routes getters as getters. Arrow functions in `actions` work but `this` will be `undefined` — use regular function syntax so `this` resolves to the atom.

---

## atomCollection — arrays with verbs built-in

`atomCollection<T>(options)` is a thin layer over `createAtom` that pre-installs mutation verbs. Use it whenever the value is an array.

```ts
import { atomCollection, type Atom } from "@mongez/atom";

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
```

### Built-in actions

| Action | Effect |
|---|---|
| `push(...items)` | Append to end. |
| `unshift(...items)` | Prepend to start. |
| `pop()` / `shift()` | Drop the last / first item. |
| `replace(index, item)` | Overwrite the item at `index`. |
| `remove(indexOrPredicate)` | Drop one item by index or `(item, i, arr) => boolean`. |
| `removeItem(item)` | Remove the first occurrence by `===` equality. |
| `removeAll(item)` | Drop every `===` match. Mutates and emits update. |
| `get(indexOrPredicate)` | Single-item read. Returns `undefined` if no match. |
| `index(predicate)` | `Array.findIndex` wrapper. |
| `map(cb)` | In-place map — rewrites the value AND returns the new array. |
| `forEach(cb)` | Read-only iteration. |
| `length` | Property getter — current size. |

```ts
todos.push({ id: 1, text: "Buy bread", done: false });
todos.push({ id: 2, text: "Read book", done: true });

todos.toggle(1);                       // custom action
todos.remove(t => t.done);             // by predicate
todos.replace(0, { id: 1, text: "Buy sourdough", done: false });
todos.index(t => t.id === 1);          // 0
todos.get(t => t.id === 1);            // { id: 1, text: "Buy sourdough", done: false }
todos.length;                          // 1 — property, NOT a function call
```

> `map` mutates and emits an update event. If you only want a pure transform, read `todos.value.map(...)`.

---

## Derived atoms — `derive`

`derive(key, compute)` builds an atom whose value is computed from other atoms. Whichever atoms the `compute` function reads via the `get` argument become dependencies. When any of them change, the derived atom recomputes and its subscribers fire.

```ts
import { createAtom, derive } from "@mongez/atom";

const firstName = createAtom({ key: "auth.firstName", default: "Ada" });
const lastName  = createAtom({ key: "auth.lastName",  default: "Lovelace" });

const fullName = derive("auth.fullName", get =>
  `${get(firstName)} ${get(lastName)}`,
);

fullName.value;                  // "Ada Lovelace"
firstName.update("Grace");
fullName.value;                  // "Grace Lovelace" — recomputed
```

### Behavior

| Trait | Effect |
|---|---|
| Eager initial compute | The compute fn runs once on creation to seed the value and discover deps. |
| Eager recompute | Any tracked dep change reruns compute and pushes through the atom's normal `update`. |
| Dynamic dep graph | Conditional reads add/drop deps each run — diffed and reconciled automatically. |
| Chaining | A derive that reads another derive recomputes when either changes. |
| Error isolation | Throws inside `compute` keep the previous value and re-throw asynchronously via `queueMicrotask` — they don't break the source atom's update cycle. |
| Auto cleanup | `derivedAtom.destroy()` unsubscribes from every tracked dep. |

### Conditional reads (dynamic dep graph)

```ts
const branch = createAtom({ key: "branch", default: "first" as "first" | "last" });

const selected = derive("auth.selected", get =>
  // The dep set changes when `branch` flips — old deps drop, new ones subscribe.
  get(branch) === "first" ? get(firstName) : get(lastName),
);

branch.update("last");
selected.value;                  // reads lastName now; firstName dep was dropped
```

### Cross-atom gates

```ts
const canCheckout = derive("checkout.allowed", get =>
  get(cart).length > 0 &&
  get(user).loggedIn &&
  !get(checkoutLoading).isLoading,
);

if (canCheckout.value) { /* show button */ }
```

> Don't call `update` / `merge` / `change` on a derived atom — it works, but the next dependency change overwrites your write. Use a regular `createAtom` if you need writable state.

---

## Persistence

Atoms can persist their value to any store-shaped object: localStorage, sessionStorage, cookies, IndexedDB, `@mongez/cache`, a remote backend — anything matching the `PersistAdapter` shape.

### PersistAdapter contract

```ts
type PersistAdapter<V = unknown> = {
  get(key: string): V | undefined | Promise<V | undefined>;
  set(key: string, value: V): void | Promise<void>;
  remove(key: string): void | Promise<void>;
};
```

Methods may be sync OR async — the engine awaits Promises internally.

### Built-in localStorage adapter

```ts
import { createAtom } from "@mongez/atom";

const themeAtom = createAtom({
  key: "ui.theme",
  default: "light" as "light" | "dark",
  persist: true,                       // shorthand for the built-in localStorageAdapter
});

themeAtom.update("dark");
// On next page load, themeAtom.value === "dark" — restored silently from localStorage["ui.theme"]
```

The built-in adapter checks `typeof window === "undefined"` and no-ops on the server.

### Lifecycle

1. **Bootstrap.** On creation the adapter is read. A stored value lands via `silentUpdate` (no `update` event fires for the hydration). Async adapters resolve after the constructor returns.
2. **Write-through.** Every `update` / `change` / `merge` writes to the adapter. `silentUpdate` does NOT — silent means silent, including to storage.
3. **Reset removes.** `reset()` deletes the entry from the adapter; the next session starts fresh.
4. **Error tolerance.** Sync throws and async rejections are swallowed so a transient storage error (quota exceeded, private-mode block) never crashes the atom.

### Custom adapter — cookies (SSR-friendly)

```ts
import { createAtom, type PersistAdapter } from "@mongez/atom";

function cookieAdapter(): PersistAdapter {
  return {
    get(key) {
      if (typeof document === "undefined") return undefined;
      const m = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
      if (!m) return undefined;
      try { return JSON.parse(decodeURIComponent(m[1])); } catch { return undefined; }
    },
    set(key, value) {
      if (typeof document === "undefined") return;
      document.cookie = `${key}=${encodeURIComponent(JSON.stringify(value))};path=/;max-age=31536000`;
    },
    remove(key) {
      if (typeof document === "undefined") return;
      document.cookie = `${key}=;path=/;max-age=0`;
    },
  };
}

const localeAtom = createAtom({
  key: "ui.locale",
  default: "en",
  persist: cookieAdapter(),
});
```

> The atom's `key` IS the storage key. Namespace your keys (`auth.user`, `ui.theme`) to avoid collisions across atoms.

---

## SSR isolation — `AtomStore`

The module-level `atoms` registry is shared per Node process. In SSR, two concurrent requests would write to the same atoms. `AtomStore` gives each request its own scoped clones — the template atoms are never mutated.

```ts
import { createAtomStore } from "@mongez/atom";
import { userAtom, localeAtom } from "./state";

async function handleRequest(req, res) {
  const store = createAtomStore();

  try {
    // Lazily clone — first call creates a scoped copy of the template.
    const user = store.use(userAtom);
    user.update({ name: req.user.name, loggedIn: true });

    userAtom.value;            // { name: "Anon", loggedIn: false } — template untouched
    store.get("user")?.value;  // { name: req.user.name, ... } — scoped

    const html     = renderApp(store);
    const snapshot = store.snapshot();        // serialize for client hydration
    res.send(buildHtml(html, snapshot));
  } finally {
    // CRITICAL: scoped clones subscribe to the event bus; destroy to release them.
    store.destroy();
  }
}
```

### API

| Member | Behavior |
|---|---|
| `store.use(template)` | Lazy clone — first call creates the scoped clone, later calls return it. |
| `store.get(key)` | Look up an existing scoped atom by the template's original key. `undefined` if not yet `use()`d. |
| `store.has(key)` | True when `use(template)` has been called for the matching key. |
| `store.list()` | All scoped atoms currently in this store, in insertion order. |
| `store.hydrate(snapshot)` | Apply a snapshot. Atoms not yet used have their values queued and applied on the first `use(template)` call. |
| `store.snapshot()` | Serialize every scoped atom's value to a plain object — pair with `hydrate` on the client. |
| `store.destroy()` | Destroy every scoped clone and clear the store. Always call after each request. |

> `store.use(template)` is the only path that sees scoped state on the server. Reading `userAtom.value` directly on the server returns the template default, not the request-scoped value. Route every server-side read through `store.use()`.

> The React-side wiring (`<AtomStoreProvider>`, `useAtom`, `useAtomStore`) lives in [`@mongez/react-atom`](https://github.com/hassanzohdy/mongez-react-atom).

---

## Redux DevTools — `enableAtomDevtools`

```ts
import { enableAtomDevtools } from "@mongez/atom";

if (process.env.NODE_ENV !== "production") {
  enableAtomDevtools({
    name: "MyApp",
    ignore: [/^mouse\./, /^scroll\./, "perf.heartbeat"],   // skip noisy atoms
    scanInterval: 1000,                                     // ms; default 1000
  });
}
```

| Option | Default | Effect |
|---|---|---|
| `name` | `"@mongez/atom"` | Label shown in the extension UI. |
| `ignore` | `[]` | Patterns (string exact-match or RegExp) — atoms whose key matches are skipped. |
| `scanInterval` | `1000` | ms between polls for newly-registered atoms (lazy-loaded routes). |

What you get:

- Initial snapshot of every registered atom.
- Per-update timeline entries typed as `${atomKey}/update` with the new value as payload.
- Lifecycle entries: `${atomKey}/reset` and `${atomKey}/destroy`.
- Time-travel: jumping in the timeline restores every atom via `silentUpdate` + a synthetic update event so React subscribers re-render.

`enableAtomDevtools` returns a teardown function. Call it on hot-reload to release subscriptions cleanly:

```ts
const teardown = enableAtomDevtools({ name: "MyApp" });

if ((import.meta as any).hot) {
  (import.meta as any).hot.dispose(() => teardown());
}
```

> Connects to `window.__REDUX_DEVTOOLS_EXTENSION__`. No-op (returns an empty teardown) when the extension isn't installed. Tree-shaken from your bundle when never imported.

---

## Lifecycle events

Every atom emits on the `@mongez/events` bus under the namespace `atoms.${key}`:

| Event | Fired by |
|---|---|
| `atoms.${key}.update` | `update()`, `change()`, `merge()` |
| `atoms.${key}.reset` | `reset()`, `silentReset()` |
| `atoms.${key}.delete` | `destroy()` |

Namespace matching is segment-aware, so destroying `users.1` does NOT also wipe `users.10`.

```ts
import events from "@mongez/events";

events.subscribe("atoms.auth.user.update", (next, prev, atom) => {
  console.log("user changed:", prev, "→", next);
});
```

---

## Recipes

### Persist user preferences across reloads

Reach for this when small, JSON-serializable settings (theme, language, sidebar collapsed) need to survive refresh.

```ts
import { createAtom } from "@mongez/atom";

type Prefs = {
  theme: "light" | "dark";
  locale: "en" | "fr" | "ar";
  sidebarCollapsed: boolean;
};

const prefsAtom = createAtom({
  key: "ui.prefs",
  default: { theme: "light", locale: "en", sidebarCollapsed: false } satisfies Prefs,
  persist: true,                       // localStorage["ui.prefs"]
});

prefsAtom.change("theme", "dark");     // typed: ("theme", "light" | "dark")
prefsAtom.merge({ locale: "fr" });

// On next page load, prefsAtom.value reflects whatever the user last set.
```

### Build a shopping cart with computed totals

Reach for this when you need an array atom that tracks line items plus derived properties (subtotal, tax, count) that should never go stale.

```ts
import { atomCollection, type Atom } from "@mongez/atom";

type LineItem = { sku: string; name: string; price: number; qty: number };

const cart = atomCollection<LineItem>({
  key: "cart.items",
  default: [],
  actions: {
    addItem(item: LineItem) {
      const existing = this.value.find(i => i.sku === item.sku);
      if (existing) {
        // Why: merge quantities instead of duplicating SKUs.
        this.update(this.value.map(i =>
          i.sku === item.sku ? { ...i, qty: i.qty + item.qty } : i,
        ));
      } else {
        this.push(item);
      }
    },
    setQty(this: Atom<LineItem[]>, sku: string, qty: number) {
      if (qty <= 0) {
        this.remove(i => i.sku === sku);
        return;
      }
      this.update(this.value.map(i => i.sku === sku ? { ...i, qty } : i));
    },
    get subtotal() {
      return this.value.reduce((s, i) => s + i.price * i.qty, 0);
    },
    get itemCount() {
      return this.value.reduce((s, i) => s + i.qty, 0);
    },
  },
});

cart.addItem({ sku: "BREAD-1", name: "Sourdough", price: 6.5, qty: 1 });
cart.addItem({ sku: "BREAD-1", name: "Sourdough", price: 6.5, qty: 2 });
cart.subtotal;     // 19.5
cart.itemCount;    // 3
cart.setQty("BREAD-1", 0);   // removes line
cart.value;        // []
```

### Compose state across atoms with `derive`

Reach for this when one value depends on several others and must stay in sync — checkout eligibility, badge counts, filtered views.

```ts
import { createAtom, atomCollection, derive } from "@mongez/atom";

type Order = { id: string; status: "draft" | "placed" | "paid" };

const orders = atomCollection<Order>({ key: "orders", default: [] });
const filter = createAtom({ key: "orders.filter", default: "all" as "all" | "draft" | "paid" });
const user   = createAtom({ key: "auth.user",     default: { loggedIn: false } });

const visibleOrders = derive("orders.visible", get => {
  const list = get(orders);
  const f    = get(filter);
  if (f === "all") return list;
  return list.filter(o => o.status === f);
});

const canPlaceOrder = derive("orders.canPlace", get =>
  get(user).loggedIn && get(orders).some(o => o.status === "draft"),
);

orders.push({ id: "o1", status: "draft" });
user.merge({ loggedIn: true });

visibleOrders.value;   // [{ id: "o1", status: "draft" }]
canPlaceOrder.value;   // true

filter.update("paid");
visibleOrders.value;   // []  — recomputed: filter changed
```

### Isolate atom state per SSR request (Next.js / Express)

Reach for this when multiple concurrent server requests must never see each other's atom values — auth context, request locale, draft state.

```ts
// state.ts — module-level template atoms (never mutated on the server)
import { createAtom } from "@mongez/atom";

export const userAtom   = createAtom({ key: "user",   default: { name: "Anon", loggedIn: false } });
export const localeAtom = createAtom({ key: "locale", default: "en" });
```

```ts
// server.ts — one store per request
import { createAtomStore } from "@mongez/atom";
import { userAtom, localeAtom } from "./state";

app.get("/dashboard", async (req, res) => {
  const store = createAtomStore();

  try {
    store.use(userAtom).update({ name: req.user.name, loggedIn: true });
    store.use(localeAtom).update(req.headers["accept-language"]?.slice(0, 2) ?? "en");

    const html     = renderApp(store);
    const snapshot = store.snapshot();
    // Embed snapshot in HTML so <AtomStoreProvider initialValues={...}> on
    // the client can pick up where the server left off.
    res.send(buildHtml(html, snapshot));
  } finally {
    // Releases scoped clones' event-bus subscriptions; failing to call this
    // creates a per-request listener leak that grows with traffic.
    store.destroy();
  }
});
```

### Wrap an async backend (IndexedDB, `@mongez/cache`)

Reach for this when localStorage is too small (5 MB cap) or too synchronous — large drafts, image blobs, queryable indexes.

```ts
import { createAtom, type PersistAdapter } from "@mongez/atom";

// Any async store works — the engine awaits the Promise and applies the
// value via silentUpdate when it resolves.
const idbAdapter: PersistAdapter = {
  async get(key)   { return await idb.get(key); },
  async set(k, v)  { await idb.set(k, v); },
  async remove(k)  { await idb.delete(k); },
};

const draftAtom = createAtom({
  key: "post.draft",
  default: { title: "", body: "", attachments: [] as string[] },
  persist: idbAdapter,
});

// First render shows the default; once the IDB read resolves, the value
// flips in via silentUpdate. In React (via @mongez/react-atom), the
// component re-renders once the snapshot changes.
draftAtom.merge({ title: "Draft post" });
```

### Mirror a derived value into another atom via `onChange`

Reach for this when you need a side-effect tied to another atom (analytics, URL sync, devtools logging) — `derive` is for pure values, `onChange` is for effects.

```ts
import { createAtom } from "@mongez/atom";

const inputAtom = createAtom({ key: "search.input", default: "" });
const slugAtom  = createAtom({ key: "search.slug",  default: "" });

const sub = inputAtom.onChange(next => {
  // Why: keep the URL slug in sync with the user's typing.
  slugAtom.update(next.toLowerCase().trim().replace(/\s+/g, "-"));
});

inputAtom.update("Hello World");
slugAtom.value;     // "hello-world"

sub.unsubscribe(); // stop mirroring
```

### A throwaway scratch atom

Reach for this when you need ephemeral state but don't want to invent a long-lived key.

```ts
import { createAtom } from "@mongez/atom";

const scratch = createAtom({
  key: `scratch.${crypto.randomUUID()}`,
  default: { x: 0, y: 0 },
});

scratch.merge({ x: 10 });
// Clean up so the registry doesn't grow without bound.
scratch.destroy();
```

> The registry is process-wide. For long-lived ad-hoc atoms, give them a deterministic, namespaced key instead so two callers can reach the same atom.

### Wire DevTools with HMR-safe teardown

Reach for this when you want a Redux DevTools timeline in dev without leaking subscriptions across hot reloads.

```ts
import { enableAtomDevtools } from "@mongez/atom";

let teardownDevtools: (() => void) | undefined;

if (process.env.NODE_ENV !== "production") {
  teardownDevtools = enableAtomDevtools({
    name: "MyApp",
    ignore: [/^mouse\./, /^scroll\./, /^perf\./],
  });
}

// Vite HMR
if ((import.meta as any).hot) {
  (import.meta as any).hot.dispose(() => teardownDevtools?.());
}
```

The extension is detected at call time — `enableAtomDevtools` returns a no-op teardown when the extension isn't installed, so the same code is safe in CI / preview / production builds.

---

## TypeScript

```ts
import type {
  Atom,
  AtomOptions,
  AtomActions,
  AtomChangeCallback,
  AtomCollectionActions,
  AtomPartialChangeCallback,
  AtomValue,
  BaseAtom,
  CollectionOptions,
  CreateAtomOptions,
  DeriveGetter,
  DeriveOptions,
  EnableDevtoolsOptions,
  IsObjectValue,
  ObjectAtom,
  PersistAdapter,
  PersistOption,
} from "@mongez/atom";
```

Notes:

- `Atom<V, A>` is a conditional type — `BaseAtom<V, A> & (IsObjectValue<V> extends true ? ObjectAtom<V> : {}) & A`. Object-only methods only exist when `V` is an object/array.
- `AtomActions<V>` no longer collapses to `any` (a v1-era index-signature bug). Per-action types are preserved.
- `AtomOptions.default: V` must be a complete value. `Partial<V>` is rejected at the type level.
- See [`MIGRATION.md`](./MIGRATION.md) for the full 1.x → 2.0 transition.

---

## Related packages

| Package | Use when you need |
|---|---|
| [`@mongez/react-atom`](https://github.com/hassanzohdy/mongez-react-atom) | React hooks (`useValue`, `useState`, `use(key)`, `useWatch`), `<AtomStoreProvider>`, SSR hydration helpers. |
| [`@mongez/atomic-query`](https://github.com/hassanzohdy/mongez-atomic-query) | Server-state cache built on atoms: `useQuery`, `useMutation`, `useInfiniteQuery`, `useSuspenseQuery`. |
| [`@mongez/cache`](https://github.com/hassanzohdy/mongez-cache) | Pluggable cache (localStorage / sessionStorage / encrypted / in-memory) — its driver shape matches `PersistAdapter`. |
| [`@mongez/events`](https://github.com/hassanzohdy/events) | Tiny event bus. Used internally for the `atoms.${key}.*` namespace. |

---

## Further reading

- [`MIGRATION.md`](./MIGRATION.md) — 1.x → 2.0 breaking changes and the migration steps.
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes and documented quirks.
- [`llms-full.txt`](./llms-full.txt) — exhaustive single-file API surface for tool-assisted development.
- [`skills/`](./skills) — per-topic deep-dives (atoms, collections, derived, persist, stores, devtools, actions, recipes).

---

## License

MIT — see [LICENSE](./LICENSE).
