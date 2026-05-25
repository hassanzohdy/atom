---
name: mongez-atom-recipes
description: Idiomatic composition recipes for @mongez/atom covering boolean toggles, cart totals, derived watch patterns, SSR hydration, DevTools teardown, and scratch atoms.
when_to_use: |
  - User asks for a real-world example or pattern combining multiple @mongez/atom features
  - User asks how to wire SSR snapshot serialization and client-side hydration end-to-end
  - User asks for a complete cart or todo example using atomCollection with computed totals
  - User asks how to clean up enableAtomDevtools on HMR (Vite or Webpack hot reload)
  - User asks about using onChange to derive state into a second atom as a side-effect
---

# Recipes

Idiomatic compositions across `@mongez/atom` features.

## A boolean toggle with verbs

```ts
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
```

## A cart with computed totals

```ts
type Item = { id: string; price: number; qty: number };

const cart = atomCollection<Item>({
  key: "cart",
  actions: {
    get total() {
      return this.value.reduce((s, i) => s + i.price * i.qty, 0);
    },
    setQty(this: Atom<Item[]>, id: string, qty: number) {
      this.update(this.value.map(i => i.id === id ? { ...i, qty } : i));
    },
  },
});

cart.push({ id: "a", price: 10, qty: 2 });
cart.push({ id: "b", price: 5, qty: 1 });
cart.total;  // 25
cart.setQty("a", 3);
cart.total;  // 35
```

## Derived state via `watch`

The poor-man's derived atom until first-class `derive` lands. Watch a key and write the derived value into another atom.

```ts
const inputAtom = createAtom({ key: "search.input", default: "" });
const querySlugAtom = createAtom({ key: "search.slug", default: "" });

inputAtom.onChange(next => {
  querySlugAtom.update(next.toLowerCase().trim().replace(/\s+/g, "-"));
});
```

## SSR snapshot + hydrate

```ts
// Server
const store = createAtomStore();
store.use(userAtom).update({ name: "Alice" });
const html = renderToString(<App store={store} />);
const payload = JSON.stringify(store.snapshot());
res.send(/* html with payload embedded as <script> */);
store.destroy();
```

```ts
// Client
const incoming = JSON.parse(document.getElementById("__atoms")!.textContent!);
const store = createAtomStore();
store.hydrate(incoming);
// Mount the React tree with this store via AtomStoreProvider.
```

## Devtools in dev only

```ts
let teardownDevtools: (() => void) | undefined;
if (process.env.NODE_ENV !== "production") {
  teardownDevtools = enableAtomDevtools({
    name: "MyApp",
    ignore: [/^mouse\./, /^perf\./],
  });
}

// HMR cleanup (Vite / Webpack)
if ((import.meta as any).hot) {
  (import.meta as any).hot.dispose(() => teardownDevtools?.());
}
```

## A throwaway scratch atom

If you need state but don't care about the key:

```ts
const scratch = createAtom({
  key: `scratch.${Math.random()}`,
  default: { x: 0, y: 0 },
});
// Clean up before forgetting about it:
scratch.destroy();
```

For long-lived ad-hoc atoms, give them a deterministic key — the registry is shared per process.
