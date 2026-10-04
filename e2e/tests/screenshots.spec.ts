import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { API, createFile, createProject, guest, join, openAs, register, typeInEditor } from "./helpers.js";

// Produces the interface screenshots used in the thesis:
//   SCREENSHOTS=1 pnpm --filter @collab/e2e e2e -- screenshots
test.skip(process.env.SCREENSHOTS !== "1", "documentation screenshots are generated on demand");

const OUT = path.resolve(import.meta.dirname, "../../docs/thesis/screenshots");
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

test("interface screenshots", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const owner = await register(request, "Артём");
  const project = await createProject(request, owner, "Курсовая по алгоритмам");
  await createProject(request, owner, "Дизайн лендинга");
  const code = await createFile(request, owner, project.id, "main.py");
  await createFile(request, owner, project.id, "src/utils.ts");
  const doc = await createFile(request, owner, project.id, "README.md", "doc");
  const board = await createFile(request, owner, project.id, "архитектура.board", "board");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);
  for (const [who, body] of [
    [owner, "Привет! Залил заготовку, смотрите main.py"],
    [visitor, "Супер, сейчас гляну"],
    [visitor, "А доску для схемы уже создали?"],
    [owner, "Да, «архитектура.board» — рисуем там"],
  ] as const) {
    await request.post(`${API}/projects/${project.id}/messages`, {
      headers: { Authorization: `Bearer ${who.tokens.accessToken}` },
      data: { body },
    });
  }

  const ctx = { viewport: { width: 1440, height: 900 } };
  const fresh = await browser.newContext(ctx);
  const loginPage = await fresh.newPage();
  await loginPage.goto("/login");
  await expect(loginPage.getByText("С возвращением")).toBeVisible();
  await shot(loginPage, "01-login");
  await fresh.close();

  const open = async (auth: typeof owner, url: string) => {
    const page = await openAs(browser, auth, url);
    await page.setViewportSize(ctx.viewport);
    return page;
  };

  const home = await open(owner, "/");
  await expect(home.getByText("Курсовая по алгоритмам")).toBeVisible();
  await shot(home, "02-projects");

  const codePath = `/projects/${project.id}/files/${code.id}`;
  const ownerPage = await open(owner, codePath);
  const guestPage = await open(visitor, codePath);
  await expect(ownerPage.getByText("Синхронизировано")).toBeVisible();
  await typeInEditor(
    ownerPage,
    "def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint([fib(i) for i in range(10)])",
  );
  await guestPage.locator(".monaco-editor").first().click();
  await guestPage.keyboard.press("Control+End");
  await guestPage.keyboard.type("  # проверил");
  await ownerPage.waitForTimeout(1200);
  await shot(ownerPage, "03-editor");

  await ownerPage.getByRole("button", { name: "Пригласить", exact: true }).first().click();
  await ownerPage.waitForTimeout(400);
  await shot(ownerPage, "06-invite");
  await ownerPage.keyboard.press("Escape");

  const docPage = await open(owner, `/projects/${project.id}/files/${doc.id}`);
  await typeInEditor(
    docPage,
    "# Курсовая по алгоритмам\n\nСовместная работа над **заданием**: разбираем сортировки.\n\n## План\n- Реализовать `fib`\n- Оценить сложность\n- Подготовить схему на доске\n\n> Все правки видны сразу у каждого участника.",
  );
  await docPage.waitForTimeout(800);
  await shot(docPage, "04-markdown");

  const boardPage = await open(owner, `/projects/${project.id}/files/${board.id}`);
  const canvas = boardPage.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("board canvas is not visible");
  const draw = async (tool: string, from: [number, number], to: [number, number], swatch?: string) => {
    if (swatch) {
      // Picking a color recolors the selected shape, so deselect before choosing the next one.
      await boardPage.getByRole("button", { name: "Выбор" }).click();
      await boardPage.mouse.click(box.x + 40, box.y + 600);
      await boardPage.getByRole("button", { name: `цвет ${swatch}` }).click();
    }
    await boardPage.getByRole("button", { name: tool }).click();
    await boardPage.mouse.move(box.x + from[0], box.y + from[1]);
    await boardPage.mouse.down();
    await boardPage.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 });
    await boardPage.mouse.up();
  };
  await draw("Прямоугольник", [90, 90], [300, 170], "#bfdbfe");
  await draw("Прямоугольник", [90, 300], [300, 380], "#bbf7d0");
  await draw("Овал", [520, 190], [720, 290], "#fde68a");
  await draw("Стрелка", [305, 130], [515, 235], "#bfdbfe");
  await draw("Стрелка", [305, 340], [515, 250], "#bbf7d0");
  await boardPage.waitForTimeout(500);
  await shot(boardPage, "05-board");

  await ownerPage.getByRole("button", { name: "Меню профиля" }).click();
  await ownerPage.getByRole("menuitem", { name: /тема/ }).click();
  await ownerPage.keyboard.press("Escape");
  await ownerPage.waitForTimeout(500);
  await shot(ownerPage, "07-light-theme");

  const importPage = await open(owner, `/projects/${project.id}`);
  await importPage.getByRole("button", { name: "Импортировать из GitHub" }).click();
  await importPage.getByLabel("Ссылка на репозиторий").fill("https://github.com/octocat/Hello-World");
  await importPage.waitForTimeout(300);
  await shot(importPage, "09-import-github");

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mobile.addInitScript((stored) => {
    window.localStorage.setItem("collab.auth", stored);
  }, JSON.stringify({ user: owner.user, tokens: owner.tokens }));
  const phone = await mobile.newPage();
  await phone.goto(`/projects/${project.id}/files/${doc.id}`);
  await phone.waitForTimeout(2000);
  await shot(phone, "08-mobile");
  await mobile.close();
});
