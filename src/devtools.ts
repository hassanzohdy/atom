/**
 * @fileoverview Redux DevTools bridge for `@mongez/atom`.
 *
 * Opt-in, browser-only, zero-cost when not enabled (tree-shaken if you
 * never import `enableAtomDevtools`).
 *
 * Pipes every atom update into the Redux DevTools extension so you get:
 *
 *   - A live list of every registered atom and its current value.
 *   - A timeline of updates with diffs.
 *   - Time-travel: jumping back in the timeline restores the matching
 *     state via `silentUpdate` on every atom.
 *
 * @example
 * ```ts
 * // app entry, dev only
 * if (process.env.NODE_ENV !== "production") {
 *   enableAtomDevtools({ name: "MyApp" });
 * }
 * ```
 */
import events from "@mongez/events";
import { atoms } from "./atom";
import type { Atom } from "./types";

/**
 * Subset of the Redux DevTools instance API we use. Typed locally so we
 * don't need to take a dep on `@redux-devtools/extension`.
 */
type DevtoolsInstance = {
  init(state: unknown): void;
  send(action: { type: string; payload?: unknown }, state: unknown): void;
  subscribe(
    listener: (message: {
      type: string;
      payload?: { type?: string };
      state?: string;
    }) => void,
  ): () => void;
  disconnect?(): void;
};

type DevtoolsExtension = {
  connect(options?: {
    name?: string;
    features?: Record<string, unknown>;
  }): DevtoolsInstance;
};

export type EnableDevtoolsOptions = {
  /** Label shown in the extension UI. */
  name?: string;
  /**
   * Skip atoms whose key matches any of these patterns. Useful for
   * silencing high-frequency atoms (mouse position, scroll, etc.) that
   * would otherwise spam the timeline.
   */
  ignore?: Array<RegExp | string>;
  /**
   * How often (ms) to look for newly-registered atoms. Apps that
   * register every atom at startup never need this; the default of
   * 1000ms is fine for hot-reload and code-splitting cases.
   * @default 1000
   */
  scanInterval?: number;
};

/**
 * Connect every registered atom to the Redux DevTools extension.
 *
 * Returns a teardown function that disconnects and stops the registry
 * scan. Safe to call when the extension isn't installed — it returns
 * a no-op teardown without doing any work.
 */
export function enableAtomDevtools(
  options: EnableDevtoolsOptions = {},
): () => void {
  const win =
    typeof window !== "undefined" ? (window as unknown as Window & {
      __REDUX_DEVTOOLS_EXTENSION__?: DevtoolsExtension;
    }) : undefined;

  const ext = win?.__REDUX_DEVTOOLS_EXTENSION__;
  if (!ext) return () => {};

  const devtools = ext.connect({
    name: options.name ?? "@mongez/atom",
  });

  const ignored = (key: string): boolean =>
    !!options.ignore?.some(pat =>
      typeof pat === "string" ? pat === key : pat.test(key),
    );

  const snapshot = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, a] of Object.entries(atoms)) {
      if (!ignored(k)) out[k] = a.value;
    }
    return out;
  };

  devtools.init(snapshot());

  // Per-atom subscriptions we own (so we can tear them down).
  const subscribed = new Map<string, () => void>();

  const subscribeAtom = (atom: Atom<any>) => {
    if (ignored(atom.key)) return;
    if (subscribed.has(atom.key)) return;
    const sub = atom.onChange(newValue => {
      devtools.send(
        { type: `${atom.key}/update`, payload: newValue },
        snapshot(),
      );
    });
    const onResetSub = atom.onReset(() => {
      devtools.send({ type: `${atom.key}/reset` }, snapshot());
    });
    const onDestroySub = atom.onDestroy(() => {
      devtools.send({ type: `${atom.key}/destroy` }, snapshot());
      // Drop our own subscription bookkeeping.
      subscribed.delete(atom.key);
    });
    subscribed.set(atom.key, () => {
      sub.unsubscribe();
      onResetSub.unsubscribe();
      onDestroySub.unsubscribe();
    });
  };

  for (const atom of Object.values(atoms)) subscribeAtom(atom);

  // Pick up atoms registered AFTER enableAtomDevtools fires. Apps that
  // import all their atoms at boot will never trigger this; lazy-loaded
  // routes that register atoms on demand will. Poll-based for simplicity.
  const interval = options.scanInterval ?? 1000;
  const scanTimer: ReturnType<typeof setInterval> = setInterval(() => {
    for (const atom of Object.values(atoms)) subscribeAtom(atom);
  }, interval);

  // Time-travel: when the user jumps to a snapshot in the extension,
  // restore every atom's value via silentUpdate so consumers see the
  // restored state on the next read.
  const unsubDevtools = devtools.subscribe(message => {
    if (message.type !== "DISPATCH") return;
    const payloadType = message.payload?.type;
    if (
      payloadType !== "JUMP_TO_STATE" &&
      payloadType !== "JUMP_TO_ACTION"
    ) {
      return;
    }
    if (!message.state) return;
    let restored: Record<string, unknown>;
    try {
      restored = JSON.parse(message.state);
    } catch {
      return;
    }
    for (const [key, value] of Object.entries(restored)) {
      const atom = atoms[key];
      if (!atom) continue;
      atom.silentUpdate(value);
      // Synthesise an update event so React subscribers re-render.
      events.trigger(`atoms.${key}.update`, value, atom.currentValue, atom);
    }
  });

  return () => {
    clearInterval(scanTimer);
    for (const unsub of subscribed.values()) unsub();
    subscribed.clear();
    unsubDevtools();
    devtools.disconnect?.();
  };
}
