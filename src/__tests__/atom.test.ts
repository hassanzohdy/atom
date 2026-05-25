import { afterEach, describe, expect, it, vi } from "vitest";
import { atoms, createAtom, getAtom } from "../atom";

function fresh<T>(key: string, value: T) {
  return createAtom({ key, default: value });
}

afterEach(() => {
  for (const key of Object.keys(atoms)) {
    atoms[key].destroy();
  }
});

describe("createAtom — primitives", () => {
  it("exposes default and current value", () => {
    const counter = fresh("primitives.counter", 0);
    expect(counter.value).toBe(0);
    expect(counter.defaultValue).toBe(0);
    expect(counter.type).toBe("number");
  });

  it("update() replaces value", () => {
    const counter = fresh("primitives.update", 0);
    counter.update(7);
    expect(counter.value).toBe(7);
  });

  it("update() accepts a function updater", () => {
    const counter = fresh("primitives.updater", 5);
    counter.update((prev) => prev + 1);
    expect(counter.value).toBe(6);
  });

  it("update() does not fire when value is identical by reference", () => {
    const counter = fresh("primitives.identical", 3);
    const spy = vi.fn();
    counter.onChange(spy);
    counter.update(3);
    expect(spy).not.toHaveBeenCalled();
  });

  it("reset() restores the default and fires reset event", () => {
    const counter = fresh("primitives.reset", 0);
    counter.update(99);
    const onChange = vi.fn();
    const onReset = vi.fn();
    counter.onChange(onChange);
    counter.onReset(onReset);
    counter.reset();
    expect(counter.value).toBe(0);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("silentReset() resets value and fires reset, but not change", () => {
    const counter = fresh("primitives.silentReset", 0);
    counter.update(42);
    const onChange = vi.fn();
    const onReset = vi.fn();
    counter.onChange(onChange);
    counter.onReset(onReset);
    counter.silentReset();
    expect(counter.value).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("type reflects the original value shape", () => {
    expect(fresh("type.num", 1).type).toBe("number");
    expect(fresh("type.bool", true).type).toBe("boolean");
    expect(fresh("type.str", "x").type).toBe("string");
    expect(fresh("type.arr", [1, 2]).type).toBe("array");
    expect(fresh("type.obj", { a: 1 }).type).toBe("object");
  });
});

describe("createAtom — objects", () => {
  it("clones the default so callers cannot mutate it post-hoc", () => {
    const seed = { name: "Alice" };
    const user = createAtom({ key: "obj.clone", default: seed });
    seed.name = "Mallory";
    expect(user.value.name).toBe("Alice");
  });

  it("merge() does a shallow merge", () => {
    const user = createAtom({
      key: "obj.merge",
      default: { name: "Alice", age: 20 },
    });
    user.merge({ age: 21 });
    expect(user.value).toEqual({ name: "Alice", age: 21 });
  });

  it("change() replaces a single key", () => {
    const user = createAtom({
      key: "obj.change",
      default: { name: "Alice", age: 20 },
    });
    user.change("age", 30);
    expect(user.value).toEqual({ name: "Alice", age: 30 });
  });

  it("get(key) reads a nested path", () => {
    const user = createAtom({
      key: "obj.get",
      default: { profile: { name: "Alice" } },
    });
    // dot-notation supported via @mongez/reinforcements get()
    expect(user.get("profile" as any)).toEqual({ name: "Alice" });
  });

  it("get(key) does NOT auto-bind function-valued properties", () => {
    // Regression: previously every function-valued field was rebound to
    // currentValue, which broke methods that captured their own `this`.
    const log = vi.fn();
    const ctx = { who: "outer", say(this: any) { log(this?.who); } };
    const a = createAtom({
      key: "obj.no-autobind",
      default: { fn: ctx.say } as { fn: () => void },
    });
    const got = a.get("fn") as () => void;
    got.call(ctx);
    expect(log).toHaveBeenCalledWith("outer");
  });
});

describe("watch()", () => {
  it("fires on the watched key when the value changes", () => {
    const user = createAtom({
      key: "watch.fires",
      default: { name: "Alice", age: 20 },
    });
    const spy = vi.fn();
    user.watch("age", spy);
    user.change("age", 21);
    expect(spy).toHaveBeenCalledWith(21, 20, expect.anything());
  });

  it("does not fire on a different key", () => {
    const user = createAtom({
      key: "watch.unrelated",
      default: { name: "Alice", age: 20 },
    });
    const spy = vi.fn();
    user.watch("age", spy);
    user.change("name", "Bob");
    expect(spy).not.toHaveBeenCalled();
  });

  it("REGRESSION: unsubscribe removes the right callback when others have already unsubscribed", () => {
    const user = createAtom({
      key: "watch.unsubscribe-order",
      default: { age: 0 },
    });
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    const subA = user.watch("age", a);
    const subB = user.watch("age", b);
    const subC = user.watch("age", c);

    // Unsubscribe the FIRST registered callback.
    subA.unsubscribe();
    user.change("age", 1);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);

    // Now unsubscribe the THIRD — pre-fix this spliced index 2 from a list
    // that had already shrunk to length 2, removing nothing OR clobbering b.
    subC.unsubscribe();
    user.change("age", 2);
    expect(b).toHaveBeenCalledTimes(2);
    expect(c).toHaveBeenCalledTimes(1);

    subB.unsubscribe();
    user.change("age", 3);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("REGRESSION: watcher diff reads from updated value when an updater function is used", () => {
    const user = createAtom({
      key: "watch.updater-fn",
      default: { age: 20 },
    });
    const spy = vi.fn();
    user.watch("age", spy);
    user.update((prev) => ({ ...prev, age: prev.age + 1 }));
    expect(spy).toHaveBeenCalledWith(21, 20, expect.anything());
  });
});

describe("beforeUpdate", () => {
  it("can rewrite the value", () => {
    const a = createAtom({
      key: "before.rewrite",
      default: 0,
      beforeUpdate: (next) => next * 2,
    });
    a.update(3);
    expect(a.value).toBe(6);
  });

  it("returning undefined means 'leave value as-is'", () => {
    const a = createAtom({
      key: "before.leave",
      default: 0,
      beforeUpdate: () => undefined,
    });
    a.update(7);
    expect(a.value).toBe(7);
  });

  it("REGRESSION: silentUpdate respects beforeUpdate's undefined return", () => {
    const a = createAtom({
      key: "before.silent-leave",
      default: 0,
      beforeUpdate: () => undefined,
    });
    a.silentUpdate(7);
    expect(a.value).toBe(7);
  });
});

describe("actions", () => {
  it("binds actions to the atom instance", () => {
    const counter = createAtom({
      key: "actions.binding",
      default: 0,
      actions: {
        increment(this: any) {
          this.update(this.value + 1);
        },
      },
    });
    (counter as any).increment();
    (counter as any).increment();
    expect(counter.value).toBe(2);
  });
});

describe("registry & destroy", () => {
  it("getAtom looks up by key", () => {
    const a = createAtom({ key: "registry.lookup", default: 1 });
    expect(getAtom("registry.lookup")).toBe(a);
  });

  it("destroy() removes from the registry", () => {
    const a = createAtom({ key: "registry.destroy", default: 1 });
    a.destroy();
    expect(getAtom("registry.destroy")).toBeUndefined();
  });

  it("destroy() fires onDestroy listeners", () => {
    const a = createAtom({ key: "registry.destroyFires", default: 1 });
    const spy = vi.fn();
    a.onDestroy(spy);
    a.destroy();
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("clone()", () => {
  it("creates an independent atom with a derived key", () => {
    const a = createAtom({ key: "clone.parent", default: { age: 1 } });
    const b = a.clone();
    expect(b.key).not.toBe(a.key);
    expect(b.key.startsWith("clone.parent.clone.")).toBe(true);

    b.change("age", 99);
    expect(a.value.age).toBe(1);
    expect(b.value.age).toBe(99);
  });

  it("clones carry over actions", () => {
    const counter = createAtom({
      key: "clone.actions",
      default: 0,
      actions: {
        bump(this: any) {
          this.update(this.value + 1);
        },
      },
    });
    const copy = counter.clone();
    (copy as any).bump();
    expect(copy.value).toBe(1);
    expect(counter.value).toBe(0);
  });

  it("clone({ register: false }) skips the global registry", () => {
    const a = createAtom({ key: "clone.skip-reg", default: 0 });
    const b = a.clone({ register: false });
    expect(getAtom(b.key)).toBeUndefined();
    // Original is still registered.
    expect(getAtom(a.key)).toBe(a);
  });
});
