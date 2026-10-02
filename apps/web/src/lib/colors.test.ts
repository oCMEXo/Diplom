import { describe, expect, it } from "vitest";
import { colorForUser, gradientFor, initials } from "./colors";

describe("colors", () => {
  it("gives the same color to the same user every time", () => {
    expect(colorForUser("user-1")).toBe(colorForUser("user-1"));
  });

  it("builds initials from one or two words", () => {
    expect(initials("Аня")).toBe("АН");
    expect(initials("Влад Иванов")).toBe("ВИ");
    expect(initials("   ")).toBe("?");
  });

  it("always builds a valid gradient, whatever the id", () => {
    for (let i = 0; i < 300; i += 1) {
      expect(gradientFor(`project-${i}-${i * 7919}`)).not.toContain("undefined");
    }
  });
});
