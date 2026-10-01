import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { verifyAccessToken } from "../../lib/jwt.js";
import { loginAsGuest } from "./auth.service.js";

describe("loginAsGuest", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("creates a usable guest account without email/password", async () => {
    const result = await loginAsGuest({ name: "Казимир" });
    createdUserIds.push(result.user.id);

    expect(result.user.isGuest).toBe(true);
    expect(result.user.name).toBe("Казимир");

    const payload = verifyAccessToken(result.tokens.accessToken);
    expect(payload.sub).toBe(result.user.id);
  });

  it("falls back to a default name when none is given", async () => {
    const result = await loginAsGuest({});
    createdUserIds.push(result.user.id);

    expect(result.user.name).toBeTruthy();
  });

  it("gives each guest a distinct account", async () => {
    const a = await loginAsGuest({ name: "A" });
    const b = await loginAsGuest({ name: "B" });
    createdUserIds.push(a.user.id, b.user.id);

    expect(a.user.id).not.toBe(b.user.id);
    expect(a.user.email).not.toBe(b.user.email);
  });
});
