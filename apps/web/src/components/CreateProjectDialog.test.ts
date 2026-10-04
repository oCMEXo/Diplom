import { describe, expect, it } from "vitest";
import { projectNameFromRepoUrl } from "./CreateProjectDialog";

describe("projectNameFromRepoUrl", () => {
  it.each([
    ["https://github.com/octocat/Hello-World", "Hello-World"],
    ["https://github.com/octocat/Hello-World.git", "Hello-World"],
    ["https://github.com/octocat/Hello-World/tree/dev", "Hello-World"],
    ["git@github.com:octocat/Hello-World.git", "Hello-World"],
    ["octocat/Hello-World", "Hello-World"],
    ["github.com/octocat/Hello-World?tab=readme", "Hello-World"],
  ])("names the project after %s", (url, name) => {
    expect(projectNameFromRepoUrl(url)).toBe(name);
  });
});
