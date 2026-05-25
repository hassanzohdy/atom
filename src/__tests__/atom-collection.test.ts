import { afterEach, describe, expect, it } from "vitest";
import { atomCollection } from "../atom-collection";
import { atoms } from "../atom";

afterEach(() => {
  for (const key of Object.keys(atoms)) {
    atoms[key].destroy();
  }
});

describe("atomCollection", () => {
  it("starts with an empty array when no default is provided", () => {
    const list = atomCollection({ key: "coll.empty" });
    expect(list.value).toEqual([]);
  });

  it("push, unshift, pop, shift", () => {
    const list = atomCollection<number>({ key: "coll.basic", default: [2, 3] });
    (list as any).push(4, 5);
    expect(list.value).toEqual([2, 3, 4, 5]);
    (list as any).unshift(0, 1);
    expect(list.value).toEqual([0, 1, 2, 3, 4, 5]);
    (list as any).pop();
    expect(list.value).toEqual([0, 1, 2, 3, 4]);
    (list as any).shift();
    expect(list.value).toEqual([1, 2, 3, 4]);
  });

  it("remove by index", () => {
    const list = atomCollection<number>({ key: "coll.rm-idx", default: [1, 2, 3] });
    (list as any).remove(1);
    expect(list.value).toEqual([1, 3]);
  });

  it("remove by predicate", () => {
    const list = atomCollection<number>({ key: "coll.rm-pred", default: [1, 2, 3, 4] });
    (list as any).remove((n: number) => n > 2);
    expect(list.value).toEqual([1, 2, 4]);
  });

  it("removeItem removes by value (first match)", () => {
    const list = atomCollection<string>({
      key: "coll.rm-item",
      default: ["a", "b", "a"],
    });
    (list as any).removeItem("a");
    expect(list.value).toEqual(["b", "a"]);
  });

  it("REGRESSION: removeAll mutates and removes every match", () => {
    const list = atomCollection<string>({
      key: "coll.rm-all",
      default: ["a", "b", "a", "c", "a"],
    });
    (list as any).removeAll("a");
    expect(list.value).toEqual(["b", "c"]);
  });

  it("replace overwrites at index", () => {
    const list = atomCollection<number>({ key: "coll.replace", default: [1, 2, 3] });
    (list as any).replace(1, 99);
    expect(list.value).toEqual([1, 99, 3]);
  });

  it("map mutates and returns the mapped result", () => {
    const list = atomCollection<number>({ key: "coll.map", default: [1, 2, 3] });
    const result = (list as any).map((n: number) => n * 2);
    expect(result).toEqual([2, 4, 6]);
    expect(list.value).toEqual([2, 4, 6]);
  });

  it("get by index or predicate", () => {
    const list = atomCollection<number>({ key: "coll.get", default: [10, 20, 30] });
    expect((list as any).get(0)).toBe(10);
    expect((list as any).get((n: number) => n === 20)).toBe(20);
  });

  it("index finds the first match", () => {
    const list = atomCollection<number>({ key: "coll.index", default: [10, 20, 30] });
    expect((list as any).index((n: number) => n === 20)).toBe(1);
  });

  it("length reflects current value", () => {
    const list = atomCollection<number>({ key: "coll.len", default: [1, 2, 3] });
    expect((list as any).length).toBe(3);
    (list as any).push(4);
    expect((list as any).length).toBe(4);
  });
});
