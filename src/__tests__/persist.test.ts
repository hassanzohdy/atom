/**
 * Persistence tests.
 *
 * Behavior covered:
 *   - A fake sync adapter loads the initial value on creation.
 *   - Updates write through to the adapter.
 *   - Reset removes the adapter entry.
 *   - Async (Promise-returning) adapters work — initial read awaited,
 *     value applied via silentUpdate without a stray update event.
 *   - Errors from adapter methods don't crash atom creation or updates.
 *   - `persist: true` uses the built-in localStorage adapter on the
 *     client and no-ops on the server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAtom } from "../atom";
import { atoms } from "../atom";
import { localStorageAdapter, type PersistAdapter } from "../persist";

afterEach(() => {
  for (const key of Object.keys(atoms)) atoms[key].destroy();
});

/** Build a sync in-memory adapter for tests. */
function memoryAdapter(initial: Record<string, unknown> = {}): PersistAdapter & {
  store: Record<string, unknown>;
} {
  const store = { ...initial };
  return {
    store,
    get: (key) => store[key],
    set: (key, value) => {
      store[key] = value;
    },
    remove: (key) => {
      delete store[key];
    },
  };
}

describe("persist (sync adapter)", () => {
  it("seeds the initial value from the adapter", () => {
    const adapter = memoryAdapter({ "persist.user": { name: "Stored" } });
    const userAtom = createAtom({
      key: "persist.user",
      default: { name: "Default" },
      persist: adapter,
    });
    expect(userAtom.value).toEqual({ name: "Stored" });
  });

  it("falls back to the default when the adapter has no entry", () => {
    const adapter = memoryAdapter();
    const userAtom = createAtom({
      key: "persist.user",
      default: { name: "Default" },
      persist: adapter,
    });
    expect(userAtom.value).toEqual({ name: "Default" });
  });

  it("writes through on every update", () => {
    const adapter = memoryAdapter();
    const userAtom = createAtom<{ name: string }>({
      key: "persist.user",
      default: { name: "Default" },
      persist: adapter,
    });
    userAtom.update({ name: "First" });
    expect(adapter.store["persist.user"]).toEqual({ name: "First" });

    userAtom.update({ name: "Second" });
    expect(adapter.store["persist.user"]).toEqual({ name: "Second" });
  });

  it("removes the entry on reset", () => {
    const adapter = memoryAdapter({ "persist.flag": true });
    const flag = createAtom({
      key: "persist.flag",
      default: false,
      persist: adapter,
    });
    expect(flag.value).toBe(true);
    flag.reset();
    expect(flag.value).toBe(false);
    expect(adapter.store["persist.flag"]).toBeUndefined();
  });

  it("does not write through on silentUpdate", () => {
    // silentUpdate doesn't fire onChange; the persist hook is wired via
    // onChange, so silent writes stay in memory only. That's the right
    // contract — `silent` means "don't tell anyone, including storage."
    const adapter = memoryAdapter();
    const userAtom = createAtom({
      key: "persist.user",
      default: { name: "Default" },
      persist: adapter,
    });
    userAtom.silentUpdate({ name: "Quiet" });
    expect(userAtom.value).toEqual({ name: "Quiet" });
    expect(adapter.store["persist.user"]).toBeUndefined();
  });
});

describe("persist (async adapter)", () => {
  it("awaits the initial read and applies the value via silentUpdate", async () => {
    const adapter: PersistAdapter = {
      get: async () => ({ name: "AsyncStored" }),
      set: async () => {},
      remove: async () => {},
    };

    const onUpdate = vi.fn();
    const userAtom = createAtom({
      key: "persist.async.user",
      default: { name: "Default" },
      persist: adapter,
    });
    userAtom.onChange(onUpdate);

    // Default value at first; async read hasn't resolved yet.
    expect(userAtom.value).toEqual({ name: "Default" });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(userAtom.value).toEqual({ name: "AsyncStored" });
    // silentUpdate path → no update event for the hydration step.
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("persist (error resilience)", () => {
  it("survives a failing initial read", () => {
    const adapter: PersistAdapter = {
      get: () => {
        throw new Error("storage offline");
      },
      set: () => {},
      remove: () => {},
    };
    expect(() =>
      createAtom({
        key: "persist.err",
        default: 0,
        persist: adapter,
      }),
    ).not.toThrow();
  });

  it("survives a failing write", () => {
    const adapter: PersistAdapter = {
      get: () => undefined,
      set: () => {
        throw new Error("quota");
      },
      remove: () => {},
    };
    const a = createAtom({
      key: "persist.write-err",
      default: 0,
      persist: adapter,
    });
    expect(() => a.update(5)).not.toThrow();
    expect(a.value).toBe(5);
  });
});

describe("persist: true (built-in localStorage adapter)", () => {
  // The atom package's vitest config runs in the `node` environment to
  // keep the test surface dependency-light. To exercise the
  // localStorage path without pulling in jsdom/happy-dom as a devDep,
  // we install a tiny Map-backed window mock per test.
  function fakeLocalStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      get length() {
        return map.size;
      },
      key: (i: number) => Array.from(map.keys())[i] ?? null,
    } as Storage;
  }

  let realWindow: unknown;

  beforeEach(() => {
    realWindow = (globalThis as any).window;
    (globalThis as any).window = { localStorage: fakeLocalStorage() };
  });

  afterEach(() => {
    if (realWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = realWindow;
    }
  });

  it("reads the initial value from localStorage when present", () => {
    (window as any).localStorage = fakeLocalStorage({
      "persist.builtin": JSON.stringify({ count: 42 }),
    });

    const a = createAtom({
      key: "persist.builtin",
      default: { count: 0 },
      persist: true,
    });
    expect(a.value).toEqual({ count: 42 });
  });

  it("writes through to localStorage on every update", () => {
    const a = createAtom({
      key: "persist.write",
      default: { count: 0 },
      persist: true,
    });
    a.update({ count: 100 });
    expect(
      JSON.parse(window.localStorage.getItem("persist.write")!),
    ).toEqual({ count: 100 });
  });

  it("removes the entry on reset", () => {
    (window as any).localStorage = fakeLocalStorage({
      "persist.reset": JSON.stringify({ count: 1 }),
    });
    const a = createAtom({
      key: "persist.reset",
      default: { count: 0 },
      persist: true,
    });
    a.reset();
    expect(window.localStorage.getItem("persist.reset")).toBeNull();
  });

  it("no-ops gracefully on the server (no window)", () => {
    delete (globalThis as any).window;
    const a = createAtom({
      key: "persist.no-window",
      default: 0,
      persist: true,
    });
    expect(a.value).toBe(0);
    expect(() => a.update(5)).not.toThrow();
    expect(a.value).toBe(5);
  });
});
