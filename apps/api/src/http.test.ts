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

  it("limits how often one address can try to sign in, and tells them to wait", async () => {
    const app = await buildApp({ rateLimit: { perMinute: 50, authPerMinute: 2 }, trustProxy: true });
    try {
      const attempt = (ip: string) =>
        app.inject({
          method: "POST",
          url: "/auth/login",
          headers: { "x-forwarded-for": ip },
          payload: { email: "nobody@test.local", password: "wrong-password" },
        });

      expect((await attempt("203.0.113.7")).statusCode).toBe(401);
      expect((await attempt("203.0.113.7")).statusCode).toBe(401);
      const blocked = await attempt("203.0.113.7");
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().message).toMatch(/Слишком много запросов/);

      // Another visitor behind the same proxy is counted separately.
      expect((await attempt("203.0.113.8")).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("does not limit anything unless a limit is configured", async () => {
    const app = await buildApp({ rateLimit: { perMinute: 0, authPerMinute: 0 } });
    try {
      for (let i = 0; i < 8; i += 1) {
        const response = await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: "nobody@test.local", password: "wrong-password" },
        });
        expect(response.statusCode).toBe(401);
      }
    } finally {
      await app.close();
    }
  });

  it("refuses to run code when the server has running switched off", async () => {
    const owner = await registerOwner("Аня");
    const response = await withApp(async () => {
      const app = await buildApp({ runEnabled: false });
      try {
        return await app.inject({
          method: "POST",
          url: `/projects/${randomUUID()}/files/${randomUUID()}/run`,
          headers: { authorization: `Bearer ${owner.tokens.accessToken}` },
          payload: { code: "print(1)" },
        });
      } finally {
        await app.close();
      }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toBe("Запуск кода на этом сервере выключен");
  });

  it("tells the app whether code runs here, and for whom", async () => {
    for (const [options, run] of [
      [{ runEnabled: true, runAccessCode: undefined }, "open"],
      [{ runEnabled: true, runAccessCode: "secret-code-1" }, "code"],
      [{ runEnabled: false, runAccessCode: undefined }, "off"],
    ] as const) {
      const app = await buildApp(options);
      try {
        const response = await app.inject({ method: "GET", url: "/features" });
        expect(response.json()).toEqual({ run });
      } finally {
        await app.close();
      }
    }
  });

  it("runs code and opens terminals only for people who give the access code", async () => {
    const owner = await registerOwner("Аня");
    const app = await buildApp({ runEnabled: true, runAccessCode: "secret-code-1" });
    const auth = { authorization: `Bearer ${owner.tokens.accessToken}` };
    try {
      const check = (code: string) => app.inject({ method: "POST", url: "/run-access", payload: { code } });
      expect((await check("guess")).statusCode).toBe(403);
      expect((await check(" secret-code-1 ")).statusCode).toBe(204);

      const project = randomUUID();
      for (const [url, payload] of [
        [`/projects/${project}/files/${randomUUID()}/run`, { code: "print(1)" }],
        [`/projects/${project}/terminal`, undefined],
      ] as const) {
        const without = await app.inject({ method: "POST", url, headers: auth, payload });
        expect(without.statusCode).toBe(403);
        expect(without.json().message).toMatch(/кодом доступа/);
        const wrong = await app.inject({ method: "POST", url, headers: { ...auth, "x-run-code": "nope" }, payload });
        expect(wrong.statusCode).toBe(403);
        // With the code the request gets through to the project check (this project does not exist).
        const right = await app.inject({ method: "POST", url, headers: { ...auth, "x-run-code": "secret-code-1" }, payload });
        expect(right.statusCode).toBe(404);
      }
    } finally {
      await app.close();
    }
  });
});
