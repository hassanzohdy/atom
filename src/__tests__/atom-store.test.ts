import { afterEach, describe, expect, it } from "vitest";
import { atoms, createAtom, getAtom } from "../atom";
import { createAtomStore } from "../atom-store";

afterEach(() => {
  for (const key of Object.keys(atoms)) {
    atoms[key].destroy();
  }
});

describe("AtomStore", () => {
  it("use(template) returns a scoped clone, keyed by the original key", () => {
    const userAtom = createAtom({ key: "store.user", default: { name: "Alice" } });
    const store = createAtomStore();
    const scoped = store.use(userAtom);
    expect(scoped).not.toBe(userAtom);
    expect(store.get("store.user")).toBe(scoped);
  });

  it("use(template) is idempotent for the same template", () => {
    const userAtom = createAtom({ key: "store.user.idem", default: { name: "Alice" } });
    const store = createAtomStore();
    const a = store.use(userAtom);
    const b = store.use(userAtom);
    expect(a).toBe(b);
  });

  it("clones do not pollute the global registry", () => {
    const userAtom = createAtom({ key: "store.user.iso", default: { name: "Alice" } });
    const store = createAtomStore();
    const scoped = store.use(userAtom);
    expect(getAtom(scoped.key)).toBeUndefined();
  });

  it("two stores hold INDEPENDENT state", () => {
    const userAtom = createAtom({ key: "store.user.split", default: { name: "Alice" } });
    const a = createAtomStore();
    const b = createAtomStore();
    a.use(userAtom).change("name", "A");
    b.use(userAtom).change("name", "B");
    expect(a.get("store.user.split")?.value).toEqual({ name: "A" });
    expect(b.get("store.user.split")?.value).toEqual({ name: "B" });
    expect(userAtom.value).toEqual({ name: "Alice" });
  });

  it("hydrate applies initial values to already-registered atoms", () => {
    const userAtom = createAtom({ key: "store.user.hydrate", default: { name: "Alice" } });
    const store = createAtomStore();
    store.use(userAtom);
    store.hydrate({ "store.user.hydrate": { name: "Hydrated" } });
    expect(store.get("store.user.hydrate")?.value).toEqual({ name: "Hydrated" });
  });

  it("hydrate queues values for atoms not yet registered, then applies them on first use", () => {
    const userAtom = createAtom({ key: "store.user.queue", default: { name: "Alice" } });
    const store = createAtomStore();
    store.hydrate({ "store.user.queue": { name: "Queued" } });
    expect(store.has("store.user.queue")).toBe(false);
    const scoped = store.use(userAtom);
    expect(scoped.value).toEqual({ name: "Queued" });
  });

  it("snapshot returns the current values of every scoped atom", () => {
    const a = createAtom({ key: "store.snap.a", default: 1 });
    const b = createAtom({ key: "store.snap.b", default: { x: 2 } });
    const store = createAtomStore();
    store.use(a).update(99);
    store.use(b).change("x" as any, 100);
    expect(store.snapshot()).toEqual({
      "store.snap.a": 99,
      "store.snap.b": { x: 100 },
    });
  });

  it("destroy releases scoped atoms", () => {
    const a = createAtom({ key: "store.destroy", default: 1 });
    const store = createAtomStore();
    store.use(a);
    store.destroy();
    expect(store.has("store.destroy")).toBe(false);
    expect(store.list()).toHaveLength(0);
  });

  it("changes inside a store do not bleed to the template", () => {
    const counter = createAtom({ key: "store.no-bleed", default: 0 });
    const store = createAtomStore();
    store.use(counter).update(42);
    expect(counter.value).toBe(0);
  });
});
