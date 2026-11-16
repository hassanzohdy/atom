# Changelog — @mongez/atom

## [7.0.1] — 2026-11-16

### Fixed

- The atom registry is a null-prototype object, so atoms keyed `__proto__` or `constructor` register and resolve like any other key.

### Changed

- `getAtom("toString")`, `getAtom("constructor")` and other inherited names return `undefined` instead of `Object.prototype` members.
- `atoms` and `atomsObject()` no longer inherit `Object.prototype` methods: call `Object.hasOwn(atoms, key)` or `key in atoms` instead of `atoms.hasOwnProperty(key)`, and avoid `String(atoms)`. `Object.keys`, `Object.values`, `Object.entries`, `for…in` and `JSON.stringify` work as before.

## [7.0.0] — 2026-09-30

SSR/CSR correctness fixes. `@mongez/atom` itself stays backward compatible (new options default to the old behavior); the major bump keeps it in lockstep with `@mongez/react-atom` 7, which opts into the new options and carries the breaking changes.

### Breaking changes

- **`@mongez/react-atom` 7 requires `@mongez/atom` `^7.0.0`.** It relies on `hydratePersisted()`, `store.serverSnapshot()`, `clone({ seed })` and `register: false`, which only exist from this version.
- **Server rendering without a store now throws (in `@mongez/react-atom`).** The old singleton fallback, which only warned once and was silent when `NODE_ENV=production`, is gone: on a server, hooks throw unless an `<AtomStoreProvider>` is mounted.
- **`persistHydration` defaults to `"deferred"` when atoms are created through `@mongez/react-atom`.** In this package the default is unchanged (`"immediate"`).
- **`<AtomStoreProvider>` destroys its auto-created store one tick after unmount** (in `@mongez/react-atom`), not synchronously.

### Fixed

- **`AtomStore.use()` seeded new clones from the template's CURRENT value.** One stray `template.update()` on the server therefore leaked into every later request's fresh store. Store clones now start from the template's default value (or the queued hydration value). `atom.clone()` itself still copies the current value unless you pass `{ seed: "default" }`.
- **`store.use(atom)` was not idempotent.** Passing an atom that is already a scoped clone (for example `useAtom(t).useValue()` in React, where the hook receives the clone as `this`) made a clone of the clone under a different key. It now returns the store's clone of the same template. Clones of another store map to this store's clone, and local atoms are returned unchanged.
- **Key watchers ignored atoms declared with `default: null`.** Object-ness was decided once from the default, so `watch("name", …)` never fired after such an atom received an object. It is now decided per update (old or new value is an object).
- **`destroy()` on a template unsubscribed every clone of it.** It ran `unsubscribeNamespace("atoms.<key>")`, which also matches `atoms.<key>.clone.<n>.*`. It now removes only the atom's own `update`, `reset` and `delete` topics. It also removes the registry entry only when that entry is the atom being destroyed, so destroying a `register: false` atom no longer evicts a registered atom with the same key.

### Added

- **`clone({ seed: "current" | "default" })`** (`CloneAtomOptions`). `"default"` copies the default value instead of the current one.
- **`register: false` on `AtomOptions`** (and on `atomCollection`). Creates a "local" atom outside the global `atoms` registry. `isLocalAtom(atom)` and `getAtomOrigin(clone)` expose the bookkeeping. Give each local atom a unique key: events still travel on the shared `atoms.<key>.*` bus.
- **`persistHydration: "immediate" | "deferred"`** and **`atom.hydratePersisted()`**. `"deferred"` skips the storage read at creation; `hydratePersisted()` reads the adapter once and applies the value with `update()` so subscribers re-render. An update or reset before it wins. Default stays `"immediate"`.
- **`store.serverSnapshot(scoped)`**. The value a scoped atom renders on the first pass of a server-rendered tree, frozen at the first read; `hydrate()` re-seeds it and `destroy()` drops it. `@mongez/react-atom` uses it as React's `getServerSnapshot`.
- **`"sideEffects": false`** in `package.json` so bundlers can tree-shake unused exports.

### Types

- **`atomCollection` typing conflict fixed (type-only, no runtime change).** `AtomCollectionActions` extended the `AtomActions` index signature (every member a function) while declaring `length: number`, which `tsc` rejects (TS2411 on the interface, TS2322 in `atomCollection`). `length` now lives on the new exported `AtomCollection<Value>` type, `Atom<Value[], AtomCollectionActions<Value>> & { readonly length: number }`, which is what `atomCollection()` returns. `todos.length` is still typed `number`; the accessor at runtime is unchanged. `AtomActions` is left untouched, so atoms typed with the default `AtomActions` keep their exact typing.

### Notes

- New members on the `Atom` type: `hydratePersisted`.
- New exported type: `AtomCollection`. `AtomCollectionActions` no longer declares `length` (see Types).

## [6.0.9] — 2026-05-27

### Fixed

