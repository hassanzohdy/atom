/**
 * Derived-atom tests.
 *
 * What we're proving:
 *   - Initial computation runs eagerly with auto-tracked deps.
 *   - When ANY dep changes, the derived atom recomputes and notifies.
 *   - Conditional reads correctly add/drop deps across runs (dynamic graph).
 *   - Chained derivations propagate.
 *   - `onChange` on the derived atom only fires when the computed value
 *     actually changes (object reference produces a new ref each run; the
 *     atom's `update()` doesn't short-circuit on reference equality but
 *     the subscribers can de-dup themselves).
 *   - Destroying the derived atom unsubscribes from its deps.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAtom, atoms } from "../atom";
import { derive } from "../derive";

afterEach(() => {
  for (const key of Object.keys(atoms)) atoms[key].destroy();
});

describe("derive", () => {
  it("computes the initial value eagerly", () => {
    const a = createAtom({ key: "d.a", default: 2 });
    const b = createAtom({ key: "d.b", default: 3 });
    const sum = derive("d.sum", get => get(a) + get(b));
    expect(sum.value).toBe(5);
  });

  it("recomputes when a dependency changes", () => {
    const a = createAtom({ key: "d.a", default: 2 });
    const b = createAtom({ key: "d.b", default: 3 });
    const sum = derive("d.sum", get => get(a) + get(b));

    a.update(10);
    expect(sum.value).toBe(13);

    b.update(20);
    expect(sum.value).toBe(30);
  });

  it("notifies onChange subscribers of the derived atom", () => {
    const a = createAtom({ key: "d.a", default: 1 });
    const doubled = derive("d.doubled", get => get(a) * 2);

    const cb = vi.fn();
    doubled.onChange(cb);

    a.update(5);
    expect(cb).toHaveBeenCalledWith(10, 2, doubled);
  });

  it("handles dynamic dependency graphs (conditional reads)", () => {
    const branch = createAtom({ key: "d.branch", default: "a" as "a" | "b" });
    const a = createAtom({ key: "d.av", default: "from-a" });
    const b = createAtom({ key: "d.bv", default: "from-b" });

    const selected = derive("d.selected", get =>
      get(branch) === "a" ? get(a) : get(b),
    );

    expect(selected.value).toBe("from-a");

    // Update b — selected shouldn't change because b isn't currently a dep.
    b.update("from-b-changed");
    expect(selected.value).toBe("from-a");

    // Switch branch — now selected reads from b.
    branch.update("b");
    expect(selected.value).toBe("from-b-changed");

    // Updating a now should NOT recompute (a is no longer a dep).
    a.update("from-a-changed");
    expect(selected.value).toBe("from-b-changed");

    // But b SHOULD still be tracked.
    b.update("from-b-again");
    expect(selected.value).toBe("from-b-again");
  });

  it("chained derivations propagate", () => {
    const a = createAtom({ key: "d.a", default: 2 });
    const doubled = derive("d.doubled", get => get(a) * 2);
    const quadrupled = derive("d.quadrupled", get => get(doubled) * 2);

    expect(quadrupled.value).toBe(8);

    a.update(5);
    expect(doubled.value).toBe(10);
    expect(quadrupled.value).toBe(20);
  });

  it("destroying the derived atom unsubscribes from deps", () => {
    const a = createAtom({ key: "d.a", default: 1 });
    const doubled = derive("d.doubled", get => get(a) * 2);

    const recomputeSpy = vi.fn();
    doubled.onChange(recomputeSpy);

    a.update(3);
    expect(recomputeSpy).toHaveBeenCalledTimes(1);

    doubled.destroy();

    // Further changes to `a` should NOT cause work on the destroyed atom.
    a.update(7);
    expect(recomputeSpy).toHaveBeenCalledTimes(1);
  });

  it("a thrown error inside compute does not kill the source atom's update", async () => {
    const a = createAtom({ key: "d.a", default: 1 });
    const errors: unknown[] = [];
    // Catch the async re-thrown error so vitest doesn't fail the test.
    const handler = (e: ErrorEvent | PromiseRejectionEvent) => {
      // happy-dom proxies microtask errors as 'error' on globalThis
      errors.push("error" in e ? e.error : (e as PromiseRejectionEvent).reason);
    };
    if (typeof process !== "undefined") {
      process.on("uncaughtException", handler as any);
    }

    const flaky = derive("d.flaky", get => {
      const v = get(a);
      if (v === 0) throw new Error("no zeros");
      return v * 2;
    });

    expect(flaky.value).toBe(2);

    // This throws inside the recompute — caught and re-thrown asynchronously.
    a.update(0);

    // Drain microtasks so the asynchronous re-throw fires.
    await new Promise(resolve => setTimeout(resolve, 10));

    if (typeof process !== "undefined") {
      process.off("uncaughtException", handler as any);
    }

    // The derived atom's value should be unchanged (the broken compute
    // doesn't push a new value).
    expect(flaky.value).toBe(2);

    // The source atom updated normally despite the broken derivation.
    expect(a.value).toBe(0);
  });
});
