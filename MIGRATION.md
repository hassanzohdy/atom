# Migration — @mongez/atom

## 1.x → 2.0 (upcoming)

A correctness pass with a small number of TypeScript-level breaks and one runtime change. Most consumer code keeps working. The full list of fixes is in [`CHANGELOG.md`](./CHANGELOG.md); this file covers the cases where you have to do something.

### TypeScript-level breaks

#### `Atom<V>` now strips object-only methods on primitives

`change`, `silentChange`, `merge`, `get(key)`, `watch(key, cb)` are no longer present on the type when `V` is a primitive. They were always nonsense at runtime (`{...true, foo: "bar"}` silently corrupted booleans into objects).

```diff
-const flag = createAtom({ key: "flag", default: false });
-flag.change("foo" as any, "bar");      // compiled — silently corrupted state
+const flag = createAtom({ key: "flag", default: false });
+flag.change("foo", "bar");             // TS error — change isn't on Atom<boolean>
```

Migration: if you have code that calls `change`/`merge`/`watch` on a primitive atom, either change the atom's value type to an object or use `update(prev => …)` instead.

#### `AtomActions<V>` no longer collapses to `any`

The old index signature was `[key: string]: ((this: Atom<V>, ...args: any[]) => any) | any` — the trailing `| any` made the whole type widen to `any`, so per-action type safety was lost.

If your codebase had typed action objects that secretly relied on the widening to compile, you may see new errors. Tighten the actions or `as any` at the call site.

#### `AtomOptions.default` is now `V` (not `V | Partial<V>`)

```diff
-createAtom<User>({ key: "user", default: { name: "Anon" } as Partial<User> });
+createAtom<User>({ key: "user", default: { name: "Anon", age: 0 } });
```

Provide a complete default, or widen the value type to allow partial.

#### `change` / `silentChange` parameters are `(key: T, newValue: V[T])`

Was `(key: T, newValue: any)`. Stricter types may surface real bugs where you were assigning the wrong shape to a key.

### Runtime breaks

#### `atom.get(key)` no longer auto-binds returned functions

The old implementation rebound every function returned from `get()` to `this.currentValue`. This broke pre-bound methods and produced a new function identity on every read, causing extra re-renders downstream.

```diff
-const fn = userAtom.get("greet"); // was bound to userAtom.value
+const fn = userAtom.get("greet"); // returned as-is
+// If you need binding, do it yourself:
+const fn = userAtom.get("greet")?.bind(userAtom.value);
```

#### Clone keys are deterministic counter, not random

Random 4-digit suffixes (`...Cloned9123`) collided after a few thousand clones. The new format is `${key}.clone.1`, `${key}.clone.2`, etc.

If you had code matching the old key format with a regex, update it.

### Dependency bumps

`@mongez/reinforcements` is now `^3.1.0`. See [reinforcements' MIGRATION.md](../reinforcements/MIGRATION.md) — the relevant change for atom consumers is that `get` now returns falsy values directly (instead of falling back to the default), and `clone` is non-mutating.

### New features (no migration needed, but worth knowing)

| Feature | Where | Notes |
|---|---|---|
| `AtomStore` + `createAtomStore` | `@mongez/atom` | Per-request isolation for SSR. The React wiring lives in `@mongez/react-atom`. |
| `derive(key, get => …)` | `@mongez/atom` | Auto-tracked computed atoms with dynamic dependency graphs. |
| `persist: true \| PersistAdapter` | `AtomOptions` | Persist atom values to localStorage or any adapter you provide. |
| `enableAtomDevtools()` | `@mongez/atom` | Redux DevTools bridge with time-travel. Tree-shaken when unused. |

### Quick before / after

**Before:**
```ts
const userAtom = createAtom({
  key: "user",
  default: { name: "Anon" },
});

// Pre-fixes: change on a primitive was silently allowed and broken;
// Clone keys collided; get auto-bound functions; AtomActions widened
// to any.
```

**After:**
```ts
import {
  createAtom,
  derive,
  createAtomStore,
  enableAtomDevtools,
  type PersistAdapter,
} from "@mongez/atom";

const userAtom = createAtom({
  key: "user",
  default: { name: "Anon" } as const,
  persist: true,             // localStorage by default
});

const userNameAtom = derive("user.name", get => get(userAtom).name);

const store = createAtomStore();
// Per-request scoping; see @mongez/react-atom for hooks.

if (process.env.NODE_ENV !== "production") {
  enableAtomDevtools({ name: "MyApp" });
}
```
