/**
 * DevTools-bridge tests.
 *
 * Uses a fake DevTools extension mounted on `globalThis` to verify:
 *   - `init` is called with the current snapshot.
 *   - `send` is called on every atom update with `{ type, payload }` +
 *     the new full snapshot.
 *   - `JUMP_TO_STATE` time-travel restores atom values.
 *   - The returned teardown unsubscribes cleanly.
 *   - When no extension is present, `enableAtomDevtools()` is a no-op
 *     and returns a no-op teardown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAtom } from "../atom";
import { atoms } from "../atom";
import { enableAtomDevtools } from "../devtools";

type Action = { type: string; payload?: unknown };
type Listener = (msg: {
  type: string;
  payload?: { type?: string };
  state?: string;
}) => void;

function makeFakeExtension() {
  const sent: Array<{ action: Action; state: unknown }> = [];
  let initState: unknown;
  let lastListener: Listener | undefined;
  const instance = {
    init: vi.fn((s: unknown) => {
      initState = s;
    }),
    send: vi.fn((action: Action, state: unknown) => {
      sent.push({ action, state });
    }),
    subscribe: vi.fn((l: Listener) => {
      lastListener = l;
      return () => {
        lastListener = undefined;
      };
    }),
    disconnect: vi.fn(),
  };
  const ext = {
    connect: vi.fn(() => instance),
  };
  return {
    ext,
    instance,
    sent,
    getInitState: () => initState,
    fire: (msg: Parameters<Listener>[0]) => lastListener?.(msg),
  };
}

afterEach(() => {
  for (const key of Object.keys(atoms)) atoms[key].destroy();
  delete (globalThis as any).window;
});

describe("enableAtomDevtools", () => {
  it("is a no-op when the extension is not installed", () => {
    (globalThis as any).window = {}; // no __REDUX_DEVTOOLS_EXTENSION__
    const teardown = enableAtomDevtools();
    expect(typeof teardown).toBe("function");
    // Calling it must not throw.
    expect(() => teardown()).not.toThrow();
  });

  it("seeds init with a snapshot of every registered atom", () => {
    createAtom({ key: "dev.a", default: 1 });
    createAtom({ key: "dev.b", default: { x: 2 } });

    const fake = makeFakeExtension();
    (globalThis as any).window = { __REDUX_DEVTOOLS_EXTENSION__: fake.ext };

    const teardown = enableAtomDevtools({ name: "Test" });
    expect(fake.instance.init).toHaveBeenCalledTimes(1);
    expect(fake.getInitState()).toMatchObject({
      "dev.a": 1,
      "dev.b": { x: 2 },
    });

    teardown();
  });

  it("forwards updates as actions with the current snapshot", () => {
    const a = createAtom({ key: "dev.counter", default: 0 });

    const fake = makeFakeExtension();
    (globalThis as any).window = { __REDUX_DEVTOOLS_EXTENSION__: fake.ext };

    const teardown = enableAtomDevtools();

    a.update(5);

    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].action).toMatchObject({
      type: "dev.counter/update",
      payload: 5,
    });
    expect((fake.sent[0].state as any)["dev.counter"]).toBe(5);

    teardown();
  });

  it("honors the `ignore` option (string + regex)", () => {
    const noisy = createAtom({ key: "dev.noisy.mouse", default: 0 });
    const quiet = createAtom({ key: "dev.quiet.user", default: "Anon" });

    const fake = makeFakeExtension();
    (globalThis as any).window = { __REDUX_DEVTOOLS_EXTENSION__: fake.ext };

    const teardown = enableAtomDevtools({
      ignore: [/^dev\.noisy\./],
    });

    noisy.update(1);
    quiet.update("Alice");

    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].action.type).toBe("dev.quiet.user/update");

    teardown();
  });

  it("time-travel: JUMP_TO_STATE restores values via silentUpdate", () => {
    const a = createAtom({ key: "tt.a", default: 0 });
    const b = createAtom({ key: "tt.b", default: "hello" });

    const fake = makeFakeExtension();
    (globalThis as any).window = { __REDUX_DEVTOOLS_EXTENSION__: fake.ext };

    const teardown = enableAtomDevtools();

    a.update(7);
    b.update("world");
    expect(a.value).toBe(7);
    expect(b.value).toBe("world");

    fake.fire({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_STATE" },
      state: JSON.stringify({ "tt.a": 1, "tt.b": "restored" }),
    });

    expect(a.value).toBe(1);
    expect(b.value).toBe("restored");

    teardown();
  });

  it("teardown unsubscribes so subsequent updates are not forwarded", () => {
    const a = createAtom({ key: "dev.teardown", default: 0 });

    const fake = makeFakeExtension();
    (globalThis as any).window = { __REDUX_DEVTOOLS_EXTENSION__: fake.ext };

    const teardown = enableAtomDevtools();
    a.update(1);
    expect(fake.sent).toHaveLength(1);

    teardown();
    a.update(2);

    expect(fake.sent).toHaveLength(1); // no new entries
    expect(fake.instance.disconnect).toHaveBeenCalledTimes(1);
  });
});
