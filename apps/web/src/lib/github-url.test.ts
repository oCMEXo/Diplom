import { describe, expect, it } from "vitest";
import { repoSlug } from "./github-url";

describe("repoSlug", () => {
  it.each([
    ["https://github.com/oCMEXo/BlockChain", "ocmexo/blockchain"],
    ["git@github.com:oCMEXo/BlockChain.git", "ocmexo/blockchain"],
    ["github.com/oCMEXo/BlockChain/tree/dev", "ocmexo/blockchain"],
    ["oCMEXo/BlockChain", "ocmexo/blockchain"],
  ])("reads %s", (url, slug) => {
    expect(repoSlug(url)).toBe(slug);
  });

  it("returns null for things that are not a repository link", () => {
    expect(repoSlug("")).toBeNull();
    expect(repoSlug("https://github.com/only-owner")).toBeNull();
    expect(repoSlug("a/b/c")).toBeNull();
  });
});
