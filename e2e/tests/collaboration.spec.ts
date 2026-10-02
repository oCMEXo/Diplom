import { expect, test } from "@playwright/test";
import {
  createFile,
  createProject,
  editorText,
  guest,
  join,
  openAs,
  register,
  setInviteRole,
  typeInEditor,
} from "./helpers.js";

test("two people edit one file and see each other's changes live", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Совместный проект");
  const file = await createFile(request, owner, project.id, "main.py");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const path = `/projects/${project.id}/files/${file.id}`;
  const ownerPage = await openAs(browser, owner, path);
  const guestPage = await openAs(browser, visitor, path);
  await expect(ownerPage.getByText("Синхронизировано")).toBeVisible();
  await expect(guestPage.getByText("Синхронизировано")).toBeVisible();

  await typeInEditor(ownerPage, "x = 'from owner'");
  await expect.poll(() => editorText(guestPage)).toContain("from owner");

  await guestPage.keyboard.press("Control+End");
  await typeInEditor(guestPage, " # and guest");
  await expect.poll(() => editorText(ownerPage)).toContain("and guest");
  expect(await editorText(guestPage)).toBe(await editorText(ownerPage));
});

test("a read-only invite lets someone watch but not change the file", async ({
  browser,
  request,
}) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Только чтение");
  const file = await createFile(request, owner, project.id, "main.py");
  await setInviteRole(request, owner, project.id, "viewer");
  const watcher = await guest(request, "Наблюдатель");
  await join(request, watcher, project.inviteCode);

  const path = `/projects/${project.id}/files/${file.id}`;
  const ownerPage = await openAs(browser, owner, path);
  const watcherPage = await openAs(browser, watcher, path);

  await typeInEditor(ownerPage, "print('visible to all')");
  await expect.poll(() => editorText(watcherPage)).toContain("visible to all");
  await expect(watcherPage.getByText("Только чтение").first()).toBeVisible();

  await watcherPage.locator(".monaco-editor").first().click();
  await watcherPage.keyboard.type("HACKED");
  await ownerPage.waitForTimeout(1500);
  expect(await editorText(ownerPage)).not.toContain("HACKED");
});

test("chat messages and presence reach everyone in the project", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Чат");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const ownerPage = await openAs(browser, owner, `/projects/${project.id}`);
  const guestPage = await openAs(browser, visitor, `/projects/${project.id}`);

  await expect(ownerPage.getByTitle("в сети")).toHaveCount(2);

  await ownerPage.getByPlaceholder("Сообщение...").fill("привет из e2e");
  await ownerPage.keyboard.press("Enter");
  await expect(guestPage.getByText("привет из e2e")).toBeVisible();
});

test("a markdown document renders a live preview for everyone", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Документы");
  const doc = await createFile(request, owner, project.id, "README.md", "doc");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const path = `/projects/${project.id}/files/${doc.id}`;
  const ownerPage = await openAs(browser, owner, path);
  const guestPage = await openAs(browser, visitor, path);

  await typeInEditor(ownerPage, "# Заголовок задания");
  await expect(guestPage.locator(".markdown-body h1")).toHaveText("Заголовок задания");
});

test("code run output is shared with everyone in the project", async ({ browser, request }) => {
  test.skip(process.env.E2E_RUNNER !== "1", "needs the runner service and Docker");

  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Запуск");
  const file = await createFile(request, owner, project.id, "main.py");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const path = `/projects/${project.id}/files/${file.id}`;
  const ownerPage = await openAs(browser, owner, path);
  const guestPage = await openAs(browser, visitor, path);

  await typeInEditor(ownerPage, "print(6 * 7)");
  await ownerPage.getByRole("button", { name: "Запустить" }).click();

  await expect(guestPage.locator("pre")).toContainText("42", { timeout: 40_000 });
  await expect(ownerPage.locator("pre")).toContainText("42");
});

test("a shape drawn on the board appears for everyone and can be undone", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Доска");
  const board = await createFile(request, owner, project.id, "ideas.board", "board");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const path = `/projects/${project.id}/files/${board.id}`;
  const ownerPage = await openAs(browser, owner, path);
  const guestPage = await openAs(browser, visitor, path);
  const ownerBoard = ownerPage.locator("[data-shape-count]");
  const guestBoard = guestPage.locator("[data-shape-count]");
  await expect(ownerBoard).toHaveAttribute("data-shape-count", "0");

  await ownerPage.getByRole("button", { name: "Прямоугольник" }).click();
  const canvas = ownerPage.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("board canvas is not visible");
  await ownerPage.mouse.move(box.x + 80, box.y + 80);
  await ownerPage.mouse.down();
  await ownerPage.mouse.move(box.x + 220, box.y + 180, { steps: 8 });
  await ownerPage.mouse.up();

  await expect(ownerBoard).toHaveAttribute("data-shape-count", "1");
  await expect(guestBoard).toHaveAttribute("data-shape-count", "1");

  await ownerPage.getByRole("button", { name: "Отменить" }).click();
  await expect(guestBoard).toHaveAttribute("data-shape-count", "0");
});

test("a file can be created from the sidebar and the theme choice is remembered", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Интерфейс");
  const page = await openAs(browser, owner, `/projects/${project.id}`);

  await page.getByRole("button", { name: "Создать: документ" }).click();
  await page.getByLabel("Имя файла").fill("заметки.md");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("link", { name: "заметки.md" })).toBeVisible();
  await expect(page).toHaveURL(/\/files\//);

  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const before = await theme();
  await page.getByRole("button", { name: "Меню профиля" }).click();
  await page.getByRole("menuitem", { name: /тема/ }).click();
  const after = await theme();
  expect(after).not.toBe(before);

  await page.reload();
  expect(await theme()).toBe(after);
});
