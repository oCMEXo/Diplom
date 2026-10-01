import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "./jwt.js";

describe("access tokens", () => {
  it("round-trips the payload", () => {
    const token = signAccessToken({ sub: "user-1", email: "a@example.com" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("a@example.com");
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ sub: "user-1", email: "a@example.com" });
    expect(() => verifyAccessToken(token + "x")).toThrow();
  });
});
