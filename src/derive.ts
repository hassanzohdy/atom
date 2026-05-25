/**
 * @fileoverview Derived atoms.
 *
 * A derived atom holds a value computed from one or more other atoms.
 * Dependencies are auto-tracked: whichever atoms the compute function
 * reads via the `get` argument become dependencies. When any of those
 * change, the derived value recomputes and notifies its subscribers.
 *
 * Conceptually similar to Jotai's `atom(get => ...)` and MobX's
 * `computed`. Returns a normal `Atom<T>`, so every consumer pattern in
 * `@mongez/react-atom` (useValue, useState, watch, onChange, …) works.
 *
 * @example
 * ```ts
 * const first = createAtom({ key: "first", default: "Ada" });
 * const last  = createAtom({ key: "last",  default: "Lovelace" });
 *
 * const fullName = derive("fullName", get => `${get(first)} ${get(last)}`);
 *
 * fullName.value;                 // "Ada Lovelace"
 * first.update("Grace");
 * fullName.value;                 // "Grace Lovelace"
 * ```
 */
import { type EventSubscription } from "@mongez/events";
import { createAtom } from "./atom";
import type { Atom } from "./types";

/**
 * The reader passed to a derive compute function. Calling `get(atom)`
 * registers that atom as a dependency and returns its current value.
 */
export type DeriveGetter = <V>(atom: Atom<V, any>) => V;

export type DeriveOptions = {
  /**
   * Skip the global `atoms` registry. Used by `AtomStore` clones — most
   * consumers should leave this alone.
   * @default true
   */
  register?: boolean;
};

/**
 * Create a derived atom.
 *
 * The compute function runs once eagerly on creation to seed the initial
 * value and to discover dependencies. After that, it re-runs every time
 * any tracked dependency changes.
 *
 * Conditional reads work: an `if` branch inside the compute function
 * that reads a different atom on a later run picks up the new dep and
 * drops the old one. This handles the "dynamic dependency graph" case
 * (e.g. `if (get(currentRoute) === "users") return get(usersAtom)`).
 *
 * Calling `update`, `silentUpdate`, `change`, `merge` directly on the
 * returned atom works but is discouraged — the next dependency change
 * will overwrite anything you wrote. Use a regular atom if you need
 * writable state.
 */
export function derive<T>(
  key: string,
  compute: (get: DeriveGetter) => T,
  options: DeriveOptions = {},
): Atom<T> {
  /**
   * Active subscriptions to dependencies, keyed by the source atom.
   * Replaced wholesale on each recompute so dynamic dependency graphs
   * don't accumulate stale subscriptions.
   */
  let depSubs = new Map<Atom<any>, EventSubscription>();

  /**
   * A scratch set used during a recompute to mark which atoms were
   * touched on this run. After compute finishes we diff against
   * `depSubs`, drop stale ones, and add new ones.
   */
  let trackedThisRun: Set<Atom<any>> | undefined;

  const trackingGet: DeriveGetter = atom => {
    if (trackedThisRun) trackedThisRun.add(atom);
    return atom.value;
  };

  /**
   * Recompute the derived value and reconcile the dependency set.
   * Updates the derived atom via the normal `update` flow so all
   * downstream subscribers see the change.
   *
   * Errors thrown inside `compute` are caught and re-thrown
   * asynchronously: we don't want a single broken derivation to take
   * down the atom-bus subscriber. The atom's previous value is kept.
   */
  const recompute = () => {
    trackedThisRun = new Set();
    let next: T;
    try {
      next = compute(trackingGet);
    } catch (err) {
      trackedThisRun = undefined;
      // Surface the error without breaking the source-atom's update cycle.
      queueMicrotask(() => {
        throw err;
      });
      return;
    }

    // Reconcile: subscribe to newly-seen deps, drop deps no longer read.
    const seen = trackedThisRun;
    trackedThisRun = undefined;

    for (const dep of seen) {
      if (!depSubs.has(dep)) {
        depSubs.set(dep, dep.onChange(recompute));
      }
    }
    for (const [dep, sub] of depSubs) {
      if (!seen.has(dep)) {
        sub.unsubscribe();
        depSubs.delete(dep);
      }
    }

    // Push the new value through the standard update path. If the value
    // is structurally unchanged the atom's update() will short-circuit
    // for primitives; for objects we always send a new reference
    // because `compute` builds one each call.
    derivedAtom.update(next);
  };

  // Bootstrap: compute the initial value and the initial dep set.
  trackedThisRun = new Set();
  const initialValue = compute(trackingGet);
  const seen = trackedThisRun;
  trackedThisRun = undefined;

  const derivedAtom = createAtom<T>(
    {
      key,
      default: initialValue,
    },
    { register: options.register !== false },
  );

  // Wire up dependency subscriptions now that the derived atom exists.
  for (const dep of seen) {
    depSubs.set(dep, dep.onChange(recompute));
  }

  // Tear down dependency subs when the atom is destroyed so they don't
  // outlive the consumer and leak memory.
  derivedAtom.onDestroy(() => {
    for (const sub of depSubs.values()) sub.unsubscribe();
    depSubs.clear();
  });

  return derivedAtom;
}
