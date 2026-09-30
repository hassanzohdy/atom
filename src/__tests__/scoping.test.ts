/**
 * SSR/CSR scoping fixes.
 *
 * Covers: default-seeded clones, idempotent `store.use`, per-update watcher
 * object-ness, key-exact destroy, `register: false` local atoms, server
 * snapshots, and deferred persist hydration.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  atoms,
  createAtom,
  getAtom,
  getAtomOrigin,
  isLocalAtom,
} from "../atom";
import { AtomStore, createAtomStore } from "../atom-store";
import type { PersistAdapter } from "../persist";

afterEach(() => {
  for (const key of Object.keys(atoms)) atoms[key].destroy();
});

function memoryAdapter(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  const adapter: PersistAdapter & { store: Record<string, unknown> } = {
    store,
    get: key => store[key],
    set: (key, value) => {
      store[key] = value;
    },
    remove: key => {
      delete store[key];
    },
  };
  return adapter;
}

describe("clone seeding", () => {
  it("clone() copies the current value by default (unchanged)", () => {
    const a = createAtom({ key: "seed.current", default: { n: 0 } });
    a.update({ n: 5 });

    expect(a.clone({ register: false }).value).toEqual({ n: 5 });
  });

  it("clone({ seed: 'default' }) ignores updates made to the source", () => {
    const a = createAtom({ key: "seed.default", default: { n: 0 } });
    a.update({ n: 5 });

    const clone = a.clone({ register: false, seed: "default" });

    expect(clone.value).toEqual({ n: 0 });
    // The clone's own default is the template default, so reset() is safe.
    clone.update({ n: 9 });
    clone.reset();
    expect(clone.value).toEqual({ n: 0 });
  });

  it("a store never seeds from a polluted template", () => {
    const form = createAtom({ key: "seed.store", default: { name: "" } });
    form.update({ name: "LEAKED" });

    const store = createAtomStore();

    expect(store.use(form).value).toEqual({ name: "" });
    expect(form.value).toEqual({ name: "LEAKED" });
  });

  it("a store still applies queued hydration values over the default", () => {
    const form = createAtom({ key: "seed.hydrate", default: { name: "" } });
    form.update({ name: "LEAKED" });

    const store = createAtomStore();
    store.hydrate({ "seed.hydrate": { name: "Alice" } });

    expect(store.use(form).value).toEqual({ name: "Alice" });
  });
});

describe("AtomStore.use is idempotent for scoped clones", () => {
  it("returns the same clone when handed a clone of this store", () => {
    const form = createAtom({ key: "idem.same", default: { n: 0 } });
    const store = createAtomStore();

    const scoped = store.use(form);

    expect(store.use(scoped)).toBe(scoped);
    expect(store.list()).toHaveLength(1);
    expect(getAtomOrigin(scoped)).toBe(form);
  });

  it("maps a clone of another store to this store's own clone", () => {
    const form = createAtom({ key: "idem.other", default: { n: 0 } });
    const storeA = createAtomStore();
    const storeB = createAtomStore();

    const inA = storeA.use(form);
    inA.update({ n: 1 });
    const inB = storeB.use(inA);

    expect(inB).not.toBe(inA);
    expect(inB.value).toEqual({ n: 0 });
    expect(storeB.get("idem.other")).toBe(inB);
    expect(storeB.list()).toHaveLength(1);
  });

  it("clones of clones still point at the root template", () => {
    const form = createAtom({ key: "idem.root", default: 0 });
    const clone = form.clone({ register: false });

    expect(getAtomOrigin(clone.clone({ register: false }))).toBe(form);
  });

  it("returns local atoms unchanged", () => {
    const local = createAtom({
      key: "idem.local",
      default: 0,
      register: false,
    });
    const store = createAtomStore();

    expect(store.use(local)).toBe(local);
    expect(store.list()).toHaveLength(0);
  });

  it("a destroyed store forgets its clones and re-clones from the default", () => {
    const form = createAtom({ key: "idem.destroy", default: { n: 0 } });
    const store = createAtomStore();
    const scoped = store.use(form);
    scoped.update({ n: 4 });
    store.destroy();

    const fresh = store.use(scoped);

    expect(fresh).not.toBe(scoped);
    expect(fresh.value).toEqual({ n: 0 });
  });
});

describe("serverSnapshot", () => {
  it("freezes the value of the first read, however the atom changes after", () => {
    const form = createAtom({ key: "snap.freeze", default: { n: 0 } });
    const store = createAtomStore();
    const scoped = store.use(form);

    store.hydrate({ "snap.freeze": { n: 1 } });
    const first = store.serverSnapshot(scoped);
    scoped.update({ n: 2 });

    expect(first).toEqual({ n: 1 });
    expect(store.serverSnapshot(scoped)).toBe(first);
    expect(scoped.value).toEqual({ n: 2 });
  });

  it("hydrate() re-seeds the frozen value", () => {
    const form = createAtom({ key: "snap.reseed", default: 0 });
    const store = createAtomStore();
    const scoped = store.use(form);
    expect(store.serverSnapshot(scoped)).toBe(0);

    store.hydrate({ "snap.reseed": 7 });

    expect(store.serverSnapshot(scoped)).toBe(7);
  });

  it("is dropped by destroy()", () => {
    const store = new AtomStore();
    const form = createAtom({ key: "snap.destroy", default: 0 });
    const scoped = store.use(form);
    store.serverSnapshot(scoped);
    store.destroy();

    const next = store.use(form);
    next.silentUpdate(3);

    expect(store.serverSnapshot(next)).toBe(3);
  });
});

describe("watchers decide object-ness per update", () => {
  it("fires key watchers for an atom declared with default null", () => {
    const field = createAtom<{ name: string } | null>({
      key: "watch.null",
      default: null,
    });
    const seen: unknown[] = [];
    (field as any).watch("name", (next: unknown) => seen.push(next));

    field.update({ name: "Ada" });
    field.update({ name: "Grace" });
    field.update(null);

    expect(seen).toEqual(["Ada", "Grace", undefined]);
  });

  it("still ignores watchers for primitive to primitive updates", () => {
    const counter = createAtom({ key: "watch.primitive", default: 0 });
    const cb = vi.fn();
    (counter as any).watch("x", cb);

    counter.update(1);

    expect(cb).not.toHaveBeenCalled();
  });
});

describe("destroy is key-exact", () => {
  it("destroying a template does not unsubscribe its clones", () => {
    const template = createAtom({ key: "destroy.exact", default: 0 });
    const clone = template.clone({ register: false });
    const cb = vi.fn();
    clone.onChange(cb);

    template.destroy();
    clone.update(1);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("destroying a clone does not touch the template's subscriptions", () => {
    const template = createAtom({ key: "destroy.exact2", default: 0 });
    const clone = template.clone({ register: false });
    const cb = vi.fn();
    template.onChange(cb);

    clone.destroy();
    template.update(1);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("still removes the atom's own update, reset and delete listeners", () => {
    const a = createAtom({ key: "destroy.own", default: 0 });
    const onUpdate = vi.fn();
    const onReset = vi.fn();
    a.onChange(onUpdate);
    a.onReset(onReset);

    a.destroy();
    a.update(1);
    a.reset();

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
    expect(getAtom("destroy.own")).toBeUndefined();
  });

  it("a local atom's destroy does not evict a registered atom with the same key", () => {
    const registered = createAtom({ key: "destroy.shared", default: 0 });
    const local = createAtom({
      key: "destroy.shared",
      default: 0,
      register: false,
    });

    local.destroy();

    expect(getAtom("destroy.shared")).toBe(registered);
  });
});

describe("register: false", () => {
  it("keeps a local atom out of the registry and flags it as local", () => {
    const local = createAtom({
      key: "local.flag",
      default: 1,
      register: false,
    });

    expect(getAtom("local.flag")).toBeUndefined();
    expect(isLocalAtom(local)).toBe(true);
    expect(isLocalAtom(local.clone({ register: false }))).toBe(false);
  });

  it("the createAtom option argument wins over data.register", () => {
    const a = createAtom(
      { key: "local.override", default: 1, register: false },
      { register: true },
    );

    expect(getAtom("local.override")).toBe(a);
  });

  it("registers by default", () => {
    const a = createAtom({ key: "local.default", default: 1 });

    expect(getAtom("local.default")).toBe(a);
    expect(isLocalAtom(a)).toBe(false);
  });
});

describe("persistHydration: deferred", () => {
  it("does not read the adapter at creation", () => {
    const adapter = memoryAdapter({ "pd.a": "stored" });
    const get = vi.spyOn(adapter, "get");
    const a = createAtom({
      key: "pd.a",
      default: "default",
      persist: adapter,
      persistHydration: "deferred",
    });

    expect(a.value).toBe("default");
    expect(get).not.toHaveBeenCalled();
  });

  it("hydratePersisted() applies the stored value and notifies subscribers", () => {
    const adapter = memoryAdapter({ "pd.b": "stored" });
    const a = createAtom({
      key: "pd.b",
      default: "default",
      persist: adapter,
      persistHydration: "deferred",
    });
    const cb = vi.fn();
    a.onChange(cb);

    a.hydratePersisted();

    expect(a.value).toBe("stored");
    expect(cb).toHaveBeenCalledWith("stored", "default", a);
  });

  it("hydrates at most once", () => {
    const adapter = memoryAdapter({ "pd.c": "stored" });
    const get = vi.spyOn(adapter, "get");
    const a = createAtom({
      key: "pd.c",
      default: "default",
      persist: adapter,
      persistHydration: "deferred",
    });

    a.hydratePersisted();
    a.hydratePersisted();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("an update before hydration wins over the stored value", () => {
    const adapter = memoryAdapter({ "pd.d": "stored" });
    const a = createAtom({
      key: "pd.d",
      default: "default",
      persist: adapter,
      persistHydration: "deferred",
    });

    a.update("typed");
    a.hydratePersisted();

    expect(a.value).toBe("typed");
    expect(adapter.store["pd.d"]).toBe("typed");
  });

  it("applies async adapter results through update", async () => {
    const a = createAtom({
      key: "pd.e",
      default: "default",
      persist: {
        get: async () => "later",
        set: () => {},
        remove: () => {},
      },
      persistHydration: "deferred",
    });
    const cb = vi.fn();
    a.onChange(cb);

    await a.hydratePersisted();
    await Promise.resolve();

    expect(a.value).toBe("later");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("keeps the immediate default for plain createAtom", () => {
    const adapter = memoryAdapter({ "pd.f": "stored" });
    const a = createAtom({ key: "pd.f", default: "default", persist: adapter });

    expect(a.value).toBe("stored");
  });

  it("hydratePersisted() is a harmless no-op without a persist adapter", () => {
    const a = createAtom({ key: "pd.g", default: 1 });

    expect(() => a.hydratePersisted()).not.toThrow();
    expect(a.value).toBe(1);
  });
});
