import { describe, expect, it } from "vitest";
import type { Awareness } from "y-protocols/awareness";
import { remoteCursorCss } from "./cursor-styles";

function awarenessWith(states: Record<number, unknown>, self = 1) {
  return {
    clientID: self,
    getStates: () => new Map(Object.entries(states).map(([id, state]) => [Number(id), state])),
  } as unknown as Awareness;
}

describe("remoteCursorCss", () => {
  it("styles every remote participant but not yourself", () => {
    const css = remoteCursorCss(
      awarenessWith({
        1: { user: { name: "Я", color: "#112233" } },
        2: { user: { name: "Аня", color: "#445566" } },
      }),
    );
    expect(css).toContain(".yRemoteSelection-2");
    expect(css).toContain("#445566");
    expect(css).not.toContain(".yRemoteSelection-1");
  });

  it("never lets a hostile name or color break out of the stylesheet", () => {
    const css = remoteCursorCss(
      awarenessWith({
        2: { user: { name: 'x"}body{display:none}/*', color: "red;} body{display:none" } },
      }),
    );
    expect(css).not.toContain("display:none");
    expect(css).not.toContain("body{");
    expect(css).toContain("#64748b");
  });

  it("skips participants that have not announced themselves", () => {
    expect(remoteCursorCss(awarenessWith({ 2: {} }))).toBe("");
  });
});
