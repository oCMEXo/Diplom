import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { buildApp } from "./app.js";

describe("HTTP behaviour a person sees", () => {
  const userIds: string[] = [];
  const projectIds: string[] = [];

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function withApp<T>(run: (app: Awaited<ReturnType<typeof buildApp>>) => Promise<T>) {
    const app = await buildApp();
    try {
      return await run(app);
    } finally {
      await app.close();
    }
  }

  async function registerOwner(name: string) {
    return withApp(async (app) => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { name, email: `${randomUUID()}@test.local`, password: "password123" },
      });
      const body = response.json();
      userIds.push(body.user.id);
      return body as { user: { id: string; name: string }; tokens: { accessToken: string } };
    });
  }

  it("shows what an invite link leads to without signing in", async () => {
    const owner = await registerOwner("Артём");
    const created = await withApp((app) =>
      app.inject({
        method: "POST",
        url: "/projects",
        headers: { authorization: `Bearer ${owner.tokens.accessToken}` },
        payload: { name: "Курсовая" },
      }),
    );
    const project = created.json();
    projectIds.push(project.id);

    const preview = await withApp((app) => app.inject({ method: "GET", url: `/join/${project.inviteCode}` }));

    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual({ projectName: "Курсовая", ownerName: "Артём", role: "editor" });
  });

  it("answers an unknown invite link in Russian with a 404", async () => {
    const response = await withApp((app) => app.inject({ method: "GET", url: "/join/does-not-exist" }));
    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Ссылка-приглашение недействительна или устарела");
  });

  it("lets a person change their displayed name", async () => {
    const owner = await registerOwner("Гость");
    const response = await withApp((app) =>
      app.inject({
        method: "PATCH",
        url: "/auth/me",
        headers: { authorization: `Bearer ${owner.tokens.accessToken}` },
        payload: { name: "  Влад  " },
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe("Влад");
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } });
    expect(stored.name).toBe("Влад");
  });

  it("refuses an empty name", async () => {
    const owner = await registerOwner("Аня");
    const response = await withApp((app) =>
      app.inject({
        method: "PATCH",
        url: "/auth/me",
        headers: { authorization: `Bearer ${owner.tokens.accessToken}` },
        payload: { name: "   " },
      }),
    );
    expect(response.statusCode).toBe(400);
  });

  it("explains a wrong password and bad input in Russian", async () => {
    const owner = await registerOwner("Аня");
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } })).email;

    const wrong = await withApp((app) =>
      app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "not-the-password" } }),
    );
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().message).toBe("Неверный email или пароль");

    const invalid = await withApp((app) =>
      app.inject({ method: "POST", url: "/auth/login", payload: { email: "not-an-email", password: "x" } }),
    );
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().message).toMatch(/Проверьте введённые данные/);
  });
});
