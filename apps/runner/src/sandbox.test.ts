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

  it("unpacks the project from stdin into a tmpfs and runs the entry file from there", () => {
    const image = args.indexOf("python:3.12-alpine");
    expect(args.slice(image, image + 3)).toEqual(["python:3.12-alpine", "sh", "-c"]);
    expect(args[image + 3]).toContain("tar -xf - -C /tmp/p");
    expect(args[image + 3]).toContain('exec python "./$ENTRY"');
    expect(joined).toContain("--tmpfs /tmp:rw,size=16m");
  });

  it("passes the entry file through the environment, not the shell script", () => {
    const tricky = buildDockerArgs("javascript", "x", 'a"; rm -rf /; echo "b.js');
    expect(tricky).toContain('ENTRY=a"; rm -rf /; echo "b.js');
    expect(tricky.at(-1)).not.toContain("rm -rf");
  });

  it("picks the node image for javascript", () => {
    const node = buildDockerArgs("javascript", "x");
    expect(node).toContain("node:22-alpine");
    expect(node.at(-1)).toContain('exec node "./$ENTRY"');
    expect(node).toContain("ENTRY=main.js");
  });
});

describe("parseErrorLine", () => {
  it("reads the failing line from a node stack trace", () => {
    const stderr = [
      "/tmp/p/main.js:12",
      'throw new Error("boom");',
      "^",
      "",
      "Error: boom",
      "    at Object.<anonymous> (/tmp/p/main.js:12:7)",
      "    at node:internal/modules",
    ].join("\n");
    expect(parseErrorLine("javascript", stderr)).toBe(12);
    expect(parseErrorLine("javascript", stderr, "scripts/run.js")).toBeNull();
  });

  it("uses the innermost frame of a python traceback that belongs to the entry file", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "/tmp/p/main.py", line 9, in <module>',
      '  File "/tmp/p/main.py", line 4, in divide',
      '  File "/tmp/p/helper.py", line 2, in inner',
      "ZeroDivisionError: division by zero",
    ].join("\n");
    expect(parseErrorLine("python", stderr)).toBe(4);
  });

  it("accepts the ./ that python keeps in the script path", () => {
    expect(parseErrorLine("python", '  File "/tmp/p/./main.py", line 5, in <module>')).toBe(5);
  });

  it("reads python syntax errors", () => {
    expect(parseErrorLine("python", '  File "/tmp/p/main.py", line 3\n    print(\n         ^\nSyntaxError')).toBe(3);
  });

  it("only reports lines of the file being run, also when it sits in a folder", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "/tmp/p/app/run.py", line 7, in <module>',
      '  File "/tmp/p/app/util.py", line 3, in helper',
      "ValueError: bad",
    ].join("\n");
    expect(parseErrorLine("python", stderr, "app/run.py")).toBe(7);
  });

  it("returns null when there is no location", () => {
    expect(parseErrorLine("python", "something went wrong")).toBeNull();
    expect(parseErrorLine("javascript", "")).toBeNull();
  });
});
