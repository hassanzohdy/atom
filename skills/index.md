---
description: "Framework-agnostic state atoms: a typed value bundled with bound action methods, plus derived values, persistence and per-request SSR isolation. Exports `createAtom`, `atomCollection`, `derive`, `createAtomStore`, `AtomStore`, `getAtom`, `atomsList`, `attachPersist`, `localStorageAdapter`, `enableAtomDevtools`. Use for: \"global state without Redux\", \"store with actions like cart.push()\", \"computed value from other atoms\", \"persist state to localStorage\", \"isolate state per SSR request\", \"time-travel debugging\". Not this package: React hooks such as `useValue`, `useState`, `AtomStoreProvider`, `openAtom`, `loadingAtom` → @mongez/react-atom."
---
# @mongez/atom

An atom is a value with action methods bound to it: call domain verbs (`cart.push(item)`, `sidebar.toggle()`) instead of scattering setters. It works in any JS runtime and has no React dependency. Derived atoms track their reads automatically; persistence and devtools are opt-in.

## The 80% path
1. Orient with `overview.md`, then create atoms with `defining-atoms.md` (deeper: `atoms.md`, `actions.md`).
2. Lists of items with add/remove helpers: `collections.md`.
3. Computed values: `derived.md` (or `derived-atoms.md`).
4. Keep state across reloads: `persistence.md` (or `persist.md`) for adapters, including cookies and async stores.
5. Server rendering: `stores.md` (or `atom-store.md`) so each request gets its own atoms.
6. Debugging: `devtools.md`; worked examples: `recipes.md`.

## Conventions and pitfalls
- Some topics come in pairs (`derived`/`derived-atoms`, `persistence`/`persist`, `stores`/`atom-store`); they cover the same ground, so read one.
- Atoms are registered by key. Reusing a key overwrites the registry entry of the existing atom, so keep keys unique.
- Module-level atoms are shared across requests on the server. Use an `AtomStore` for anything request-specific. A store clone starts from the template's default value, never from its current value.
- `atom({ register: false })` makes a local atom that stays out of the global registry; give each instance a unique key.
- The built-in `localStorageAdapter` (`persist: true`) uses `window.localStorage` only, so it does nothing on the server; use a custom adapter (cookie) when the server needs the value. Set `persistHydration: "deferred"` so the stored value is applied after hydration instead of at creation.
- Prefer named actions over mutating `atom.value` from outside.
- Using atoms in components? Switch to @mongez/react-atom, whose `atom` and `atomCollection` come with hooks attached.
