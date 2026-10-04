import { describe, expect, it } from "vitest";
import { missingModule } from "./run-hints";

describe("missingModule", () => {
  it("names a missing node package", () => {
    expect(missingModule("Error: Cannot find module 'ethers'\nRequire stack:\n- /tmp/p/main.js")).toBe("ethers");
    expect(missingModule("Error: Cannot find module '@openzeppelin/contracts'")).toBe("@openzeppelin/contracts");
  });

  it("names a missing python module", () => {
    expect(missingModule("ModuleNotFoundError: No module named 'requests'")).toBe("requests");
  });

  it("does not treat the project's own relative imports as packages", () => {
    expect(missingModule("Error: Cannot find module './logger'")).toBeNull();
    expect(missingModule("Error: Cannot find module '../lib/math'")).toBeNull();
  });

  it("is null for ordinary errors", () => {
    expect(missingModule("ZeroDivisionError: division by zero")).toBeNull();
    expect(missingModule("")).toBeNull();
  });
});
