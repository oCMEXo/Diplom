import { describe, expect, it } from "vitest";
import { buildDockerArgs, parseErrorLine } from "./sandbox.js";

describe("buildDockerArgs", () => {
  const args = buildDockerArgs("python", "11111111-1111-1111-1111-111111111111");
  const joined = args.join(" ");

  it("cuts off the network and the writable filesystem", () => {
    expect(joined).toContain("--network none");
    expect(args).toContain("--read-only");
  });

  it("drops privileges", () => {
    expect(joined).toContain("--user 65534:65534");
    expect(joined).toContain("--cap-drop ALL");
    expect(joined).toContain("--security-opt no-new-privileges");
  });

  it("limits memory, cpu and process count", () => {
    expect(joined).toContain("--memory 128m");
    expect(joined).toContain("--memory-swap 128m");
    expect(joined).toContain("--cpus 0.5");
    expect(joined).toContain("--pids-limit 64");
  });

  it("reads the program from stdin so no user data touches the filesystem", () => {
    expect(args.slice(-3)).toEqual(["python:3.12-alpine", "python", "-"]);
  });

  it("picks the node image for javascript", () => {
    expect(buildDockerArgs("javascript", "x").slice(-3)).toEqual(["node:22-alpine", "node", "-"]);
  });
});

describe("parseErrorLine", () => {
  it("reads the failing line from a node stack trace", () => {
    const stderr = `[stdin]:12\nthrow new Error("boom");\n^\n\nError: boom\n    at [stdin]:12:7\n    at Script.runInThisContext`;
    expect(parseErrorLine("javascript", stderr)).toBe(12);
  });

  it("uses the innermost frame of a python traceback", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "<stdin>", line 9, in <module>',
      '  File "<stdin>", line 4, in divide',
      "ZeroDivisionError: division by zero",
    ].join("\n");
    expect(parseErrorLine("python", stderr)).toBe(4);
  });

  it("reads python syntax errors", () => {
    expect(parseErrorLine("python", '  File "<stdin>", line 3\n    print(\n         ^\nSyntaxError')).toBe(3);
  });

  it("returns null when there is no location", () => {
    expect(parseErrorLine("python", "something went wrong")).toBeNull();
    expect(parseErrorLine("javascript", "")).toBeNull();
  });
});