- **Watcher leak / wrong-removal in `atom.watch(key, cb)`**. The unsubscribe captured an index from the subscription site, and that index drifted as earlier callbacks unsubscribed — splicing the wrong (or out-of-range) callback. Unsubscribe is now identity-based: it removes the callback by reference.
- **Watcher diff used the raw `newValue` argument**. When callers passed an updater function to `update(...)`, the watcher comparison ran `get(newValue, key)` on the function itself, so every watcher fired (or none did) regardless of what changed. Now uses the resolved `updatedValue`.
- **`reset()` returned dead code**. The function assigned `const update = this.update(...)` (returns `void`) and then `return update`. The local was always `undefined`. Removed.
- **`reset()` didn't deep-clone the default**. After the first `update` that mutated `currentValue`, subsequent `reset()` calls handed callers a reference into shared default state. Now clones via `@mongez/reinforcements`' `clone`.
- **`clone()` collisions on heavy use**. The 4-digit `Random.int(1000, 9999)` suffix collided in birthday-paradox territory after a few thousand clones. Replaced with a monotonic counter (`.clone.1`, `.clone.2`, …).
- **`get(key)` auto-bound any function-valued property**. Every function has a `.bind`, so the implementation rebound *every* function returned from `get()` to `this.currentValue`. That broke pre-bound methods and generated a new function identity per read. Removed entirely.
- **`change` / `silentChange` on primitive atoms silently corrupted state**. Calling `atom.change("foo", "bar")` on a `boolean` atom spread the primitive (`{...true, foo: "bar"}` → `{foo: "bar"}`) and replaced the boolean with an object. Now a compile error at the type level (see "Changed").
- **Getter-based actions crashed `createAtom`**. `Object.keys(actions).forEach(k => actions[k].bind(atom))` invoked any getter eagerly; if the getter referenced `this.value` (which wasn't on the atom yet) it returned `undefined`, and `.bind` blew up. The action installer now uses `Object.getOwnPropertyDescriptor` and forwards getters as getters.

### Added

- **`derive(key, get => …)`** — derived atoms with auto-tracked dependencies. The compute function runs eagerly on creation and on every dependency change. Dynamic dependency graphs are supported (conditional reads add/drop deps across runs). Errors inside `compute` are surfaced asynchronously without breaking the source atom's update cycle.
- **`persist: true | PersistAdapter`** — atom-level persistence. `true` uses the built-in localStorage adapter (no-ops on the server); a `PersistAdapter` object lets you plug in cookies, IndexedDB, `@mongez/cache`, etc. The adapter is called for the initial read (sync or async), every update writes through, and `reset()` removes the entry. Sync errors and async rejections from the adapter are swallowed — a transient storage error (quota, private-mode block) never crashes the atom.
- **`AtomStore` + `createAtomStore`**. Per-request isolation primitive for SSR. Each store holds scoped clones of atom templates, exposes `use(template)`, `get(key)`, `hydrate(snapshot)`, `snapshot()`, and `destroy()`. The React-side glue (`AtomStoreProvider`, `useAtom`, `useAtomStore`) lives in `@mongez/react-atom`.
- **`clone({ register: false })` option**. Lets the store create scoped clones without polluting the module-level `atoms` registry.
- **`enableAtomDevtools(options?)`**. Redux DevTools bridge with initial-snapshot, per-update timeline entries, `JUMP_TO_STATE` / `JUMP_TO_ACTION` time-travel via `silentUpdate`, ignore-patterns, configurable scan interval for late-registered atoms.
- **AI kit**. `llms.txt`, `llms-full.txt`, and `skills/` folder (`README`, `overview`, `atoms`, `collections`, `stores`, `actions`, `devtools`, `recipes`) for tool-assisted development.
- **Test suite**. 52 unit tests across `atom`, `atom-collection`, `atom-store`, and `devtools`.
- **CI**. GitHub Actions workflow: Node 18/20/22 × Ubuntu, plus Node 20 × Windows.

### Changed

- **`Atom<V, A>` is now a conditional type**. Object-only methods (`merge`, `change`, `silentChange`, `get(key)`, `watch(key, cb)`) are removed from the type when `V` is a primitive. `Atom<boolean>.change(...)` is a compile error. `Atom<any>` keeps both surfaces (legacy permissive default).
- **`AtomActions<V>` no longer includes `| any`**. Was `[key: string]: (...) => any | any`. The `| any` collapsed the entire type to `any` and defeated per-action type safety. Now just `(this: Atom<V>, ...args: any[]) => any`.
- **`AtomOptions.default` is `V`, not `V | Partial<V>`**. `Partial<V>` accidentally allowed incomplete defaults that the type didn't reflect at runtime.
- **`change` / `silentChange` signatures are `(key: T, newValue: V[T])`**, not `(key, newValue: any)`. The wider `any` defeated type safety for known-shape atoms.
- **`clone()` accepts `{ register?: boolean }`**. Pure addition for stores; existing callers (`atom.clone()`) keep working.

### Removed

- **Auto-`bind` in `atom.get(key)`**. Functions returned from `get()` are no longer rebound to `currentValue`. If your code relied on this, wrap the call: `atom.get("fn")?.bind(atom.value)`.
- **Random-suffix clone keys** (`...Cloned9123`). Replaced by deterministic counter (`...clone.1`, `...clone.2`).

### Dependency bumps

- **`@mongez/reinforcements: ^2.3.10` → `^3.1.0`**. Compatible API for the surfaces atom uses (`clone`, `get`). See [reinforcements v3 MIGRATION](../reinforcements/MIGRATION.md) for the full diff.

### Tests

```
46 + 6 devtools + 7 derive + 12 persist = 71 passing
```
