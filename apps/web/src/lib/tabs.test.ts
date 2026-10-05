import { describe, expect, it } from "vitest";
import { addTab, closeTab, pruneTabs } from "./tabs";

describe("addTab", () => {
  it("adds a file once", () => {
    expect(addTab(["a"], "b")).toEqual(["a", "b"]);
    const tabs = ["a", "b"];
    expect(addTab(tabs, "a")).toBe(tabs);
  });

  it("drops the oldest tab past the limit", () => {
    const many = Array.from({ length: 12 }, (_, index) => `f${index}`);
    const next = addTab(many, "new");
    expect(next).toHaveLength(12);
    expect(next[0]).toBe("f1");
    expect(next.at(-1)).toBe("new");
  });
});

describe("closeTab", () => {
  it("moves to the right neighbour, else the left one", () => {
    expect(closeTab(["a", "b", "c"], "b")).toEqual({ tabs: ["a", "c"], next: "c" });
    expect(closeTab(["a", "b", "c"], "c")).toEqual({ tabs: ["a", "b"], next: "b" });
  });

  it("has nowhere to go after the last tab", () => {
    expect(closeTab(["a"], "a")).toEqual({ tabs: [], next: null });
  });

  it("ignores a tab that is not open", () => {
    expect(closeTab(["a"], "z")).toEqual({ tabs: ["a"], next: null });
  });
});

describe("pruneTabs", () => {
  it("forgets files that no longer exist", () => {
    expect(pruneTabs(["a", "b", "c"], new Set(["a", "c"]))).toEqual(["a", "c"]);
  });

  it("returns the same array when nothing changed", () => {
    const tabs = ["a", "b"];
    expect(pruneTabs(tabs, new Set(["a", "b"]))).toBe(tabs);
  });
});
